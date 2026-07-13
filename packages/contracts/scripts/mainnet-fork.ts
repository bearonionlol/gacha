import { spawn, execFile, type ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import path from "node:path";
import { promisify } from "node:util";
import { getAddress, isAddress, keccak256, ZeroAddress } from "ethers";
import {
  LOCAL_CONTRACT_NAMES,
  LOCAL_HOST,
  LOCAL_PORT,
  assertLocalDeploymentRegistry,
  assertPortAvailable,
  runLocalEnvironment,
  withExclusiveFileLock,
  withPreservedFile,
  type LocalStage
} from "./local";
import { MAINNET_DEPLOYMENT_CONFIRMATION } from "./mainnet-deployment-config";
import {
  FORK_LOCAL_CHAIN_ID,
  ROBINHOOD_MAINNET_CHAIN_ID,
  loadMainnetForkConfig,
  type ForkSourceConfig,
  type MainnetForkConfig
} from "./mainnet-fork-config";
import {
  collectArtifactEvidence,
  createReleaseManifest,
  writeReleaseManifest,
  type ArtifactEvidence,
  type CompilerEvidence,
  type StageTransactionMetrics
} from "./release-manifest";

const execFileAsync = promisify(execFile);
const FORK_READY_SIGNAL = "Started HTTP and WebSocket JSON-RPC server";
const PRODUCTION_FORK_STAGES = [
  { id: "deploy", label: "deploy the exact paused mainnet configuration", script: "scripts/deploy.ts" },
  { id: "smoke", label: "verify production wiring, handoff, and pause state", script: "scripts/smoke.ts" }
] as const;

type ProductionForkStage = (typeof PRODUCTION_FORK_STAGES)[number];

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

type ManagedProcess = {
  child: ChildProcess;
  description: string;
  completion: Promise<ProcessResult>;
  state: { finished: boolean; output: string; ready: boolean };
  redactions: readonly string[];
};

type RpcBlock = {
  number: string;
  hash: string;
  timestamp: string;
  baseFeePerGas?: string | null;
  transactions: Array<{
    hash: string;
    input: string;
    to: string | null;
  }>;
};

type RpcReceipt = {
  status: string;
  gasUsed: string;
};

type ForkBlockEvidence = {
  number: number;
  hash: string;
  timestamp: number;
  baseFeePerGasWei: bigint;
};

type GitSource = {
  commit: string;
  tree: string;
};

type ProductionForkEvidence = {
  forkContracts: Record<string, string>;
  roleHolderCodeHashes: Record<string, string>;
  compiler: CompilerEvidence;
  artifacts: ArtifactEvidence[];
  stageMetrics: StageTransactionMetrics[];
};

type DeploymentRegistry = {
  network?: unknown;
  chainId?: unknown;
  deployer?: unknown;
  timestamp?: unknown;
  randomnessProviderKind?: unknown;
  randomnessCoordinator?: unknown;
  launchState?: unknown;
  roleHolders?: unknown;
  contracts?: unknown;
};

export type ForkPipelineOptions<TNode, TResult> = {
  deploymentPath: string;
  ensurePortAvailable(): Promise<void>;
  startNode(): TNode | Promise<TNode>;
  waitForNode(node: TNode): Promise<void>;
  runStages(): Promise<TResult>;
  stopNode(node: TNode): Promise<void>;
};

class InterruptedError extends Error {
  constructor() {
    super("Mainnet fork rehearsal interrupted");
    this.name = "InterruptedError";
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new InterruptedError();
}

async function operationWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  aggregateMessage: string
): Promise<T> {
  let result: T | undefined;
  let operationError: unknown;
  try {
    result = await operation();
  } catch (error: unknown) {
    operationError = error;
  }

  let cleanupError: unknown;
  try {
    await cleanup();
  } catch (error: unknown) {
    cleanupError = error;
  }

  if (operationError !== undefined && cleanupError !== undefined) {
    throw new AggregateError([operationError, cleanupError], aggregateMessage);
  }
  if (operationError !== undefined) throw operationError;
  if (cleanupError !== undefined) throw cleanupError;
  return result as T;
}

export async function runForkRehearsalPipeline<TNode, TResult>(
  options: ForkPipelineOptions<TNode, TResult>
): Promise<TResult> {
  await options.ensurePortAvailable();
  const node = await options.startNode();
  return operationWithCleanup(
    async () => {
      await options.waitForNode(node);
      return withPreservedFile(options.deploymentPath, options.runStages);
    },
    () => options.stopNode(node),
    "Mainnet fork rehearsal failed and the isolated node could not be stopped"
  );
}

function redactedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const safe: NodeJS.ProcessEnv = { ...env };
  for (const key of Object.keys(safe)) {
    if (
      /(PRIVATE.?KEY|MNEMONIC|PASSWORD|AUTHORIZATION|RPC_HEADER_VALUE)/i.test(key) ||
      key === "ROBINHOOD_MAINNET_FORK_RPC_URL" ||
      key === "ROBINHOOD_MAINNET_RPC_URL"
    ) {
      delete safe[key];
    }
  }
  delete safe.GACHA_HARDHAT_MAINNET_FORK_MODE;
  delete safe.GACHA_MAINNET_FORK_REHEARSAL;
  delete safe.GACHA_DEVELOPMENT_MAINNET_FORK_REHEARSAL;
  delete safe.ROBINHOOD_MAINNET_FORK_BLOCK;
  delete safe.ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME;
  delete safe.ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT;
  return safe;
}

function redactOutput(value: string, redactions: readonly string[]): string {
  let output = value;
  for (const secret of redactions) {
    if (secret.length > 0) output = output.split(secret).join("[REDACTED]");
  }
  return output
    .replace(/https?:\/\/[^\s]+/gi, "[REDACTED_URL]")
    .replace(/0x[0-9a-fA-F]{64}/g, "[REDACTED_32_BYTE_VALUE]");
}

function startHardhatProcess(
  description: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  captureOutput: boolean,
  redactions: readonly string[] = []
): ManagedProcess {
  const packageRoot = path.resolve(__dirname, "..");
  const hardhatCli = require.resolve("hardhat/internal/cli/cli");
  const child = spawn(process.execPath, [hardhatCli, ...args], {
    cwd: packageRoot,
    detached: process.platform !== "win32",
    env: {
      ...env,
      HARDHAT_DISABLE_TELEMETRY_PROMPT: "true"
    },
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : ["ignore", "inherit", "inherit"]
  });
  const state = { finished: false, output: "", ready: false };
  if (captureOutput) {
    const capture = (chunk: Buffer | string): void => {
      state.output = `${state.output}${chunk.toString()}`.slice(-40_000);
      if (state.output.includes(FORK_READY_SIGNAL)) state.ready = true;
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
  }
  const completion = new Promise<ProcessResult>((resolve) => {
    child.once("error", (error) => {
      state.finished = true;
      resolve({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => {
      state.finished = true;
      resolve({ code, signal });
    });
  });
  return { child, description, completion, state, redactions };
}

function signalProcess(managed: ManagedProcess, signal: NodeJS.Signals): void {
  if (managed.state.finished || managed.child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      managed.child.kill(signal);
    } else {
      process.kill(-managed.child.pid, signal);
    }
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== "ESRCH") throw error;
  }
}

async function waitForCompletion(managed: ManagedProcess, timeoutMs: number): Promise<boolean> {
  if (managed.state.finished) return true;
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    managed.completion.then(() => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function terminateProcess(managed: ManagedProcess): Promise<void> {
  if (managed.state.finished) {
    await managed.completion;
    return;
  }
  signalProcess(managed, "SIGTERM");
  if (await waitForCompletion(managed, 5_000)) return;
  signalProcess(managed, "SIGKILL");
  if (!(await waitForCompletion(managed, 5_000))) {
    throw new Error(`Timed out while stopping ${managed.description}`);
  }
}

function processFailure(managed: ManagedProcess, result: ProcessResult): Error {
  const diagnostics = redactOutput(managed.state.output.trim(), managed.redactions);
  const suffix = diagnostics.length === 0 ? "" : `\n${diagnostics}`;
  if (result.error) {
    return new Error(`${managed.description} failed to start: ${result.error.message}${suffix}`);
  }
  if (result.signal) {
    return new Error(`${managed.description} exited after signal ${result.signal}${suffix}`);
  }
  return new Error(`${managed.description} exited with code ${result.code ?? "unknown"}${suffix}`);
}

async function rpcCall<T>(
  rpcUrl: string,
  headers: Readonly<Record<string, string>>,
  method: string,
  params: readonly unknown[],
  timeoutMs = 30_000
): Promise<T> {
  const endpoint = new URL(rpcUrl);
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
  const request = endpoint.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<T>((resolve, reject) => {
    const rpcRequest = request(
      {
        protocol: endpoint.protocol,
        hostname: endpoint.hostname,
        port: endpoint.port || undefined,
        path: `${endpoint.pathname}${endpoint.search}`,
        method: "POST",
        auth:
          endpoint.username.length > 0
            ? `${decodeURIComponent(endpoint.username)}:${decodeURIComponent(endpoint.password)}`
            : undefined,
        headers: {
          ...headers,
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        }
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          responseBody += chunk;
        });
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) {
              throw new Error(`RPC returned HTTP ${response.statusCode ?? "unknown"}`);
            }
            const payload = JSON.parse(responseBody) as {
              result?: T;
              error?: { code?: unknown; message?: unknown };
            };
            if (payload.error !== undefined) {
              throw new Error(
                `RPC ${method} failed with code ${String(payload.error.code)}`
              );
            }
            if (!("result" in payload)) throw new Error(`RPC ${method} returned no result`);
            resolve(payload.result as T);
          } catch (error: unknown) {
            reject(error);
          }
        });
      }
    );
    rpcRequest.setTimeout(timeoutMs, () => rpcRequest.destroy(new Error(`RPC ${method} timed out`)));
    rpcRequest.once("error", (error) => reject(new Error(`RPC ${method} request failed`, { cause: error })));
    rpcRequest.end(body);
  });
}

function parseHexInteger(value: string, label: string): number {
  if (!/^0x[0-9a-fA-F]+$/.test(value)) throw new Error(`${label} is not a hex integer`);
  const parsed = Number(BigInt(value));
  if (!Number.isSafeInteger(parsed)) throw new Error(`${label} exceeds the safe integer range`);
  return parsed;
}

function blockTag(blockNumber: number): string {
  return `0x${blockNumber.toString(16)}`;
}

async function verifyForkSource(
  source: ForkSourceConfig,
  expectedCoordinator: string,
  expectedCoordinatorCodeHash: string
): Promise<ForkBlockEvidence> {
  const chainId = await rpcCall<string>(source.rpcUrl, source.rpcHeaders, "eth_chainId", []);
  if (BigInt(chainId) !== BigInt(ROBINHOOD_MAINNET_CHAIN_ID)) {
    throw new Error(
      `Fork source chain ID ${BigInt(chainId)} does not match Robinhood mainnet ${ROBINHOOD_MAINNET_CHAIN_ID}`
    );
  }
  const tag = blockTag(source.blockNumber);
  const block = await rpcCall<RpcBlock | null>(
    source.rpcUrl,
    source.rpcHeaders,
    "eth_getBlockByNumber",
    [tag, false]
  );
  if (block === null || parseHexInteger(block.number, "fork block number") !== source.blockNumber) {
    throw new Error(`Pinned fork block ${source.blockNumber} is unavailable from the RPC endpoint`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(block.hash)) {
    throw new Error("Pinned fork block has an invalid hash");
  }
  const coordinatorCode = await rpcCall<string>(
    source.rpcUrl,
    source.rpcHeaders,
    "eth_getCode",
    [expectedCoordinator, tag]
  );
  const coordinatorCodeHash = keccak256(coordinatorCode).toLowerCase();
  if (coordinatorCode === "0x" || coordinatorCodeHash !== expectedCoordinatorCodeHash) {
    throw new Error(
      `Pinned randomness coordinator code hash ${coordinatorCodeHash} does not match ${expectedCoordinatorCodeHash}`
    );
  }
  const gasPrice =
    block.baseFeePerGas ??
    (await rpcCall<string>(source.rpcUrl, source.rpcHeaders, "eth_gasPrice", []));
  return {
    number: source.blockNumber,
    hash: block.hash.toLowerCase(),
    timestamp: parseHexInteger(block.timestamp, "fork block timestamp"),
    baseFeePerGasWei: BigInt(gasPrice)
  };
}

async function readGitSource(repositoryRoot: string): Promise<GitSource> {
  const status = await execFileAsync(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    { cwd: repositoryRoot }
  );
  if (status.stdout.trim().length > 0) {
    throw new Error(
      "Mainnet fork rehearsal requires a clean tracked worktree so source commit and artifact hashes are reproducible"
    );
  }
  const [commit, tree] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot }),
    execFileAsync("git", ["rev-parse", "HEAD^{tree}"], { cwd: repositoryRoot })
  ]);
  const commitHash = commit.stdout.trim().toLowerCase();
  const treeHash = tree.stdout.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitHash) || !/^[0-9a-f]{40}$/.test(treeHash)) {
    throw new Error("Git did not return valid source commit and tree hashes");
  }
  return { commit: commitHash, tree: treeHash };
}

function makeNodeEnvironment(config: MainnetForkConfig): NodeJS.ProcessEnv {
  const env = redactedEnvironment(process.env);
  env.GACHA_HARDHAT_MAINNET_FORK_MODE = "true";
  env.ROBINHOOD_MAINNET_FORK_RPC_URL = config.source.rpcUrl;
  env.ROBINHOOD_MAINNET_FORK_BLOCK = String(config.source.blockNumber);
  if (config.source.usesPublicRpcDevelopmentOverride) {
    env.ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT = "true";
  }
  const [header] = Object.entries(config.source.rpcHeaders);
  if (header !== undefined) {
    env.ROBINHOOD_MAINNET_FORK_RPC_HEADER_NAME = header[0];
    env.ROBINHOOD_MAINNET_FORK_RPC_HEADER_VALUE = header[1];
  }
  return env;
}

function makeStageEnvironment(config: MainnetForkConfig): NodeJS.ProcessEnv {
  return {
    ...redactedEnvironment(process.env),
    GACHA_LOCAL_RPC_URL: config.localRpcUrl,
    GACHA_MAINNET_FORK_REHEARSAL: "true",
    MAINNET_DEPLOYMENT_CONFIRMATION,
    MAINNET_RELEASE_DEPLOYER_ADDRESS: config.expected.deployer,
    MAINNET_RELEASE_ADMIN_ADDRESS: config.expected.admin,
    MAINNET_RELEASE_OPERATIONS_ADDRESS: config.expected.operations,
    MAINNET_RELEASE_GUARDIAN_ADDRESS: config.expected.guardian,
    MAINNET_RELEASE_TREASURY_ADDRESS: config.expected.treasury,
    ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS:
      config.expected.randomnessCoordinator,
    ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH:
      config.expected.randomnessCoordinatorCodeHash,
    ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI:
      config.expected.randomnessMaxRequestFeeWei
  };
}

async function waitForForkNode(
  managed: ManagedProcess,
  config: MainnetForkConfig,
  expectedBlockHash: string,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + 45_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (managed.state.finished) throw processFailure(managed, await managed.completion);
    try {
      const chainId = await rpcCall<string>(config.localRpcUrl, {}, "eth_chainId", [], 1_000);
      const currentBlock = await rpcCall<string>(
        config.localRpcUrl,
        {},
        "eth_blockNumber",
        [],
        1_000
      );
      const pinnedBlock = await rpcCall<RpcBlock | null>(
        config.localRpcUrl,
        {},
        "eth_getBlockByNumber",
        [blockTag(config.source.blockNumber), false],
        1_000
      );
      if (
        BigInt(chainId) === BigInt(FORK_LOCAL_CHAIN_ID) &&
        parseHexInteger(currentBlock, "local fork block") === config.source.blockNumber &&
        pinnedBlock?.hash.toLowerCase() === expectedBlockHash &&
        managed.state.ready
      ) {
        return;
      }
    } catch (error: unknown) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `Isolated Hardhat fork did not become ready within 45 seconds${
      lastError === undefined ? "" : `: ${errorMessage(lastError)}`
    }`
  );
}

async function runHardhatStage(
  stage: ProductionForkStage,
  config: MainnetForkConfig,
  signal: AbortSignal
): Promise<void> {
  throwIfAborted(signal);
  const managed = startHardhatProcess(
    stage.label,
    ["run", stage.script, "--network", "localhost"],
    makeStageEnvironment(config),
    false
  );
  const onAbort = (): void => {
    void terminateProcess(managed).catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    const result = await managed.completion;
    throwIfAborted(signal);
    if (result.error || result.signal || result.code !== 0) throw processFailure(managed, result);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function currentBlockNumber(localRpcUrl: string): Promise<number> {
  return parseHexInteger(
    await rpcCall<string>(localRpcUrl, {}, "eth_blockNumber", []),
    "local block number"
  );
}

async function collectStageMetrics(
  localRpcUrl: string,
  stage: string,
  firstBlock: number,
  lastBlock: number
): Promise<StageTransactionMetrics> {
  let transactionCount = 0;
  let contractCreationCount = 0;
  let gasUsed = 0n;
  let calldataBytes = 0;

  for (let blockNumber = firstBlock; blockNumber <= lastBlock; blockNumber++) {
    const block = await rpcCall<RpcBlock | null>(
      localRpcUrl,
      {},
      "eth_getBlockByNumber",
      [blockTag(blockNumber), true]
    );
    if (block === null) throw new Error(`Local transaction block ${blockNumber} is unavailable`);
    for (const transaction of block.transactions) {
      const receipt = await rpcCall<RpcReceipt | null>(
        localRpcUrl,
        {},
        "eth_getTransactionReceipt",
        [transaction.hash]
      );
      if (receipt === null || receipt.status !== "0x1") {
        throw new Error(`Transaction in ${stage} did not have a successful receipt`);
      }
      transactionCount += 1;
      if (transaction.to === null) contractCreationCount += 1;
      gasUsed += BigInt(receipt.gasUsed);
      if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(transaction.input)) {
        throw new Error(`Transaction in ${stage} has invalid calldata`);
      }
      calldataBytes += (transaction.input.length - 2) / 2;
    }
  }

  return {
    stage,
    firstBlock: transactionCount === 0 ? null : firstBlock,
    lastBlock: transactionCount === 0 ? null : lastBlock,
    transactionCount,
    contractCreationCount,
    gasUsed: gasUsed.toString(),
    calldataBytes
  };
}

export async function assertProductionForkDeploymentRegistry(
  deploymentPath: string,
  config: MainnetForkConfig
): Promise<Record<string, string>> {
  const parsed = JSON.parse(await readFile(deploymentPath, "utf8")) as DeploymentRegistry;
  const roleHolders = parsed.roleHolders;
  if (
    parsed.network !== "localhost" ||
    parsed.chainId !== FORK_LOCAL_CHAIN_ID ||
    parsed.deployer !== config.expected.deployer ||
    parsed.randomnessProviderKind !== "pinned-coordinator" ||
    parsed.randomnessCoordinator !== config.expected.randomnessCoordinator ||
    parsed.launchState !== "paused" ||
    typeof roleHolders !== "object" ||
    roleHolders === null ||
    Array.isArray(roleHolders) ||
    (roleHolders as Record<string, unknown>).protocolAdmin !== config.expected.admin ||
    (roleHolders as Record<string, unknown>).operations !== config.expected.operations ||
    (roleHolders as Record<string, unknown>).guardian !== config.expected.guardian ||
    (roleHolders as Record<string, unknown>).treasury !== config.expected.treasury ||
    typeof parsed.contracts !== "object" ||
    parsed.contracts === null ||
    Array.isArray(parsed.contracts)
  ) {
    throw new Error(
      "Fork deployment registry does not prove the exact paused mainnet configuration"
    );
  }
  await assertLocalDeploymentRegistry(deploymentPath);

  const contracts = parsed.contracts as Record<string, unknown>;
  return Object.fromEntries(
    LOCAL_CONTRACT_NAMES.map((name) => {
      const address = contracts[name];
      if (
        typeof address !== "string" ||
        !isAddress(address) ||
        address.toLowerCase() === ZeroAddress
      ) {
        throw new Error(`Fork deployment registry has an invalid ${name} address`);
      }
      return [name, getAddress(address)];
    })
  );
}

async function collectRoleHolderCodeHashes(
  config: MainnetForkConfig
): Promise<Record<string, string>> {
  const holders = {
    protocolAdmin: config.expected.admin,
    operations: config.expected.operations,
    guardian: config.expected.guardian,
    treasury: config.expected.treasury
  };
  const hashes: Record<string, string> = {};
  for (const [label, address] of Object.entries(holders)) {
    const code = await rpcCall<string>(
      config.localRpcUrl,
      {},
      "eth_getCode",
      [address, "latest"]
    );
    if (code === "0x") {
      throw new Error(`Production role holder ${label} at ${address} has no code`);
    }
    hashes[label] = keccak256(code).toLowerCase();
  }
  return hashes;
}

async function collectProductionForkEvidence(
  config: MainnetForkConfig,
  deploymentPath: string,
  signal: AbortSignal
): Promise<ProductionForkEvidence> {
  const stageMetrics: StageTransactionMetrics[] = [];
  let forkContracts: Record<string, string> | undefined;

  for (const [index, stage] of PRODUCTION_FORK_STAGES.entries()) {
    throwIfAborted(signal);
    const before = await currentBlockNumber(config.localRpcUrl);
    console.log(
      `[mainnet-fork] ${index + 1}/${PRODUCTION_FORK_STAGES.length}: ${stage.label}`
    );
    await runHardhatStage(stage, config, signal);
    if (stage.id === "deploy") {
      forkContracts = await assertProductionForkDeploymentRegistry(
        deploymentPath,
        config
      );
      console.log(
        `[mainnet-fork] verified ${LOCAL_CONTRACT_NAMES.length} exact production contracts`
      );
    }
    const after = await currentBlockNumber(config.localRpcUrl);
    stageMetrics.push(
      await collectStageMetrics(config.localRpcUrl, stage.id, before + 1, after)
    );
  }

  if (forkContracts === undefined) throw new Error("Fork deployment stage produced no registry");
  const deployMetrics = stageMetrics.find(({ stage }) => stage === "deploy");
  if (deployMetrics?.contractCreationCount !== LOCAL_CONTRACT_NAMES.length) {
    throw new Error(
      `Fork deployment created ${deployMetrics?.contractCreationCount ?? 0} contracts; expected ${LOCAL_CONTRACT_NAMES.length}`
    );
  }

  const artifactsRoot = path.resolve(__dirname, "../artifacts");
  const artifactEvidence = await collectArtifactEvidence(artifactsRoot);
  const roleHolderCodeHashes = await collectRoleHolderCodeHashes(config);
  return {
    forkContracts,
    roleHolderCodeHashes,
    compiler: artifactEvidence.compiler,
    artifacts: artifactEvidence.artifacts,
    stageMetrics
  };
}

export async function runMainnetForkRehearsal(signal: AbortSignal): Promise<string> {
  const repositoryRoot = path.resolve(__dirname, "../../..");
  const config = loadMainnetForkConfig(process.env, repositoryRoot);
  const source = await readGitSource(repositoryRoot);
  console.log(
    `[mainnet-fork] validating authenticated Robinhood mainnet source at pinned block ${config.source.blockNumber}`
  );
  const forkBlock = await verifyForkSource(
    config.source,
    config.expected.randomnessCoordinator,
    config.expected.randomnessCoordinatorCodeHash
  );
  const deploymentPath = path.join(repositoryRoot, "deployments", "localhost.json");
  if (path.resolve(config.manifestPath) === path.resolve(deploymentPath)) {
    throw new Error("MAINNET_RELEASE_MANIFEST_PATH cannot overwrite a deployment registry");
  }
  const lockPath = path.join(repositoryRoot, "deployments", ".mainnet-fork-rehearsal.lock");
  const nodeRedactions = [
    config.source.rpcUrl,
    ...Object.values(config.source.rpcHeaders)
  ];

  const productionEvidence = await withExclusiveFileLock(lockPath, async () =>
    runForkRehearsalPipeline({
      deploymentPath,
      ensurePortAvailable: () => assertPortAvailable(config.localHost, config.localPort),
      startNode: () => {
        throwIfAborted(signal);
        console.log(
          `[mainnet-fork] starting isolated Hardhat fork at ${config.localRpcUrl}`
        );
        return startHardhatProcess(
          "isolated Hardhat mainnet fork",
          ["node", "--hostname", config.localHost, "--port", String(config.localPort)],
          makeNodeEnvironment(config),
          true,
          nodeRedactions
        );
      },
      waitForNode: async (node) => {
        await waitForForkNode(node, config, forkBlock.hash, signal);
        console.log(
          `[mainnet-fork] isolated chain ${FORK_LOCAL_CHAIN_ID} mirrors block ${forkBlock.number}`
        );
      },
      runStages: () =>
        collectProductionForkEvidence(
          config,
          deploymentPath,
          signal
        ),
      stopNode: async (node) => {
        console.log("[mainnet-fork] stopping isolated Hardhat fork");
        await terminateProcess(node);
      }
    })
  );

  console.log(
    "[mainnet-fork] running the separate disposable commit/reveal collector journey"
  );
  const collectorStageMetrics: StageTransactionMetrics[] = [];
  const collectorStarts = new Map<LocalStage["id"], number>();
  const collectorRpcUrl = `http://${LOCAL_HOST}:${LOCAL_PORT}`;
  await runLocalEnvironment(signal, {
    beforeStage: async (stage) => {
      collectorStarts.set(stage.id, await currentBlockNumber(collectorRpcUrl));
    },
    afterStage: async (stage) => {
      const before = collectorStarts.get(stage.id);
      if (before === undefined) {
        throw new Error(`Collector stage ${stage.id} has no starting block`);
      }
      const after = await currentBlockNumber(collectorRpcUrl);
      collectorStageMetrics.push(
        await collectStageMetrics(collectorRpcUrl, stage.id, before + 1, after)
      );
    }
  });
  const finalSource = await readGitSource(repositoryRoot);
  if (finalSource.commit !== source.commit || finalSource.tree !== source.tree) {
    throw new Error("Git source changed during the mainnet fork rehearsal");
  }
  const manifest = createReleaseManifest({
    forkBlockNumber: forkBlock.number,
    forkBlockHash: forkBlock.hash,
    forkBlockTimestamp: forkBlock.timestamp,
    pinnedBlockBaseFeePerGasWei: forkBlock.baseFeePerGasWei,
    sourceCommit: source.commit,
    sourceTree: source.tree,
    compiler: productionEvidence.compiler,
    artifacts: productionEvidence.artifacts,
    expected: config.expected,
    forkContracts: productionEvidence.forkContracts,
    roleHolderCodeHashes: productionEvidence.roleHolderCodeHashes,
    stageMetrics: productionEvidence.stageMetrics,
    collectorStageMetrics,
    usesPublicRpcDevelopmentOverride:
      config.source.usesPublicRpcDevelopmentOverride
  });
  await writeReleaseManifest(config.manifestPath, manifest);
  console.log(`[mainnet-fork] wrote release plan ${config.manifestPath}`);
  console.log("[mainnet-fork] no transaction was broadcast to Robinhood mainnet");
  return config.manifestPath;
}

async function main(): Promise<void> {
  const controller = new AbortController();
  let interruptedBy: NodeJS.Signals | undefined;
  const interrupt = (signal: NodeJS.Signals): void => {
    if (interruptedBy === undefined) {
      interruptedBy = signal;
      console.error(`[mainnet-fork] received ${signal}; cleaning up`);
      controller.abort();
    }
  };
  const onSigint = (): void => interrupt("SIGINT");
  const onSigterm = (): void => interrupt("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    await runMainnetForkRehearsal(controller.signal);
    if (interruptedBy !== undefined) process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
  } catch (error: unknown) {
    if (interruptedBy !== undefined && error instanceof InterruptedError) {
      console.error(`[mainnet-fork] interrupted by ${interruptedBy}; cleanup complete`);
      process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
    } else {
      console.error(`[mainnet-fork] failed: ${redactOutput(errorMessage(error), [])}`);
      process.exitCode = 1;
    }
  } finally {
    process.removeListener("SIGINT", onSigint);
    process.removeListener("SIGTERM", onSigterm);
  }
}

if (require.main === module) {
  void main();
}
