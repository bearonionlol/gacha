import { expect } from "chai";
import { ethers } from "hardhat";
import { deployRandomnessProviderFixture } from "./helpers/deploy";

const abiCoder = ethers.AbiCoder.defaultAbiCoder();
const requestId = ethers.keccak256(ethers.toUtf8Bytes("pack-purchase-001"));
const seed = ethers.keccak256(ethers.toUtf8Bytes("revealed-seed"));
const wrongSeed = ethers.keccak256(ethers.toUtf8Bytes("wrong-seed"));
const requesterRole = ethers.id("REQUESTER_ROLE");

function commitmentFor(seedValue: string): string {
  return ethers.keccak256(abiCoder.encode(["bytes32"], [seedValue]));
}

function randomnessFor(seedValue: string, requestIdValue: string, providerAddress: string): bigint {
  return BigInt(
    ethers.keccak256(
      abiCoder.encode(["bytes32", "bytes32", "address"], [seedValue, requestIdValue, providerAddress])
    )
  );
}

describe("CommitRevealRandomnessProvider", function () {
  it("records randomness requests", async function () {
    const { randomnessProvider, requester } = await deployRandomnessProviderFixture();

    await expect(randomnessProvider.connect(requester).requestRandomness(requestId))
      .to.emit(randomnessProvider, "RandomnessRequested")
      .withArgs(requestId);

    const [ready, randomness] = await randomnessProvider.readRandomness(requestId);
    expect(ready).to.equal(false);
    expect(randomness).to.equal(0n);

    await expect(randomnessProvider.connect(requester).requestRandomness(requestId))
      .to.be.revertedWithCustomError(randomnessProvider, "RandomnessRequestAlreadyExists")
      .withArgs(requestId);
    await expect(
      randomnessProvider.connect(requester).requestRandomness(ethers.ZeroHash)
    ).to.be.revertedWithCustomError(randomnessProvider, "ZeroRequestId");
  });

  it("requires a commit before reveal", async function () {
    const { randomnessProvider, requester, revealer } = await deployRandomnessProviderFixture();

    await randomnessProvider.connect(requester).requestRandomness(requestId);

    await expect(randomnessProvider.connect(revealer).revealRandomness(requestId, seed))
      .to.be.revertedWithCustomError(randomnessProvider, "RandomnessCommitmentMissing")
      .withArgs(requestId);
  });

  it("rejects a seed that does not match the commitment", async function () {
    const { randomnessProvider, requester, revealer } = await deployRandomnessProviderFixture();

    await randomnessProvider.connect(requester).requestRandomness(requestId);
    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));

    await expect(randomnessProvider.connect(revealer).revealRandomness(requestId, wrongSeed))
      .to.be.revertedWithCustomError(randomnessProvider, "RandomnessSeedMismatch")
      .withArgs(requestId);
  });

  it("returns ready randomness after reveal", async function () {
    const { randomnessProvider, requester, revealer } = await deployRandomnessProviderFixture();
    const expectedRandomness = randomnessFor(seed, requestId, await randomnessProvider.getAddress());

    await randomnessProvider.connect(requester).requestRandomness(requestId);
    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));

    await expect(randomnessProvider.connect(revealer).revealRandomness(requestId, seed))
      .to.emit(randomnessProvider, "RandomnessRevealed")
      .withArgs(requestId, expectedRandomness);

    const [ready, randomness] = await randomnessProvider.readRandomness(requestId);
    expect(ready).to.equal(true);
    expect(randomness).to.equal(expectedRandomness);
  });

  it("restricts requests to the requester role", async function () {
    const { randomnessProvider, other } = await deployRandomnessProviderFixture();

    await expect(randomnessProvider.connect(other).requestRandomness(requestId))
      .to.be.revertedWithCustomError(randomnessProvider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, requesterRole);
  });

  it("restricts commit and reveal to the revealer role", async function () {
    const { randomnessProvider, requester, revealer, other } = await deployRandomnessProviderFixture();

    await randomnessProvider.connect(requester).requestRandomness(requestId);

    await expect(randomnessProvider.connect(other).commitRandomness(requestId, commitmentFor(seed)))
      .to.be.revertedWithCustomError(randomnessProvider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await randomnessProvider.REVEALER_ROLE());

    await randomnessProvider.connect(revealer).commitRandomness(requestId, commitmentFor(seed));

    await expect(randomnessProvider.connect(other).revealRandomness(requestId, seed))
      .to.be.revertedWithCustomError(randomnessProvider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await randomnessProvider.REVEALER_ROLE());
  });
});
