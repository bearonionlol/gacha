import { expect } from "chai";
import {
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  FORK_ONLY_RANDOMNESS_OVERRIDE,
  ROBINHOOD_PUBLIC_MAINNET_RPC_URL,
  assertForkOnlyRandomnessOverride,
  loadForkSourceConfig,
  loadMainnetForkConfig,
  type Environment
} from "../scripts/mainnet-fork-config";
import {
  assertProductionForkDeploymentRegistry,
  runForkRehearsalPipeline
} from "../scripts/mainnet-fork";
import {
  RELEASE_ARTIFACT_NAMES,
  collectArtifactEvidence,
  createReleaseManifest,
  validateReleaseManifest,
  writeReleaseManifest,
  type ArtifactEvidence,
  type ReleaseManifest,
  type StageTransactionMetrics
} from "../scripts/release-manifest";
import { resolveRandomnessSmokePlan } from "../scripts/smoke-randomness";
import { resolveSmokeRolePlan } from "../scripts/smoke-roles";
import { LOCAL_CONTRACT_NAMES } from "../scripts/local";

describe("mainnet release tooling", function () {
  const temporaryDirectories: string[] = [];
  const address = (value: number): string =>
    `0x${value.toString(16).padStart(40, "0")}`;
  const hash = (value: string): string => value.repeat(64).slice(0, 64);

  afterEach(async function () {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  async function temporaryPath(name: string): Promise<string> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gacha-mainnet-release-"));
    temporaryDirectories.push(directory);
    return path.join(directory, name);
  }

  async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error: unknown) {
      return error;
    }
    throw new Error("Expected promise to reject");
  }

  function releaseEnvironment(): Record<string, string> {
    return {
      ROBINHOOD_MAINNET_FORK_RPC_URL: "https://tenant.rpc.example/v2/rehearsal-key",
      ROBINHOOD_MAINNET_FORK_BLOCK: "123456",
      [FORK_ONLY_RANDOMNESS_OVERRIDE]: "true",
      MAINNET_RELEASE_DEPLOYER_ADDRESS: address(1),
      MAINNET_RELEASE_ADMIN_ADDRESS: address(2),
      MAINNET_RELEASE_OPERATIONS_ADDRESS: address(3),
      MAINNET_RELEASE_GUARDIAN_ADDRESS: address(4),
      MAINNET_RELEASE_TREASURY_ADDRESS: address(5),
      ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS: address(6),
      ROBINHOOD_RANDOMNESS_COORDINATOR_CODEHASH: `0x${hash("a")}`,
      ROBINHOOD_RANDOMNESS_MAX_REQUEST_FEE_WEI: "1000000000000000"
    };
  }

  function artifactEvidence(): ArtifactEvidence[] {
    return RELEASE_ARTIFACT_NAMES.map((contractName, index) => ({
      contractName,
      sourceName: `contracts/${contractName}.sol`,
      purpose:
        contractName === "CommitRevealRandomnessProvider"
          ? "fork-rehearsal"
          : contractName === "CoordinatorRandomnessProvider"
            ? "mainnet-target"
            : "fork-and-mainnet",
      artifactSha256: hash(((index + 1) % 10).toString()),
      creationBytecodeSha256: hash(((index + 2) % 10).toString()),
      runtimeBytecodeSha256: hash(((index + 3) % 10).toString()),
      compilerVersion: "0.8.28",
      compilerInputSha256: hash("f")
    }));
  }

  function stageMetrics(): StageTransactionMetrics[] {
    return [
      {
        stage: "deploy",
        firstBlock: 123_457,
        lastBlock: 123_506,
        transactionCount: 50,
        contractCreationCount: 15,
        gasUsed: "28000000",
        calldataBytes: 125_000
      },
      {
        stage: "smoke",
        firstBlock: null,
        lastBlock: null,
        transactionCount: 0,
        contractCreationCount: 0,
        gasUsed: "0",
        calldataBytes: 0
      }
    ];
  }

  function collectorStageMetrics(): StageTransactionMetrics[] {
    return [
      {
        stage: "deploy",
        firstBlock: 1,
        lastBlock: 50,
        transactionCount: 50,
        contractCreationCount: 15,
        gasUsed: "27000000",
        calldataBytes: 120_000
      },
      {
        stage: "seed",
        firstBlock: 51,
        lastBlock: 70,
        transactionCount: 20,
        contractCreationCount: 0,
        gasUsed: "3000000",
        calldataBytes: 8_000
      },
      {
        stage: "initial-smoke",
        firstBlock: null,
        lastBlock: null,
        transactionCount: 0,
        contractCreationCount: 0,
        gasUsed: "0",
        calldataBytes: 0
      },
      {
        stage: "rehearse",
        firstBlock: 71,
        lastBlock: 90,
        transactionCount: 20,
        contractCreationCount: 0,
        gasUsed: "2500000",
        calldataBytes: 7_000
      },
      {
        stage: "final-smoke",
        firstBlock: null,
        lastBlock: null,
        transactionCount: 0,
        contractCreationCount: 0,
        gasUsed: "0",
        calldataBytes: 0
      }
    ];
  }

  function validManifest(usesPublicRpcDevelopmentOverride = false): ReleaseManifest {
    const env = releaseEnvironment();
    const config = loadMainnetForkConfig(env, "/tmp/repository");
    return createReleaseManifest({
      forkBlockNumber: 123_456,
      forkBlockHash: `0x${hash("b")}`,
      forkBlockTimestamp: 1_750_000_000,
      pinnedBlockBaseFeePerGasWei: 300_000_000n,
      sourceCommit: hash("c").slice(0, 40),
      sourceTree: hash("d").slice(0, 40),
      compiler: { versions: ["0.8.28"], inputSha256: [hash("f")] },
      artifacts: artifactEvidence(),
      expected: config.expected,
      forkContracts: Object.fromEntries(
        LOCAL_CONTRACT_NAMES.map((name, index) => [name, address(index + 100)])
      ),
      roleHolderCodeHashes: {
        protocolAdmin: `0x${hash("1")}`,
        operations: `0x${hash("2")}`,
        guardian: `0x${hash("3")}`,
        treasury: `0x${hash("4")}`
      },
      stageMetrics: stageMetrics(),
      collectorStageMetrics: collectorStageMetrics(),
      usesPublicRpcDevelopmentOverride
    });
  }

  it("fails closed without an explicit authenticated pinned RPC", function () {
    expect(() => loadForkSourceConfig({})).to.throw(
      "ROBINHOOD_MAINNET_FORK_RPC_URL is required"
    );
    expect(() =>
      loadForkSourceConfig({
        ROBINHOOD_MAINNET_FORK_RPC_URL: ROBINHOOD_PUBLIC_MAINNET_RPC_URL,
        ROBINHOOD_MAINNET_FORK_BLOCK: "123"
      })
    ).to.throw("public/default Robinhood RPC is refused");
    expect(() =>
      loadForkSourceConfig({
        ROBINHOOD_MAINNET_FORK_RPC_URL: "https://tenant.rpc.example/v2/key",
        ROBINHOOD_MAINNET_FORK_BLOCK: "latest"
      })
    ).to.throw("must be a pinned positive decimal integer");
    expect(() => assertForkOnlyRandomnessOverride({})).to.throw(
      `${FORK_ONLY_RANDOMNESS_OVERRIDE}=true is required`
    );
  });

  it("allows the public RPC only behind the named development override", function () {
    const config = loadForkSourceConfig({
      ROBINHOOD_MAINNET_FORK_RPC_URL: ROBINHOOD_PUBLIC_MAINNET_RPC_URL,
      ROBINHOOD_MAINNET_FORK_BLOCK: "123",
      ALLOW_PUBLIC_MAINNET_FORK_RPC_FOR_DEVELOPMENT: "true"
    });
    expect(config.usesPublicRpcDevelopmentOverride).to.equal(true);
    expect(config.blockNumber).to.equal(123);
  });

  it("requires complete release addresses, coordinator pinning, and fork override", function () {
    const env = releaseEnvironment();
    const config = loadMainnetForkConfig(env, "/tmp/repository");
    expect(config.localRpcUrl).to.equal("http://127.0.0.1:18545");
    expect(config.source.blockNumber).to.equal(123_456);
    expect(config.expected.randomnessMaxRequestFeeWei).to.equal("1000000000000000");

    const missingAdmin = { ...env } as Record<string, string | undefined>;
    delete missingAdmin.MAINNET_RELEASE_ADMIN_ADDRESS;
    expect(() => loadMainnetForkConfig(missingAdmin, "/tmp/repository")).to.throw(
      "MAINNET_RELEASE_ADMIN_ADDRESS is required"
    );

    const missingGuardian = { ...env } as Record<string, string | undefined>;
    delete missingGuardian.MAINNET_RELEASE_GUARDIAN_ADDRESS;
    expect(() => loadMainnetForkConfig(missingGuardian, "/tmp/repository")).to.throw(
      "MAINNET_RELEASE_GUARDIAN_ADDRESS is required"
    );

    expect(() =>
      loadMainnetForkConfig(
        { ...env, DEPLOYER_PRIVATE_KEY: `0x${hash("9")}` },
        "/tmp/repository"
      )
    ).to.throw("DEPLOYER_PRIVATE_KEY must be unset");
  });

  it("restores deployment state and stops the node after a failed fork stage", async function () {
    const deploymentPath = await temporaryPath("localhost.json");
    const original = "existing deployment registry\n";
    await writeFile(deploymentPath, original);
    const events: string[] = [];

    const failure = await rejectionOf(
      runForkRehearsalPipeline({
        deploymentPath,
        ensurePortAvailable: async () => {
          events.push("port");
        },
        startNode: () => {
          events.push("start");
          return { id: "fork" };
        },
        waitForNode: async () => {
          events.push("ready");
        },
        runStages: async () => {
          events.push("stage");
          await writeFile(deploymentPath, "transient fork deployment\n");
          throw new Error("collector rehearsal failed");
        },
        stopNode: async () => {
          events.push("stop");
        }
      })
    );

    expect(failure).to.be.an("error").with.property("message", "collector rehearsal failed");
    expect(events).to.deep.equal(["port", "start", "ready", "stage", "stop"]);
    expect(await readFile(deploymentPath, "utf8")).to.equal(original);
  });

  it("removes a transient registry only after a successful isolated run", async function () {
    const deploymentPath = await temporaryPath("localhost.json");
    const result = await runForkRehearsalPipeline({
      deploymentPath,
      ensurePortAvailable: async () => undefined,
      startNode: () => ({ id: "fork" }),
      waitForNode: async () => undefined,
      runStages: async () => {
        await writeFile(deploymentPath, "transient\n");
        return "manifest";
      },
      stopNode: async () => undefined
    });
    expect(result).to.equal("manifest");
    const missing = await rejectionOf(stat(deploymentPath));
    expect(missing).to.be.an("error").with.property("code", "ENOENT");
  });

  it("accepts only an exact paused production fork registry", async function () {
    const deploymentPath = await temporaryPath("localhost.json");
    const config = loadMainnetForkConfig(releaseEnvironment(), "/tmp/repository");
    const contracts = Object.fromEntries(
      LOCAL_CONTRACT_NAMES.map((name, index) => [name, address(index + 100)])
    );
    const registry = {
      network: "localhost",
      chainId: 31_337,
      deployer: config.expected.deployer,
      timestamp: "2026-01-01T00:00:00.000Z",
      randomnessProviderKind: "pinned-coordinator",
      randomnessCoordinator: config.expected.randomnessCoordinator,
      launchState: "paused",
      roleHolders: {
        protocolAdmin: config.expected.admin,
        operations: config.expected.operations,
        guardian: config.expected.guardian,
        treasury: config.expected.treasury
      },
      contracts
    };
    await writeFile(deploymentPath, JSON.stringify(registry));
    expect(
      await assertProductionForkDeploymentRegistry(deploymentPath, config)
    ).to.deep.equal(contracts);

    await writeFile(
      deploymentPath,
      JSON.stringify({ ...registry, launchState: "active" })
    );
    const activeError = await rejectionOf(
      assertProductionForkDeploymentRegistry(deploymentPath, config)
    );
    expect(activeError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("exact paused mainnet configuration");
  });

  it("creates a deterministic secret-free manifest and detects tampering", function () {
    const first = validManifest();
    const second = validManifest();
    expect(first.integrity.canonicalBodySha256).to.equal(
      second.integrity.canonicalBodySha256
    );
    expect(first.releaseEligibility).to.equal("production-candidate");
    expect(first.developmentOverrides).to.deep.equal([]);
    expect(first.expectedInputs.executionStatus).to.equal(
      "verified-by-production-fork"
    );
    expect(first.expectedInputs.roles.dropAdmin).to.equal(address(3));
    expect(first.expectedInputs.roles.packSalePauser).to.equal(address(4));
    expect(JSON.stringify(first)).not.to.match(/https?:\/\//);
    expect(first.gasBudget.recommendedDeploymentGas).to.equal("36400000");
    expect(first.forkEvidence.transactionMetrics.total.transactionCount).to.equal(50);
    expect(first.forkEvidence.launchState).to.equal("paused");
    expect(first.forkEvidence.roleHandoff).to.equal("verified");
    expect(first.forkEvidence.deployerPrivilegeState).to.equal("revoked");
    expect(first.forkEvidence.treasuryWiring).to.equal("verified");
    expect(Object.keys(first.forkEvidence.pausedContracts)).to.have.length(9);
    expect(first.forkEvidence.collectorRehearsal.status).to.equal("passed");
    expect(
      first.forkEvidence.collectorRehearsal.transactionMetrics.total
        .transactionCount
    ).to.equal(90);
    const publicRpcManifest = validManifest(true);
    expect(publicRpcManifest.releaseEligibility).to.equal("development-only");
    expect(publicRpcManifest.developmentOverrides).to.deep.equal([
      "public-mainnet-rpc"
    ]);
    expect(() => validateReleaseManifest(first)).not.to.throw();

    const tampered = structuredClone(first);
    tampered.gasBudget.measuredDeploymentGas = "1";
    expect(() => validateReleaseManifest(tampered)).to.throw(
      "gas budget is inconsistent"
    );

    const withSecretKey = structuredClone(first) as ReleaseManifest & { rpcUrl?: string };
    withSecretKey.rpcUrl = "https://secret.example/key";
    expect(() => validateReleaseManifest(withSecretKey)).to.throw(
      "rpcUrl is forbidden"
    );

    const inconsistentDevelopmentOverride = structuredClone(first);
    inconsistentDevelopmentOverride.releaseEligibility = "development-only";
    inconsistentDevelopmentOverride.developmentOverrides = [];
    expect(() => validateReleaseManifest(inconsistentDevelopmentOverride)).to.throw(
      "development override state is inconsistent"
    );

    const unpaused = structuredClone(first) as unknown as {
      forkEvidence: { pausedContracts: Record<string, boolean> };
    };
    unpaused.forkEvidence.pausedContracts.PackSale = false;
    expect(() => validateReleaseManifest(unpaused as unknown as ReleaseManifest)).to.throw(
      "does not prove every production pause state"
    );
  });

  it("writes and revalidates the machine-readable manifest atomically", async function () {
    const outputPath = await temporaryPath("release-plan.json");
    const manifest = validManifest();
    await writeReleaseManifest(outputPath, manifest);
    const parsed = JSON.parse(await readFile(outputPath, "utf8")) as ReleaseManifest;
    expect(() => validateReleaseManifest(parsed)).not.to.throw();
    expect(parsed.integrity).to.deep.equal(manifest.integrity);
  });

  it("hashes the exact fork and mainnet target artifact set", async function () {
    const artifactsRoot = path.resolve(__dirname, "../artifacts");
    const evidence = await collectArtifactEvidence(artifactsRoot);
    expect(evidence.artifacts.map(({ contractName }) => contractName)).to.deep.equal([
      ...RELEASE_ARTIFACT_NAMES
    ]);
    expect(evidence.compiler.versions).to.deep.equal(["0.8.28"]);
    expect(evidence.artifacts.every(({ artifactSha256 }) => /^[0-9a-f]{64}$/.test(artifactSha256))).to.equal(true);
  });

  it("keeps local commit/reveal smoke behavior and fails closed for mainnet", function () {
    expect(resolveRandomnessSmokePlan({}, "localhost", {})).to.deep.equal({
      kind: "commit-reveal-demo",
      artifactName: "CommitRevealRandomnessProvider",
      label: "CommitRevealRandomnessProvider"
    });
    expect(() => resolveRandomnessSmokePlan({}, "robinhoodMainnet", {})).to.throw(
      "deployment.randomnessProviderKind is required"
    );
    expect(() =>
      resolveRandomnessSmokePlan(
        { randomnessProviderKind: "commit-reveal-demo" },
        "robinhoodMainnet",
        {}
      )
    ).to.throw("commit-reveal-demo randomness is not production-safe");
  });

  it("resolves and pins coordinator smoke verification inputs", function () {
    const env = releaseEnvironment() as Environment;
    const plan = resolveRandomnessSmokePlan(
      {
        randomnessProviderKind: "pinned-coordinator",
        randomnessCoordinator: env.ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS
      },
      "robinhoodMainnet",
      env
    );
    expect(plan).to.deep.include({
      kind: "pinned-coordinator",
      artifactName: "CoordinatorRandomnessProvider",
      coordinator: env.ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS,
      maxRequestFeeWei: 1_000_000_000_000_000n
    });

    expect(() =>
      resolveRandomnessSmokePlan(
        {
          randomnessProviderKind: "pinned-coordinator",
          randomnessCoordinator: address(9)
        },
        "robinhoodMainnet",
        env
      )
    ).to.throw("does not match ROBINHOOD_RANDOMNESS_COORDINATOR_ADDRESS");
  });

  it("separates mainnet admin, operations, guardian, and treasury evidence", function () {
    const env = releaseEnvironment();
    expect(resolveSmokeRolePlan(address(1), "localhost", env)).to.deep.equal({
      deployer: address(1),
      protocolAdmin: address(1),
      operations: address(1),
      guardian: address(1),
      treasury: address(1)
    });
    expect(resolveSmokeRolePlan(address(1), "robinhoodMainnet", env)).to.deep.equal({
      deployer: address(1),
      protocolAdmin: address(2),
      operations: address(3),
      guardian: address(4),
      treasury: address(5)
    });
    expect(() =>
      resolveSmokeRolePlan(address(9), "robinhoodMainnet", env)
    ).to.throw("does not match MAINNET_RELEASE_DEPLOYER_ADDRESS");
  });
});
