import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { createServer } from "node:net";
import path from "node:path";
import { isAddress, ZeroAddress } from "ethers";

export const LOCAL_HOST = "127.0.0.1";
export const LOCAL_PORT = 8545;
export const LOCAL_LOCK_OWNER_FILE = "owner.json";

export const LOCAL_CONTRACT_NAMES = [
  "InventoryRegistry",
  "ItemToken",
  "CommitRevealRandomnessProvider",
  "PackSale",
  "Marketplace",
  "BuybackVault",
  "Forge",
  "RedemptionRegistry",
  "DustLedger",
  "DustRewardPolicy",
  "CollectibleForgePolicy",
  "TradeInVault",
  "TierPool",
  "VaultPassport",
  "VaultForge"
] as const;

export const LOCAL_STAGES = [
  { id: "deploy", label: "deploy all 15 contracts", script: "scripts/deploy.ts" },
  { id: "seed", label: "seed the deployment", script: "scripts/seed.ts" },
  { id: "initial-smoke", label: "run the initial smoke check", script: "scripts/smoke.ts" },
  { id: "rehearse", label: "run the collector rehearsal", script: "scripts/rehearse.ts" },
  { id: "final-smoke", label: "run the final smoke check", script: "scripts/smoke.ts" }
] as const;

export type LocalStage = (typeof LOCAL_STAGES)[number];

export type LocalEnvironmentObserver = {
  beforeStage?(stage: LocalStage): Promise<void>;
  afterStage?(stage: LocalStage): Promise<void>;
};

type FileSnapshot =
  | { exists: false }
  | { exists: true; contents: Buffer; mode: number };

type ProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
};

type ManagedProcess = {
  child: ChildProcess;
  description: string;
  completion: Promise<ProcessResult>;
  state: { finished: boolean; output: string; readySignal: boolean };
};

type LockOwner = {
  pid: number;
  token?: string;
};

export type LocalPipelineOptions<TNode> = {
  deploymentPath: string;
  ensurePortAvailable(): Promise<void>;
  startNode(): TNode | Promise<TNode>;
  waitForNode(node: TNode): Promise<void>;
  runStage(stage: LocalStage, index: number): Promise<void>;
  stopNode(node: TNode): Promise<void>;
};

class InterruptedError extends Error {
  constructor() {
    super("Local contract environment interrupted");
    this.name = "InterruptedError";
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runWithCleanup<T>(
  operation: () => Promise<T>,
  cleanup: () => Promise<void>,
  aggregateMessage: string
): Promise<T> {
  let value: T | undefined;
  let operationFailed = false;
  let operationError: unknown;

  try {
    value = await operation();
  } catch (error: unknown) {
    operationFailed = true;
    operationError = error;
  }

  let cleanupFailed = false;
  let cleanupError: unknown;
  try {
    await cleanup();
  } catch (error: unknown) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (operationFailed && cleanupFailed) {
    throw new AggregateError([operationError, cleanupError], aggregateMessage);
  }
  if (operationFailed) {
    throw operationError;
  }
  if (cleanupFailed) {
    throw cleanupError;
  }

  return value as T;
}

async function captureFile(filePath: string): Promise<FileSnapshot> {
  try {
    const [contents, fileStat] = await Promise.all([readFile(filePath), stat(filePath)]);
    if (!fileStat.isFile()) {
      throw new Error(`Expected ${filePath} to be a regular file`);
    }
    return { exists: true, contents, mode: fileStat.mode & 0o777 };
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
}

async function restoreFile(filePath: string, snapshot: FileSnapshot): Promise<void> {
  if (!snapshot.exists) {
    await rm(filePath, { force: true });
    return;
  }

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, snapshot.contents, { mode: snapshot.mode });
  await chmod(filePath, snapshot.mode);
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    return isErrnoException(error) && error.code === "EPERM";
  }
}

function parseLockOwner(rawOwner: string): LockOwner | undefined {
  try {
    const parsed = JSON.parse(rawOwner) as { pid?: unknown; token?: unknown };
    if (typeof parsed.pid === "number" && Number.isSafeInteger(parsed.pid) && parsed.pid > 0) {
      return {
        pid: parsed.pid,
        token: typeof parsed.token === "string" && parsed.token.length > 0 ? parsed.token : undefined
      };
    }
  } catch {
    const legacyPid = Number.parseInt(rawOwner.trim(), 10);
    if (Number.isSafeInteger(legacyPid) && legacyPid > 0) {
      return { pid: legacyPid };
    }
  }
  return undefined;
}

async function readLockOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    return parseLockOwner(await readFile(path.join(lockPath, LOCAL_LOCK_OWNER_FILE), "utf8"));
  } catch (error: unknown) {
    if (!isErrnoException(error)) throw error;
    if (error.code === "ENOENT") return undefined;
    if (error.code !== "ENOTDIR") throw error;
  }

  try {
    return parseLockOwner(await readFile(lockPath, "utf8"));
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function acquireFileLock(lockPath: string): Promise<Required<LockOwner>> {
  await mkdir(path.dirname(lockPath), { recursive: true });
  const owner = { pid: process.pid, token: randomUUID() };

  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== "EEXIST") throw error;
    const existingOwner = await readLockOwner(lockPath);
    if (existingOwner !== undefined && isProcessRunning(existingOwner.pid)) {
      throw new Error(`Local contract environment is already running with PID ${existingOwner.pid}`);
    }
    if (existingOwner !== undefined) {
      throw new Error(
        `Stale local contract environment lock at ${lockPath} belongs to stopped PID ${existingOwner.pid}; remove the lock only after verifying no local run is active`
      );
    }
    throw new Error(
      `Local contract environment lock at ${lockPath} is being acquired or has no readable owner; do not remove it while another run may be starting`
    );
  }

  try {
    await writeFile(
      path.join(lockPath, LOCAL_LOCK_OWNER_FILE),
      `${JSON.stringify(owner)}\n`,
      { flag: "wx", mode: 0o600 }
    );
    return owner;
  } catch (error: unknown) {
    await rm(lockPath, { recursive: true, force: true });
    throw error;
  }
}

export async function withExclusiveFileLock<T>(
  lockPath: string,
  operation: () => Promise<T>
): Promise<T> {
  const owner = await acquireFileLock(lockPath);
  return runWithCleanup(
    operation,
    async () => {
      const currentOwner = await readLockOwner(lockPath);
      if (currentOwner?.pid !== owner.pid || currentOwner.token !== owner.token) {
        throw new Error(`Local contract environment lock ownership changed at ${lockPath}`);
      }
      await rm(lockPath, { recursive: true });
    },
    `Local operation failed and lock ${lockPath} could not be released`
  );
}

export async function withPreservedFile<T>(
  filePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const snapshot = await captureFile(filePath);
  return runWithCleanup(
    operation,
    () => restoreFile(filePath, snapshot),
    `Operation failed and ${filePath} could not be restored`
  );
}

export async function runLocalPipeline<TNode>(
  options: LocalPipelineOptions<TNode>
): Promise<void> {
  await options.ensurePortAvailable();
  const node = await options.startNode();

  await runWithCleanup(
    async () => {
      await options.waitForNode(node);
      await withPreservedFile(options.deploymentPath, async () => {
        for (const [index, stage] of LOCAL_STAGES.entries()) {
          await options.runStage(stage, index);
        }
      });
    },
    () => options.stopNode(node),
    "Local contract pipeline failed and the Hardhat node could not be stopped"
  );
}

export async function assertPortAvailable(
  host: string = LOCAL_HOST,
  port: number = LOCAL_PORT
): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen({ host, port, exclusive: true }, () => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    });
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === "EADDRINUSE") {
      throw new Error(
        `Cannot start the local contract environment: ${host}:${port} is already in use`
      );
    }
    throw new Error(
      `Cannot reserve ${host}:${port} for the local Hardhat node: ${errorMessage(error)}`,
      { cause: error }
    );
  }
}

export async function assertLocalDeploymentRegistry(filePath: string): Promise<number> {
  const raw = await readFile(filePath, "utf8");
  const deployment = JSON.parse(raw) as {
    network?: unknown;
    chainId?: unknown;
    contracts?: unknown;
  };

  if (deployment.network !== "localhost" || deployment.chainId !== 31_337) {
    throw new Error(`${filePath} is not a localhost chain 31337 deployment registry`);
  }
  if (
    typeof deployment.contracts !== "object"
      || deployment.contracts === null
      || Array.isArray(deployment.contracts)
  ) {
    throw new Error(`${filePath} does not contain a contracts object`);
  }

  const contracts = deployment.contracts as Record<string, unknown>;
  const deployedNames = Object.keys(contracts);
  if (deployedNames.length !== LOCAL_CONTRACT_NAMES.length) {
    throw new Error(
      `${filePath} contains ${deployedNames.length} contracts; expected ${LOCAL_CONTRACT_NAMES.length}`
    );
  }

  const normalizedAddresses: string[] = [];
  for (const name of LOCAL_CONTRACT_NAMES) {
    const address = contracts[name];
    if (typeof address !== "string" || !isAddress(address) || address.toLowerCase() === ZeroAddress) {
      throw new Error(`${filePath} has a missing or invalid ${name} address`);
    }
    normalizedAddresses.push(address.toLowerCase());
  }

  if (new Set(normalizedAddresses).size !== LOCAL_CONTRACT_NAMES.length) {
    throw new Error(`${filePath} reuses a contract address`);
  }

  return deployedNames.length;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new InterruptedError();
  }
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new InterruptedError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function startManagedProcess(
  description: string,
  args: readonly string[],
  outputMode: "inherit" | "capture" = "inherit"
): ManagedProcess {
  const packageRoot = path.resolve(__dirname, "..");
  const hardhatCli = require.resolve("hardhat/internal/cli/cli");
  const child = spawn(process.execPath, [hardhatCli, ...args], {
    cwd: packageRoot,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      HARDHAT_DISABLE_TELEMETRY_PROMPT: "true"
    },
    stdio:
      outputMode === "inherit"
        ? ["ignore", "inherit", "inherit"]
        : ["ignore", "pipe", "pipe"]
  });
  const state = { finished: false, output: "", readySignal: false };
  if (outputMode === "capture") {
    const captureOutput = (chunk: Buffer | string): void => {
      state.output = `${state.output}${chunk.toString()}`.slice(-20_000);
      if (state.output.includes("Started HTTP and WebSocket JSON-RPC server")) {
        state.readySignal = true;
      }
    };
    child.stdout?.on("data", captureOutput);
    child.stderr?.on("data", captureOutput);
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

  return { child, description, completion, state };
}

function signalProcess(managed: ManagedProcess, signal: NodeJS.Signals): void {
  if (managed.state.finished || managed.child.pid === undefined) {
    return;
  }

  try {
    if (process.platform === "win32") {
      managed.child.kill(signal);
    } else {
      process.kill(-managed.child.pid, signal);
    }
  } catch (error: unknown) {
    if (!isErrnoException(error) || error.code !== "ESRCH") {
      throw error;
    }
  }
}

function waitForCompletion(managed: ManagedProcess, timeoutMs: number): Promise<boolean> {
  if (managed.state.finished) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    managed.completion.then(() => {
      clearTimeout(timer);
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
  if (await waitForCompletion(managed, 5_000)) {
    return;
  }

  signalProcess(managed, "SIGKILL");
  if (!(await waitForCompletion(managed, 5_000))) {
    throw new Error(`Timed out while stopping ${managed.description}`);
  }
}

function processFailure(managed: ManagedProcess, result: ProcessResult): Error {
  const diagnostics = managed.state.output.trim();
  const diagnosticsSuffix = diagnostics.length === 0 ? "" : `\n${diagnostics}`;
  if (result.error) {
    return new Error(
      `${managed.description} failed to start: ${result.error.message}${diagnosticsSuffix}`,
      { cause: result.error }
    );
  }
  if (result.signal) {
    return new Error(
      `${managed.description} exited after signal ${result.signal}${diagnosticsSuffix}`
    );
  }
  return new Error(
    `${managed.description} exited with code ${result.code ?? "unknown"}${diagnosticsSuffix}`
  );
}

async function runHardhatStage(stage: LocalStage, signal: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  const managed = startManagedProcess(stage.label, [
    "run",
    stage.script,
    "--network",
    "localhost"
  ]);
  const onAbort = (): void => {
    void terminateProcess(managed).catch(() => undefined);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    const result = await managed.completion;
    throwIfAborted(signal);
    if (result.error || result.signal || result.code !== 0) {
      throw processFailure(managed, result);
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

function queryChainId(host: string, port: number): Promise<string> {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] });

  return new Promise<string>((resolve, reject) => {
    const rpcRequest = request(
      {
        host,
        port,
        path: "/",
        method: "POST",
        headers: {
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
            const payload = JSON.parse(responseBody) as { result?: unknown };
            if (typeof payload.result !== "string") {
              throw new Error("RPC response did not contain eth_chainId");
            }
            resolve(payload.result);
          } catch (error: unknown) {
            reject(error);
          }
        });
      }
    );
    rpcRequest.setTimeout(1_000, () => {
      rpcRequest.destroy(new Error("RPC readiness request timed out"));
    });
    rpcRequest.once("error", reject);
    rpcRequest.end(body);
  });
}

async function waitForHardhatNode(
  managed: ManagedProcess,
  signal: AbortSignal
): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastRpcError: unknown;

  while (Date.now() < deadline) {
    throwIfAborted(signal);
    if (managed.state.finished) {
      throw processFailure(managed, await managed.completion);
    }

    let chainId: string | undefined;
    try {
      chainId = await queryChainId(LOCAL_HOST, LOCAL_PORT);
    } catch (error: unknown) {
      lastRpcError = error;
    }

    if (chainId !== undefined) {
      if (chainId !== "0x7a69") {
        throw new Error(
          `RPC at ${LOCAL_HOST}:${LOCAL_PORT} reported chain ID ${chainId}; expected 0x7a69`
        );
      }
      if (managed.state.finished) {
        throw processFailure(managed, await managed.completion);
      }
      if (managed.state.readySignal) {
        return;
      }
    }

    await abortableDelay(200, signal);
  }

  throw new Error(
    `Hardhat node did not become ready at http://${LOCAL_HOST}:${LOCAL_PORT} within 30 seconds${
      lastRpcError === undefined ? "" : `: ${errorMessage(lastRpcError)}`
    }`
  );
}

export async function runLocalEnvironment(
  signal: AbortSignal,
  observer: LocalEnvironmentObserver = {}
): Promise<void> {
  const repositoryRoot = path.resolve(__dirname, "../../..");
  const deploymentPath = path.join(repositoryRoot, "deployments", "localhost.json");
  const lockPath = path.join(repositoryRoot, "deployments", ".local-environment.lock");

  console.log(`[local] checking http://${LOCAL_HOST}:${LOCAL_PORT}`);
  await withExclusiveFileLock(lockPath, async () => {
    await runLocalPipeline({
      deploymentPath,
      ensurePortAvailable: () => assertPortAvailable(),
      startNode: () => {
        throwIfAborted(signal);
        console.log("[local] starting ephemeral Hardhat node");
        return startManagedProcess(
          "Hardhat node",
          ["node", "--hostname", LOCAL_HOST, "--port", String(LOCAL_PORT)],
          "capture"
        );
      },
      waitForNode: async (node) => {
        await waitForHardhatNode(node, signal);
        console.log(`[local] Hardhat node ready on chain 31337`);
      },
      runStage: async (stage, index) => {
        console.log(`[local] ${index + 1}/${LOCAL_STAGES.length}: ${stage.label}`);
        await observer.beforeStage?.(stage);
        await runHardhatStage(stage, signal);
        if (stage.id === "deploy") {
          const contractCount = await assertLocalDeploymentRegistry(deploymentPath);
          console.log(`[local] verified deployment registry with ${contractCount} contracts`);
        }
        await observer.afterStage?.(stage);
      },
      stopNode: async (node) => {
        console.log("[local] stopping ephemeral Hardhat node");
        await terminateProcess(node);
      }
    });
  });

  console.log("[local] deploy, seed, smoke, rehearsal, and final smoke passed; transient state cleaned");
}

async function main(): Promise<void> {
  const controller = new AbortController();
  let interruptedBy: NodeJS.Signals | undefined;
  const interrupt = (signal: NodeJS.Signals): void => {
    if (interruptedBy === undefined) {
      interruptedBy = signal;
      console.error(`[local] received ${signal}; cleaning up`);
      controller.abort();
    }
  };
  const onSigint = (): void => interrupt("SIGINT");
  const onSigterm = (): void => interrupt("SIGTERM");
  process.on("SIGINT", onSigint);
  process.on("SIGTERM", onSigterm);

  try {
    await runLocalEnvironment(controller.signal);
    if (interruptedBy !== undefined) {
      process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
    }
  } catch (error: unknown) {
    if (interruptedBy !== undefined && error instanceof InterruptedError) {
      console.error(`[local] interrupted by ${interruptedBy}; cleanup complete`);
      process.exitCode = interruptedBy === "SIGINT" ? 130 : 143;
    } else {
      console.error("[local] failed", error);
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
