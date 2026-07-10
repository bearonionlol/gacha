import { expect } from "chai";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  LOCAL_CONTRACT_NAMES,
  LOCAL_LOCK_OWNER_FILE,
  LOCAL_STAGES,
  assertLocalDeploymentRegistry,
  runLocalPipeline,
  withExclusiveFileLock
} from "../scripts/local";

describe("local contract environment", function () {
  const temporaryDirectories: string[] = [];

  afterEach(async function () {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  async function temporaryDeploymentPath(): Promise<string> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gacha-local-environment-"));
    temporaryDirectories.push(directory);
    return path.join(directory, "localhost.json");
  }

  async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error: unknown) {
      return error;
    }
    throw new Error("Expected promise to reject");
  }

  it("runs deploy, seed, smoke, rehearsal, and final smoke in order", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const events: string[] = [];
    const node = { id: "ephemeral-node" };

    await runLocalPipeline({
      deploymentPath,
      ensurePortAvailable: async () => {
        events.push("port");
      },
      startNode: () => {
        events.push("start");
        return node;
      },
      waitForNode: async (actualNode) => {
        expect(actualNode).to.equal(node);
        events.push("ready");
      },
      runStage: async (stage) => {
        events.push(stage.id);
        if (stage.id === "deploy") {
          await writeFile(deploymentPath, "transient deployment\n");
        }
      },
      stopNode: async (actualNode) => {
        expect(actualNode).to.equal(node);
        events.push("stop");
      }
    });

    expect(events).to.deep.equal([
      "port",
      "start",
      "ready",
      "deploy",
      "seed",
      "initial-smoke",
      "rehearse",
      "final-smoke",
      "stop"
    ]);
    const missingFileError = await rejectionOf(readFile(deploymentPath, "utf8"));
    expect(missingFileError).to.be.an("error").with.property("code", "ENOENT");
  });

  it("stops the node and restores an existing registry after a stage fails", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const originalRegistry = "existing uncommitted registry\n";
    await writeFile(deploymentPath, originalRegistry);
    await chmod(deploymentPath, 0o640);
    const visitedStages: string[] = [];
    let stopped = false;
    let failure: unknown;

    try {
      await runLocalPipeline({
        deploymentPath,
        ensurePortAvailable: async () => undefined,
        startNode: () => ({ id: "ephemeral-node" }),
        waitForNode: async () => undefined,
        runStage: async (stage) => {
          visitedStages.push(stage.id);
          if (stage.id === "deploy") {
            await writeFile(deploymentPath, "generated registry\n");
          }
          if (stage.id === "seed") {
            throw new Error("seed failed");
          }
        },
        stopNode: async () => {
          stopped = true;
        }
      });
    } catch (error: unknown) {
      failure = error;
    }

    expect(failure).to.be.an("error").with.property("message", "seed failed");
    expect(visitedStages).to.deep.equal(["deploy", "seed"]);
    expect(stopped).to.equal(true);
    expect(await readFile(deploymentPath, "utf8")).to.equal(originalRegistry);
    expect((await stat(deploymentPath)).mode & 0o777).to.equal(0o640);
  });

  it("requires an exact 15-contract localhost deployment registry", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const contracts = Object.fromEntries(
      LOCAL_CONTRACT_NAMES.map((name, index) => [
        name,
        `0x${(index + 1).toString(16).padStart(40, "0")}`
      ])
    );
    await writeFile(
      deploymentPath,
      JSON.stringify({ network: "localhost", chainId: 31_337, contracts })
    );

    expect(await assertLocalDeploymentRegistry(deploymentPath)).to.equal(15);

    delete contracts.VaultForge;
    await writeFile(
      deploymentPath,
      JSON.stringify({ network: "localhost", chainId: 31_337, contracts })
    );
    const incompleteRegistryError = await rejectionOf(
      assertLocalDeploymentRegistry(deploymentPath)
    );
    expect(incompleteRegistryError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("contains 14 contracts; expected 15");

    contracts.VaultForge = contracts.DustLedger!;
    await writeFile(
      deploymentPath,
      JSON.stringify({ network: "localhost", chainId: 31_337, contracts })
    );
    const duplicateRegistryError = await rejectionOf(
      assertLocalDeploymentRegistry(deploymentPath)
    );
    expect(duplicateRegistryError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("reuses a contract address");
  });

  it("keeps the command's stage list explicit", function () {
    expect(LOCAL_STAGES.map(({ script }) => script)).to.deep.equal([
      "scripts/deploy.ts",
      "scripts/seed.ts",
      "scripts/smoke.ts",
      "scripts/rehearse.ts",
      "scripts/smoke.ts"
    ]);
  });

  it("rejects a concurrent local environment and releases its lock", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const lockPath = `${deploymentPath}.lock`;
    let enterFirst!: () => void;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      enterFirst = resolve;
    });
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const firstRun = withExclusiveFileLock(lockPath, async () => {
      enterFirst();
      await firstReleased;
    });
    await firstEntered;

    const concurrentError = await rejectionOf(withExclusiveFileLock(lockPath, async () => undefined));
    expect(concurrentError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("already running");

    releaseFirst();
    await firstRun;
    const missingLockError = await rejectionOf(readFile(lockPath, "utf8"));
    expect(missingLockError).to.be.an("error").with.property("code", "ENOENT");
  });

  it("never removes stale or still-initializing locks automatically", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const lockPath = `${deploymentPath}.lock`;
    const ownerPath = path.join(lockPath, LOCAL_LOCK_OWNER_FILE);
    await mkdir(lockPath);

    const initializingError = await rejectionOf(
      withExclusiveFileLock(lockPath, async () => undefined)
    );
    expect(initializingError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("being acquired or has no readable owner");
    expect((await stat(lockPath)).isDirectory()).to.equal(true);

    await writeFile(ownerPath, `${JSON.stringify({ pid: 2_147_483_647, token: "stale" })}\n`);
    const staleError = await rejectionOf(withExclusiveFileLock(lockPath, async () => undefined));
    expect(staleError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("Stale local contract environment lock");
    expect(JSON.parse(await readFile(ownerPath, "utf8"))).to.deep.equal({
      pid: 2_147_483_647,
      token: "stale"
    });
  });

  it("preserves a lock when its ownership token changes before cleanup", async function () {
    const deploymentPath = await temporaryDeploymentPath();
    const lockPath = `${deploymentPath}.lock`;
    const ownerPath = path.join(lockPath, LOCAL_LOCK_OWNER_FILE);

    const ownershipError = await rejectionOf(
      withExclusiveFileLock(lockPath, async () => {
        await writeFile(
          ownerPath,
          `${JSON.stringify({ pid: process.pid, token: "replacement" })}\n`
        );
      })
    );
    expect(ownershipError)
      .to.be.an("error")
      .with.property("message")
      .that.includes("lock ownership changed");
    expect(JSON.parse(await readFile(ownerPath, "utf8"))).to.deep.equal({
      pid: process.pid,
      token: "replacement"
    });
  });
});
