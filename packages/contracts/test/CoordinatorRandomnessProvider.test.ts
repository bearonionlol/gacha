import { expect } from "chai";
import { ethers } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const requestId = ethers.id("coordinator-randomness-request");

function requireSigner(
  signers: HardhatEthersSigner[],
  index: number,
  label: string
): HardhatEthersSigner {
  const signer = signers[index];
  if (!signer) throw new Error(`Missing ${label} signer`);
  return signer;
}

async function deployFixture(requestFee = 100n, maxRequestFee = 200n) {
  const signers = await ethers.getSigners();
  const deployer = requireSigner(signers, 0, "deployer");
  const requester = requireSigner(signers, 1, "requester");
  const fundAdmin = requireSigner(signers, 2, "fund admin");
  const other = requireSigner(signers, 3, "other");
  const coordinator: any = await ethers.deployContract("MockRandomnessCoordinator", [requestFee]);
  await coordinator.waitForDeployment();
  const coordinatorAddress = await coordinator.getAddress();
  const coordinatorCodeHash = ethers.keccak256(await ethers.provider.getCode(coordinatorAddress));
  const provider: any = await ethers.deployContract("CoordinatorRandomnessProvider", [
    coordinatorAddress,
    coordinatorCodeHash,
    maxRequestFee
  ]);
  await provider.waitForDeployment();
  await provider.grantRole(await provider.REQUESTER_ROLE(), requester.address);
  await provider.grantRole(await provider.FUND_ADMIN_ROLE(), fundAdmin.address);

  return { deployer, requester, fundAdmin, other, coordinator, coordinatorCodeHash, provider };
}

describe("CoordinatorRandomnessProvider", function () {
  it("pins coordinator bytecode and rejects invalid constructor inputs", async function () {
    const signers = await ethers.getSigners();
    const requester = requireSigner(signers, 1, "requester");
    const coordinator: any = await ethers.deployContract("MockRandomnessCoordinator", [0n]);
    await coordinator.waitForDeployment();
    const coordinatorAddress = await coordinator.getAddress();
    const actualCodeHash = ethers.keccak256(await ethers.provider.getCode(coordinatorAddress));

    await expect(
      ethers.deployContract("CoordinatorRandomnessProvider", [
        ethers.ZeroAddress,
        actualCodeHash,
        0n
      ])
    ).to.be.revertedWithCustomError(
      await ethers.getContractFactory("CoordinatorRandomnessProvider"),
      "InvalidAddress"
    );

    await expect(
      ethers.deployContract("CoordinatorRandomnessProvider", [
        requester.address,
        actualCodeHash,
        0n
      ])
    )
      .to.be.revertedWithCustomError(
        await ethers.getContractFactory("CoordinatorRandomnessProvider"),
        "CoordinatorHasNoCode"
      )
      .withArgs(requester.address);

    await expect(
      ethers.deployContract("CoordinatorRandomnessProvider", [
        coordinatorAddress,
        ethers.ZeroHash,
        0n
      ])
    )
      .to.be.revertedWithCustomError(
        await ethers.getContractFactory("CoordinatorRandomnessProvider"),
        "InvalidCoordinatorCodeHash"
      )
      .withArgs(ethers.ZeroHash, actualCodeHash);
  });

  it("pays the bounded coordinator fee and stores one verified callback", async function () {
    const { deployer, requester, coordinator, provider } = await deployFixture();
    await deployer.sendTransaction({ to: await provider.getAddress(), value: 1_000n });

    await provider.connect(requester).requestRandomness(requestId);
    const coordinatorRequestId = await provider.coordinatorRequestByClientRequest(requestId);
    expect(coordinatorRequestId).to.not.equal(ethers.ZeroHash);
    expect(await provider.clientRequestByCoordinatorRequest(coordinatorRequestId)).to.equal(requestId);
    expect(await ethers.provider.getBalance(await provider.getAddress())).to.equal(900n);
    expect(await ethers.provider.getBalance(await coordinator.getAddress())).to.equal(100n);
    expect(await provider.readRandomness(requestId)).to.deep.equal([false, 0n]);

    await expect(coordinator.fulfill(coordinatorRequestId, 42n))
      .to.emit(provider, "RandomnessFulfilled")
      .withArgs(requestId, coordinatorRequestId, 42n);
    expect(await provider.readRandomness(requestId)).to.deep.equal([true, 42n]);
    await expect(coordinator.fulfill(coordinatorRequestId, 43n))
      .to.be.revertedWithCustomError(provider, "RandomnessAlreadyFulfilled")
      .withArgs(requestId);
  });

  it("fails closed for unauthorized, duplicate, unfunded, and over-cap requests", async function () {
    const { requester, other, coordinator, provider } = await deployFixture();
    await expect(provider.connect(other).requestRandomness(requestId))
      .to.be.revertedWithCustomError(provider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await provider.REQUESTER_ROLE());
    await expect(provider.connect(requester).requestRandomness(ethers.ZeroHash)).to.be.revertedWithCustomError(
      provider,
      "ZeroRequestId"
    );
    await expect(provider.connect(requester).requestRandomness(requestId))
      .to.be.revertedWithCustomError(provider, "InsufficientRequestFunding")
      .withArgs(100n, 0n);

    await other.sendTransaction({ to: await provider.getAddress(), value: 1_000n });
    await provider.connect(requester).requestRandomness(requestId);
    await expect(provider.connect(requester).requestRandomness(requestId))
      .to.be.revertedWithCustomError(provider, "RandomnessRequestAlreadyExists")
      .withArgs(requestId);

    const secondRequest = ethers.id("over-cap-request");
    await coordinator.setRequestFee(201n);
    await expect(provider.connect(requester).requestRandomness(secondRequest))
      .to.be.revertedWithCustomError(provider, "RequestFeeExceedsCap")
      .withArgs(201n, 200n);
  });

  it("accepts callbacks only from the pinned coordinator and rejects invalid results", async function () {
    const { deployer, requester, other, coordinator, provider } = await deployFixture(0n, 0n);
    await provider.connect(requester).requestRandomness(requestId);
    const coordinatorRequestId = await provider.coordinatorRequestByClientRequest(requestId);

    await expect(provider.connect(other).fulfillRandomness(coordinatorRequestId, 1n))
      .to.be.revertedWithCustomError(provider, "UnauthorizedCoordinator")
      .withArgs(other.address);
    await expect(coordinator.fulfillTo(await provider.getAddress(), ethers.id("unknown"), 1n))
      .to.be.revertedWithCustomError(provider, "UnknownCoordinatorRequest")
      .withArgs(ethers.id("unknown"));
    await expect(coordinator.fulfill(coordinatorRequestId, 0n))
      .to.be.revertedWithCustomError(provider, "ZeroRandomness")
      .withArgs(coordinatorRequestId);

    await coordinator.setReturnZeroRequestId(true);
    await expect(provider.connect(requester).requestRandomness(ethers.id("zero-coordinator-id"))).to.be
      .revertedWithCustomError(provider, "InvalidCoordinatorRequestId");
    expect(await ethers.provider.getBalance(await provider.getAddress())).to.equal(0n);
    expect(deployer.address).to.not.equal(ethers.ZeroAddress);
  });

  it("restricts request-fund withdrawals and preserves failed withdrawal state", async function () {
    const { deployer, fundAdmin, other, provider } = await deployFixture();
    await deployer.sendTransaction({ to: await provider.getAddress(), value: 1_000n });

    await expect(provider.connect(other).withdrawRequestFunding(other.address, 1n))
      .to.be.revertedWithCustomError(provider, "AccessControlUnauthorizedAccount")
      .withArgs(other.address, await provider.FUND_ADMIN_ROLE());
    await expect(provider.connect(fundAdmin).withdrawRequestFunding(ethers.ZeroAddress, 1n))
      .to.be.revertedWithCustomError(provider, "InvalidWithdrawal")
      .withArgs(ethers.ZeroAddress, 1n);
    await expect(provider.connect(fundAdmin).withdrawRequestFunding(fundAdmin.address, 250n))
      .to.emit(provider, "RequestFundingWithdrawn")
      .withArgs(fundAdmin.address, 250n, 750n);
    expect(await ethers.provider.getBalance(await provider.getAddress())).to.equal(750n);
  });
});
