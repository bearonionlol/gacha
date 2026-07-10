import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import { getAddress, isAddress, ZeroAddress } from "ethers";
import { LOCAL_CONTRACT_NAMES } from "./local";
import {
  FORK_LOCAL_CHAIN_ID,
  ROBINHOOD_MAINNET_CHAIN_ID,
  type ExpectedReleaseInputs
} from "./mainnet-fork-config";

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;
export const MAINNET_TARGET_CONTRACT_NAMES = LOCAL_CONTRACT_NAMES.map((name) =>
  name === "CommitRevealRandomnessProvider" ? "CoordinatorRandomnessProvider" : name
);
export const RELEASE_ARTIFACT_NAMES = [
  ...LOCAL_CONTRACT_NAMES,
  "CoordinatorRandomnessProvider"
] as const;

export type StageTransactionMetrics = {
  stage: string;
  firstBlock: number | null;
  lastBlock: number | null;
  transactionCount: number;
  contractCreationCount: number;
  gasUsed: string;
  calldataBytes: number;
};

export type ArtifactEvidence = {
  contractName: string;
  sourceName: string;
  purpose: "fork-rehearsal" | "mainnet-target" | "fork-and-mainnet";
  artifactSha256: string;
  creationBytecodeSha256: string;
  runtimeBytecodeSha256: string;
  compilerVersion: string;
  compilerInputSha256: string;
};

export type CompilerEvidence = {
  versions: string[];
  inputSha256: string[];
};

export type ReleaseManifestBody = {
  schemaVersion: 1;
  kind: "robinhood-mainnet-release-plan";
  broadcastPolicy: "fork-only-never-broadcast";
  releaseEligibility: "production-candidate" | "development-only";
  developmentOverrides: string[];
  target: {
    network: "robinhoodMainnet";
    chainId: number;
    forkBlockNumber: number;
    forkBlockHash: string;
    forkBlockTimestamp: number;
  };
  source: {
    commit: string;
    tree: string;
  };
  compiler: CompilerEvidence;
  artifacts: ArtifactEvidence[];
  expectedInputs: {
    executionStatus: "verified-by-production-fork";
    deployer: string;
    roles: Record<string, string>;
    treasuries: Record<string, string>;
    randomness: {
      kind: "pinned-coordinator";
      coordinator: string;
      coordinatorCodeHash: string;
      maxRequestFeeWei: string;
    };
  };
  forkEvidence: {
    localChainId: number;
    randomnessKind: "pinned-coordinator";
    launchState: "paused";
    roleHandoff: "verified";
    deployerPrivilegeState: "revoked";
    treasuryWiring: "verified";
    pausedContracts: Record<string, true>;
    roleHolderCodeHashes: Record<string, string>;
    privateCanaryActivation: "separate-reviewed-multisig-operation";
    contracts: Record<string, string>;
    transactionMetrics: {
      stages: StageTransactionMetrics[];
      total: StageTransactionMetrics;
    };
    collectorRehearsal: {
      status: "passed";
      localChainId: number;
      randomnessKind: "commit-reveal-demo-local-only";
      transactionMetrics: {
        stages: StageTransactionMetrics[];
        total: StageTransactionMetrics;
      };
    };
  };
  gasBudget: {
    basis: "fork-deployment-and-role-wiring";
    measuredDeploymentGas: string;
    gasContingencyBps: number;
    recommendedDeploymentGas: string;
    pinnedBlockBaseFeePerGasWei: string;
    feeContingencyBps: number;
    recommendedFundingWei: string;
  };
};

export type ReleaseManifest = ReleaseManifestBody & {
  integrity: {
    algorithm: "sha256";
    canonicalBodySha256: string;
  };
};

type HardhatArtifact = {
  contractName?: unknown;
  sourceName?: unknown;
  bytecode?: unknown;
  deployedBytecode?: unknown;
};

type HardhatDebugArtifact = {
  buildInfo?: unknown;
};

type HardhatBuildInfo = {
  solcVersion?: unknown;
  input?: unknown;
};

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function sha256HexBytecode(value: string, label: string): string {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error(`${label} is not complete hex bytecode`);
  }
  return sha256(Buffer.from(value.slice(2), "hex"));
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalize(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(",")}}`;
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function artifactPurpose(contractName: string): ArtifactEvidence["purpose"] {
  if (contractName === "CommitRevealRandomnessProvider") return "fork-rehearsal";
  if (contractName === "CoordinatorRandomnessProvider") return "mainnet-target";
  return "fork-and-mainnet";
}

export async function collectArtifactEvidence(
  artifactsRoot: string
): Promise<{ compiler: CompilerEvidence; artifacts: ArtifactEvidence[] }> {
  const files = await listFiles(path.join(artifactsRoot, "contracts"));
  const evidence: ArtifactEvidence[] = [];

  for (const contractName of RELEASE_ARTIFACT_NAMES) {
    const candidates = files.filter(
      (filePath) => path.basename(filePath) === `${contractName}.json`
    );
    let selected:
      | { path: string; raw: Buffer; artifact: HardhatArtifact }
      | undefined;
    for (const candidate of candidates) {
      const raw = await readFile(candidate);
      const artifact = JSON.parse(raw.toString("utf8")) as HardhatArtifact;
      if (artifact.contractName === contractName) {
        if (selected !== undefined) {
          throw new Error(`Multiple Hardhat artifacts found for ${contractName}`);
        }
        selected = { path: candidate, raw, artifact };
      }
    }
    if (selected === undefined) {
      throw new Error(`Missing Hardhat artifact for ${contractName}`);
    }

    const { artifact } = selected;
    if (
      typeof artifact.sourceName !== "string" ||
      typeof artifact.bytecode !== "string" ||
      typeof artifact.deployedBytecode !== "string"
    ) {
      throw new Error(`Hardhat artifact for ${contractName} is incomplete`);
    }
    const debugPath = path.join(path.dirname(selected.path), `${contractName}.dbg.json`);
    const debug = JSON.parse(await readFile(debugPath, "utf8")) as HardhatDebugArtifact;
    if (typeof debug.buildInfo !== "string") {
      throw new Error(`Hardhat debug artifact for ${contractName} has no build info`);
    }
    const buildInfoPath = path.resolve(path.dirname(debugPath), debug.buildInfo);
    const buildInfo = JSON.parse(await readFile(buildInfoPath, "utf8")) as HardhatBuildInfo;
    if (typeof buildInfo.solcVersion !== "string" || buildInfo.input === undefined) {
      throw new Error(`Hardhat build info for ${contractName} is incomplete`);
    }

    evidence.push({
      contractName,
      sourceName: artifact.sourceName,
      purpose: artifactPurpose(contractName),
      artifactSha256: sha256(selected.raw),
      creationBytecodeSha256: sha256HexBytecode(
        artifact.bytecode,
        `${contractName} creation bytecode`
      ),
      runtimeBytecodeSha256: sha256HexBytecode(
        artifact.deployedBytecode,
        `${contractName} runtime bytecode`
      ),
      compilerVersion: buildInfo.solcVersion,
      compilerInputSha256: sha256(canonicalize(buildInfo.input))
    });
  }

  const versions = [...new Set(evidence.map(({ compilerVersion }) => compilerVersion))].sort();
  const inputSha256 = [
    ...new Set(evidence.map(({ compilerInputSha256 }) => compilerInputSha256))
  ].sort();
  return { compiler: { versions, inputSha256 }, artifacts: evidence };
}

function sumStageMetrics(stages: readonly StageTransactionMetrics[]): StageTransactionMetrics {
  const nonEmpty = stages.filter(({ transactionCount }) => transactionCount > 0);
  return {
    stage: "total",
    firstBlock:
      nonEmpty.length === 0 ? null : Math.min(...nonEmpty.map(({ firstBlock }) => firstBlock!)),
    lastBlock:
      nonEmpty.length === 0 ? null : Math.max(...nonEmpty.map(({ lastBlock }) => lastBlock!)),
    transactionCount: stages.reduce((total, stage) => total + stage.transactionCount, 0),
    contractCreationCount: stages.reduce(
      (total, stage) => total + stage.contractCreationCount,
      0
    ),
    gasUsed: stages
      .reduce((total, stage) => total + BigInt(stage.gasUsed), 0n)
      .toString(),
    calldataBytes: stages.reduce((total, stage) => total + stage.calldataBytes, 0)
  };
}

function expectedRoleInputs(expected: ExpectedReleaseInputs): Record<string, string> {
  return {
    defaultAdmin: expected.admin,
    inventoryAdmin: expected.operations,
    tokenUriSetter: expected.operations,
    randomnessFundAdmin: expected.operations,
    dropAdmin: expected.operations,
    marketAdmin: expected.operations,
    buybackAdmin: expected.operations,
    forgeRecipeAdmin: expected.operations,
    craftReviewer: expected.operations,
    redemptionAdmin: expected.operations,
    policyAdmin: expected.operations,
    custodyAdmin: expected.operations,
    tierPoolAdmin: expected.operations,
    vaultForgeRecipeAdmin: expected.operations,
    itemTokenPauser: expected.guardian,
    packSalePauser: expected.guardian,
    marketplacePauser: expected.guardian,
    buybackVaultPauser: expected.guardian,
    forgePauser: expected.guardian,
    redemptionRegistryPauser: expected.guardian,
    dustLedgerPauser: expected.guardian,
    tierPoolPauser: expected.guardian,
    vaultForgePauser: expected.guardian
  };
}

function expectedTreasuryInputs(treasury: string): Record<string, string> {
  return {
    packSale: treasury,
    marketplace: treasury,
    forge: treasury,
    vaultForge: treasury
  };
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  return (
    actual.length === expected.length &&
    [...expected].sort().every((key, index) => actual[index] === key)
  );
}

function metricsEqual(
  actual: StageTransactionMetrics,
  expected: StageTransactionMetrics
): boolean {
  return (
    actual.stage === expected.stage &&
    actual.firstBlock === expected.firstBlock &&
    actual.lastBlock === expected.lastBlock &&
    actual.transactionCount === expected.transactionCount &&
    actual.contractCreationCount === expected.contractCreationCount &&
    actual.gasUsed === expected.gasUsed &&
    actual.calldataBytes === expected.calldataBytes
  );
}

export function createReleaseManifest(input: {
  forkBlockNumber: number;
  forkBlockHash: string;
  forkBlockTimestamp: number;
  pinnedBlockBaseFeePerGasWei: bigint;
  sourceCommit: string;
  sourceTree: string;
  compiler: CompilerEvidence;
  artifacts: ArtifactEvidence[];
  expected: ExpectedReleaseInputs;
  forkContracts: Record<string, string>;
  roleHolderCodeHashes: Record<string, string>;
  stageMetrics: StageTransactionMetrics[];
  collectorStageMetrics: StageTransactionMetrics[];
  usesPublicRpcDevelopmentOverride?: boolean;
}): ReleaseManifest {
  const deploymentMetrics = input.stageMetrics.find(({ stage }) => stage === "deploy");
  if (deploymentMetrics === undefined) {
    throw new Error("Release manifest requires deploy-stage transaction metrics");
  }
  const measuredDeploymentGas = BigInt(deploymentMetrics.gasUsed);
  const gasContingencyBps = 3_000;
  const feeContingencyBps = 20_000;
  const recommendedDeploymentGas =
    (measuredDeploymentGas * BigInt(10_000 + gasContingencyBps) + 9_999n) / 10_000n;
  const recommendedFundingWei =
    (recommendedDeploymentGas *
      input.pinnedBlockBaseFeePerGasWei *
      BigInt(feeContingencyBps)) /
    10_000n;

  const body: ReleaseManifestBody = {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    kind: "robinhood-mainnet-release-plan",
    broadcastPolicy: "fork-only-never-broadcast",
    releaseEligibility: input.usesPublicRpcDevelopmentOverride
      ? "development-only"
      : "production-candidate",
    developmentOverrides: input.usesPublicRpcDevelopmentOverride
      ? ["public-mainnet-rpc"]
      : [],
    target: {
      network: "robinhoodMainnet",
      chainId: ROBINHOOD_MAINNET_CHAIN_ID,
      forkBlockNumber: input.forkBlockNumber,
      forkBlockHash: input.forkBlockHash.toLowerCase(),
      forkBlockTimestamp: input.forkBlockTimestamp
    },
    source: {
      commit: input.sourceCommit.toLowerCase(),
      tree: input.sourceTree.toLowerCase()
    },
    compiler: input.compiler,
    artifacts: input.artifacts,
    expectedInputs: {
      executionStatus: "verified-by-production-fork",
      deployer: input.expected.deployer,
      roles: expectedRoleInputs(input.expected),
      treasuries: expectedTreasuryInputs(input.expected.treasury),
      randomness: {
        kind: "pinned-coordinator",
        coordinator: input.expected.randomnessCoordinator,
        coordinatorCodeHash: input.expected.randomnessCoordinatorCodeHash,
        maxRequestFeeWei: input.expected.randomnessMaxRequestFeeWei
      }
    },
    forkEvidence: {
      localChainId: FORK_LOCAL_CHAIN_ID,
      randomnessKind: "pinned-coordinator",
      launchState: "paused",
      roleHandoff: "verified",
      deployerPrivilegeState: "revoked",
      treasuryWiring: "verified",
      pausedContracts: {
        ItemToken: true,
        PackSale: true,
        Marketplace: true,
        BuybackVault: true,
        Forge: true,
        RedemptionRegistry: true,
        DustLedger: true,
        TierPool: true,
        VaultForge: true
      },
      roleHolderCodeHashes: input.roleHolderCodeHashes,
      privateCanaryActivation: "separate-reviewed-multisig-operation",
      contracts: input.forkContracts,
      transactionMetrics: {
        stages: input.stageMetrics,
        total: sumStageMetrics(input.stageMetrics)
      },
      collectorRehearsal: {
        status: "passed",
        localChainId: FORK_LOCAL_CHAIN_ID,
        randomnessKind: "commit-reveal-demo-local-only",
        transactionMetrics: {
          stages: input.collectorStageMetrics,
          total: sumStageMetrics(input.collectorStageMetrics)
        }
      }
    },
    gasBudget: {
      basis: "fork-deployment-and-role-wiring",
      measuredDeploymentGas: measuredDeploymentGas.toString(),
      gasContingencyBps,
      recommendedDeploymentGas: recommendedDeploymentGas.toString(),
      pinnedBlockBaseFeePerGasWei: input.pinnedBlockBaseFeePerGasWei.toString(),
      feeContingencyBps,
      recommendedFundingWei: recommendedFundingWei.toString()
    }
  };

  const manifest: ReleaseManifest = {
    ...body,
    integrity: {
      algorithm: "sha256",
      canonicalBodySha256: sha256(canonicalize(body))
    }
  };
  validateReleaseManifest(manifest);
  return manifest;
}

function assertAddress(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== "string" ||
    !isAddress(value) ||
    value.toLowerCase() === ZeroAddress
  ) {
    throw new Error(`${label} must be a non-zero EVM address`);
  }
}

function assertDecimal(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error(`${label} must be a decimal integer string`);
  }
}

function assertNoSensitiveKeys(value: unknown, pathLabel = "manifest"): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSensitiveKeys(entry, `${pathLabel}[${index}]`));
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/(private.?key|mnemonic|rpc.?url|rpc.?header|authorization|password|secret|api.?key)/i.test(key)) {
      throw new Error(`${pathLabel}.${key} is forbidden in a release manifest`);
    }
    if (typeof entry === "string" && /https?:\/\//i.test(entry)) {
      throw new Error(`${pathLabel}.${key} cannot contain a URL`);
    }
    assertNoSensitiveKeys(entry, `${pathLabel}.${key}`);
  }
}

export function validateReleaseManifest(manifest: ReleaseManifest): void {
  assertNoSensitiveKeys(manifest);
  if (
    manifest.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION ||
    manifest.kind !== "robinhood-mainnet-release-plan" ||
    manifest.broadcastPolicy !== "fork-only-never-broadcast"
  ) {
    throw new Error("Unsupported or unsafe release manifest identity");
  }
  if (
    !["production-candidate", "development-only"].includes(
      manifest.releaseEligibility
    ) ||
    !Array.isArray(manifest.developmentOverrides) ||
    (manifest.releaseEligibility === "production-candidate" &&
      manifest.developmentOverrides.length !== 0) ||
    (manifest.releaseEligibility === "development-only" &&
      manifest.developmentOverrides.length === 0) ||
    !manifest.developmentOverrides.every(
      (override) => override === "public-mainnet-rpc"
    ) ||
    new Set(manifest.developmentOverrides).size !==
      manifest.developmentOverrides.length
  ) {
    throw new Error("Release manifest development override state is inconsistent");
  }
  if (
    manifest.target.chainId !== ROBINHOOD_MAINNET_CHAIN_ID ||
    manifest.target.network !== "robinhoodMainnet" ||
    !Number.isSafeInteger(manifest.target.forkBlockNumber) ||
    manifest.target.forkBlockNumber <= 0 ||
    !Number.isSafeInteger(manifest.target.forkBlockTimestamp) ||
    manifest.target.forkBlockTimestamp <= 0 ||
    !/^0x[0-9a-f]{64}$/.test(manifest.target.forkBlockHash)
  ) {
    throw new Error("Release manifest has an invalid pinned Robinhood mainnet target");
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.source.commit) || !/^[0-9a-f]{40}$/.test(manifest.source.tree)) {
    throw new Error("Release manifest source commit or tree is invalid");
  }
  if (
    manifest.compiler.versions.length === 0 ||
    manifest.compiler.inputSha256.length === 0 ||
    manifest.compiler.versions.some((version) => !/^\d+\.\d+\.\d+$/.test(version)) ||
    manifest.compiler.inputSha256.some((hash) => !/^[0-9a-f]{64}$/.test(hash))
  ) {
    throw new Error("Release manifest compiler evidence is incomplete");
  }
  const artifactNames = manifest.artifacts.map(({ contractName }) => contractName);
  if (
    artifactNames.length !== RELEASE_ARTIFACT_NAMES.length ||
    RELEASE_ARTIFACT_NAMES.some((name) => !artifactNames.includes(name)) ||
    new Set(artifactNames).size !== artifactNames.length
  ) {
    throw new Error("Release manifest does not contain the exact reviewed artifact set");
  }
  for (const artifact of manifest.artifacts) {
    const expectedPurpose = artifactPurpose(artifact.contractName);
    if (
      artifact.purpose !== expectedPurpose ||
      !manifest.compiler.versions.includes(artifact.compilerVersion) ||
      !manifest.compiler.inputSha256.includes(artifact.compilerInputSha256)
    ) {
      throw new Error(`${artifact.contractName} compiler or purpose evidence is inconsistent`);
    }
    for (const [label, hash] of Object.entries({
      artifact: artifact.artifactSha256,
      creationBytecode: artifact.creationBytecodeSha256,
      runtimeBytecode: artifact.runtimeBytecodeSha256,
      compilerInput: artifact.compilerInputSha256
    })) {
      if (!/^[0-9a-f]{64}$/.test(hash)) {
        throw new Error(`${artifact.contractName} ${label} hash is invalid`);
      }
    }
  }
  assertAddress(manifest.expectedInputs.deployer, "expected deployer");
  if (
    manifest.expectedInputs.executionStatus !==
    "verified-by-production-fork"
  ) {
    throw new Error("Release manifest expected input execution status is invalid");
  }
  const expectedRoleKeys = Object.keys(
    expectedRoleInputs({
      deployer: manifest.expectedInputs.deployer,
      admin: manifest.expectedInputs.deployer,
      operations: manifest.expectedInputs.deployer,
      guardian: manifest.expectedInputs.deployer,
      treasury: manifest.expectedInputs.deployer,
      randomnessCoordinator: manifest.expectedInputs.randomness.coordinator,
      randomnessCoordinatorCodeHash:
        manifest.expectedInputs.randomness.coordinatorCodeHash,
      randomnessMaxRequestFeeWei:
        manifest.expectedInputs.randomness.maxRequestFeeWei
    })
  );
  const expectedTreasuryKeys = Object.keys(
    expectedTreasuryInputs(manifest.expectedInputs.deployer)
  );
  if (!exactKeys(manifest.expectedInputs.roles, expectedRoleKeys)) {
    throw new Error("Release manifest expected role inputs are incomplete");
  }
  if (!exactKeys(manifest.expectedInputs.treasuries, expectedTreasuryKeys)) {
    throw new Error("Release manifest expected treasury inputs are incomplete");
  }
  Object.entries(manifest.expectedInputs.roles).forEach(([role, address]) =>
    assertAddress(address, `expected role ${role}`)
  );
  Object.entries(manifest.expectedInputs.treasuries).forEach(([treasury, address]) =>
    assertAddress(address, `expected treasury ${treasury}`)
  );
  assertAddress(manifest.expectedInputs.randomness.coordinator, "randomness coordinator");
  if (
    manifest.expectedInputs.randomness.kind !== "pinned-coordinator" ||
    !/^0x[0-9a-f]{64}$/.test(manifest.expectedInputs.randomness.coordinatorCodeHash) ||
    /^0x0{64}$/.test(manifest.expectedInputs.randomness.coordinatorCodeHash)
  ) {
    throw new Error("Randomness coordinator code hash is invalid");
  }
  assertDecimal(
    manifest.expectedInputs.randomness.maxRequestFeeWei,
    "randomness max request fee"
  );

  if (
    manifest.forkEvidence.localChainId !== FORK_LOCAL_CHAIN_ID ||
    manifest.forkEvidence.randomnessKind !== "pinned-coordinator" ||
    manifest.forkEvidence.launchState !== "paused" ||
    manifest.forkEvidence.roleHandoff !== "verified" ||
    manifest.forkEvidence.deployerPrivilegeState !== "revoked" ||
    manifest.forkEvidence.treasuryWiring !== "verified" ||
    manifest.forkEvidence.privateCanaryActivation !==
      "separate-reviewed-multisig-operation"
  ) {
    throw new Error("Fork evidence does not prove an exact paused production deployment");
  }
  const expectedPausedContracts = [
    "ItemToken",
    "PackSale",
    "Marketplace",
    "BuybackVault",
    "Forge",
    "RedemptionRegistry",
    "DustLedger",
    "TierPool",
    "VaultForge"
  ];
  if (
    !exactKeys(manifest.forkEvidence.pausedContracts, expectedPausedContracts) ||
    Object.values(manifest.forkEvidence.pausedContracts).some(
      (paused) => paused !== true
    )
  ) {
    throw new Error("Fork evidence does not prove every production pause state");
  }
  const expectedRoleHolderCodeKeys = [
    "protocolAdmin",
    "operations",
    "guardian",
    "treasury"
  ];
  if (
    !exactKeys(
      manifest.forkEvidence.roleHolderCodeHashes,
      expectedRoleHolderCodeKeys
    ) ||
    Object.values(manifest.forkEvidence.roleHolderCodeHashes).some(
      (hash) => !/^0x[0-9a-f]{64}$/.test(hash) || /^0x0{64}$/.test(hash)
    )
  ) {
    throw new Error("Fork evidence has invalid role-holder contract code hashes");
  }
  const forkContractEntries = Object.entries(manifest.forkEvidence.contracts);
  if (
    forkContractEntries.length !== LOCAL_CONTRACT_NAMES.length ||
    LOCAL_CONTRACT_NAMES.some((name) => !(name in manifest.forkEvidence.contracts))
  ) {
    throw new Error("Fork evidence does not contain the exact local deployment set");
  }
  const forkAddresses = forkContractEntries.map(([name, address]) => {
    assertAddress(address, `fork contract ${name}`);
    return getAddress(address);
  });
  if (new Set(forkAddresses).size !== forkAddresses.length) {
    throw new Error("Fork evidence reuses a contract address");
  }
  const expectedStages = ["deploy", "smoke"];
  const actualStages = manifest.forkEvidence.transactionMetrics.stages.map(
    ({ stage }) => stage
  );
  if (
    actualStages.length !== expectedStages.length ||
    actualStages.some((stage, index) => stage !== expectedStages[index])
  ) {
    throw new Error("Fork evidence does not contain the exact rehearsal stage sequence");
  }
  for (const metrics of manifest.forkEvidence.transactionMetrics.stages) {
    assertDecimal(metrics.gasUsed, `${metrics.stage} gas used`);
    if (
      !Number.isSafeInteger(metrics.transactionCount) ||
      metrics.transactionCount < 0 ||
      !Number.isSafeInteger(metrics.contractCreationCount) ||
      metrics.contractCreationCount < 0 ||
      metrics.contractCreationCount > metrics.transactionCount ||
      !Number.isSafeInteger(metrics.calldataBytes) ||
      metrics.calldataBytes < 0 ||
      (metrics.transactionCount === 0 &&
        (metrics.firstBlock !== null || metrics.lastBlock !== null)) ||
      (metrics.transactionCount > 0 &&
        (!Number.isSafeInteger(metrics.firstBlock) ||
          !Number.isSafeInteger(metrics.lastBlock) ||
          metrics.firstBlock! > metrics.lastBlock!))
    ) {
      throw new Error(`Fork evidence has invalid ${metrics.stage} transaction metrics`);
    }
  }
  const expectedTotalMetrics = sumStageMetrics(
    manifest.forkEvidence.transactionMetrics.stages
  );
  if (
    !metricsEqual(
      manifest.forkEvidence.transactionMetrics.total,
      expectedTotalMetrics
    )
  ) {
    throw new Error("Fork evidence total transaction metrics do not match its stages");
  }
  const collector = manifest.forkEvidence.collectorRehearsal;
  const expectedCollectorStages = [
    "deploy",
    "seed",
    "initial-smoke",
    "rehearse",
    "final-smoke"
  ];
  const actualCollectorStages = collector.transactionMetrics.stages.map(
    ({ stage }) => stage
  );
  if (
    collector.status !== "passed" ||
    collector.localChainId !== FORK_LOCAL_CHAIN_ID ||
    collector.randomnessKind !== "commit-reveal-demo-local-only" ||
    actualCollectorStages.length !== expectedCollectorStages.length ||
    actualCollectorStages.some(
      (stage, index) => stage !== expectedCollectorStages[index]
    )
  ) {
    throw new Error("Fork evidence does not include the separate local collector rehearsal");
  }
  for (const metrics of collector.transactionMetrics.stages) {
    assertDecimal(metrics.gasUsed, `collector ${metrics.stage} gas used`);
    if (
      !Number.isSafeInteger(metrics.transactionCount) ||
      metrics.transactionCount < 0 ||
      !Number.isSafeInteger(metrics.contractCreationCount) ||
      metrics.contractCreationCount < 0 ||
      metrics.contractCreationCount > metrics.transactionCount ||
      !Number.isSafeInteger(metrics.calldataBytes) ||
      metrics.calldataBytes < 0 ||
      (metrics.transactionCount === 0 &&
        (metrics.firstBlock !== null || metrics.lastBlock !== null)) ||
      (metrics.transactionCount > 0 &&
        (!Number.isSafeInteger(metrics.firstBlock) ||
          !Number.isSafeInteger(metrics.lastBlock) ||
          metrics.firstBlock! > metrics.lastBlock!))
    ) {
      throw new Error(`Collector evidence has invalid ${metrics.stage} metrics`);
    }
  }
  const expectedCollectorTotal = sumStageMetrics(
    collector.transactionMetrics.stages
  );
  if (
    !metricsEqual(collector.transactionMetrics.total, expectedCollectorTotal) ||
    collector.transactionMetrics.stages[0]?.contractCreationCount !==
      LOCAL_CONTRACT_NAMES.length
  ) {
    throw new Error("Collector evidence transaction totals are inconsistent");
  }
  const deploymentMetrics = manifest.forkEvidence.transactionMetrics.stages.find(
    ({ stage }) => stage === "deploy"
  );
  if (
    deploymentMetrics === undefined ||
    deploymentMetrics.contractCreationCount !== LOCAL_CONTRACT_NAMES.length ||
    deploymentMetrics.transactionCount < LOCAL_CONTRACT_NAMES.length
  ) {
    throw new Error("Fork evidence does not prove all contracts were deployed");
  }
  assertDecimal(manifest.gasBudget.measuredDeploymentGas, "measured deployment gas");
  assertDecimal(manifest.gasBudget.recommendedDeploymentGas, "recommended deployment gas");
  assertDecimal(
    manifest.gasBudget.pinnedBlockBaseFeePerGasWei,
    "pinned block base fee"
  );
  assertDecimal(manifest.gasBudget.recommendedFundingWei, "recommended funding");
  const measuredDeploymentGas = BigInt(manifest.gasBudget.measuredDeploymentGas);
  const recommendedDeploymentGas = BigInt(
    manifest.gasBudget.recommendedDeploymentGas
  );
  const pinnedBlockBaseFee = BigInt(
    manifest.gasBudget.pinnedBlockBaseFeePerGasWei
  );
  const expectedRecommendedGas =
    (measuredDeploymentGas * 13_000n + 9_999n) / 10_000n;
  const expectedFunding = recommendedDeploymentGas * pinnedBlockBaseFee * 2n;
  if (
    manifest.gasBudget.basis !== "fork-deployment-and-role-wiring" ||
    manifest.gasBudget.gasContingencyBps !== 3_000 ||
    manifest.gasBudget.feeContingencyBps !== 20_000 ||
    manifest.gasBudget.measuredDeploymentGas !== deploymentMetrics.gasUsed ||
    recommendedDeploymentGas !== expectedRecommendedGas ||
    BigInt(manifest.gasBudget.recommendedFundingWei) !== expectedFunding
  ) {
    throw new Error("Release manifest gas budget is inconsistent with fork evidence");
  }
  if (manifest.integrity.algorithm !== "sha256") {
    throw new Error("Release manifest integrity algorithm must be sha256");
  }
  const { integrity, ...body } = manifest;
  const expectedHash = sha256(canonicalize(body));
  if (integrity.canonicalBodySha256 !== expectedHash) {
    throw new Error("Release manifest integrity hash does not match its canonical body");
  }
}

export async function writeReleaseManifest(
  outputPath: string,
  manifest: ReleaseManifest
): Promise<void> {
  validateReleaseManifest(manifest);
  const contents = `${JSON.stringify(manifest, null, 2)}\n`;
  const directory = path.dirname(outputPath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(outputPath)}.${process.pid}.tmp`
  );
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(temporaryPath, contents, { flag: "wx", mode: 0o644 });
    await rename(temporaryPath, outputPath);
  } catch (error: unknown) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
