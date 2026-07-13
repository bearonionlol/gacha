import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { ethers, network } from "hardhat";
import type { BaseContract, ContractTransactionResponse } from "ethers";

type DeploymentFile = {
  chainId: number;
  contracts: {
    CommitRevealRandomnessProvider: string;
    PackSale: string;
  };
};

type RandomnessProviderContract = BaseContract & {
  REVEALER_ROLE(): Promise<string>;
  hasRole(role: string, account: string): Promise<boolean>;
  readRandomness(requestId: string): Promise<[boolean, bigint]>;
  commitRandomness(requestId: string, commitment: string): Promise<ContractTransactionResponse>;
  revealRandomness: {
    (requestId: string, seed: string): Promise<ContractTransactionResponse>;
    staticCall(requestId: string, seed: string): Promise<void>;
  };
};

type RandomnessJournal = {
  buyer: string;
  commitment: string;
  commitTransactionHash?: string;
  completedAt?: string;
  purchaseId: string;
  requestId: string;
  revealTransactionHash?: string;
  seed: string;
};

function requireAddress(value: string | undefined, label: string): string {
  if (!value || !ethers.isAddress(value)) throw new Error(`Invalid ${label} address in deployment registry`);
  return ethers.getAddress(value);
}

function loadDeployment(): DeploymentFile {
  const deploymentPath = path.resolve(__dirname, "../../../deployments", `${network.name}.json`);
  if (!existsSync(deploymentPath)) throw new Error(`Missing deployment file: ${deploymentPath}`);
  return JSON.parse(readFileSync(deploymentPath, "utf8")) as DeploymentFile;
}

function parsePurchaseId(value: string | undefined): bigint {
  if (!value || !/^\d+$/.test(value) || BigInt(value) <= 0n) {
    throw new Error("TESTNET_PURCHASE_ID must be a positive integer");
  }
  return BigInt(value);
}

function requestIdFor(packSale: string, purchaseId: bigint, buyer: string, chainId: bigint): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "address", "uint256"],
      [packSale, purchaseId, buyer, chainId]
    )
  );
}

function commitmentFor(seed: string): string {
  return ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["bytes32"], [seed]));
}

function journalPath(requestId: string): string {
  return path.resolve(__dirname, "../../..", ".testnet-operator", "randomness", `${requestId}.json`);
}

function loadOrCreateJournal(requestId: string, purchaseId: bigint, buyer: string): RandomnessJournal {
  const filePath = journalPath(requestId);
  if (existsSync(filePath)) {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as RandomnessJournal;
    if (
      parsed.requestId !== requestId || parsed.purchaseId !== purchaseId.toString()
        || parsed.buyer.toLowerCase() !== buyer.toLowerCase() || !ethers.isHexString(parsed.seed, 32)
        || parsed.commitment !== commitmentFor(parsed.seed)
    ) {
      throw new Error(`Invalid randomness recovery journal: ${filePath}`);
    }
    return parsed;
  }

  const seed = ethers.hexlify(randomBytes(32));
  const journal = {
    buyer,
    commitment: commitmentFor(seed),
    purchaseId: purchaseId.toString(),
    requestId,
    seed
  } satisfies RandomnessJournal;
  writeJournal(journal);
  return journal;
}

function writeJournal(journal: RandomnessJournal): void {
  const filePath = journalPath(journal.requestId);
  mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  writeFileSync(filePath, `${JSON.stringify(journal, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(filePath, 0o600);
}

function extractErrorData(error: unknown, seen = new Set<unknown>()): string | undefined {
  if (!error || typeof error !== "object" || seen.has(error)) return undefined;
  seen.add(error);
  const record = error as Record<string, unknown>;
  if (typeof record.data === "string" && record.data.startsWith("0x")) return record.data;
  for (const key of ["error", "info", "receipt"] as const) {
    const nested = extractErrorData(record[key], seen);
    if (nested) return nested;
  }
  return undefined;
}

function parsedErrorName(contract: BaseContract, error: unknown): string | null {
  const data = extractErrorData(error);
  if (!data) return null;
  try {
    return contract.interface.parseError(data)?.name ?? null;
  } catch {
    return null;
  }
}

async function submit(label: string, request: Promise<ContractTransactionResponse>): Promise<string> {
  const transaction = await request;
  const receipt = await transaction.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`${label} reverted`);
  console.log(`${label}: ${transaction.hash}`);
  return transaction.hash;
}

async function main(): Promise<void> {
  if (network.name !== "robinhoodTestnet") {
    throw new Error("Pack randomness fulfillment is restricted to robinhoodTestnet");
  }
  const deployment = loadDeployment();
  const chain = await ethers.provider.getNetwork();
  if (deployment.chainId !== Number(chain.chainId) || chain.chainId !== 46_630n) {
    throw new Error(`Expected Robinhood testnet chain 46630, received ${chain.chainId}`);
  }
  const purchaseId = parsePurchaseId(process.env.TESTNET_PURCHASE_ID);
  const [operator] = await ethers.getSigners();
  if (!operator) throw new Error("No testnet randomness operator signer is configured");
  const operatorAddress = await operator.getAddress();
  const buyer = requireAddress(process.env.TESTNET_PURCHASE_BUYER ?? operatorAddress, "testnet purchase buyer");
  const packSaleAddress = requireAddress(deployment.contracts.PackSale, "PackSale");
  const randomnessProvider = (await ethers.getContractAt(
    "CommitRevealRandomnessProvider",
    requireAddress(deployment.contracts.CommitRevealRandomnessProvider, "CommitRevealRandomnessProvider")
  )) as unknown as RandomnessProviderContract;
  const role = await randomnessProvider.REVEALER_ROLE();
  if (!(await randomnessProvider.hasRole(role, operatorAddress))) {
    throw new Error(`${operatorAddress} is missing CommitRevealRandomnessProvider.REVEALER_ROLE`);
  }

  const requestId = requestIdFor(packSaleAddress, purchaseId, buyer, chain.chainId);
  const latestBlock = await ethers.provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 100_000);
  const event = new ethers.Interface([
    "event PackPurchased(uint256 indexed purchaseId,uint256 indexed dropId,address indexed buyer,bytes32 requestId,uint256 price)"
  ]);
  const eventFragment = event.getEvent("PackPurchased");
  if (!eventFragment) throw new Error("PackPurchased event ABI is unavailable");
  const logs = await ethers.provider.getLogs({
    address: packSaleAddress,
    fromBlock,
    toBlock: latestBlock,
    topics: [
      eventFragment.topicHash,
      ethers.zeroPadValue(ethers.toBeHex(purchaseId), 32),
      null,
      ethers.zeroPadValue(buyer, 32)
    ]
  });
  const matchingEvent = logs.map((log) => event.parseLog(log)).find((parsed) => parsed?.args.requestId === requestId);
  if (!matchingEvent) {
    throw new Error("No matching PackPurchased event was found for the purchase ID and buyer in the recent block window");
  }

  const [alreadyReady] = await randomnessProvider.readRandomness(requestId);
  if (alreadyReady) {
    console.log(JSON.stringify({ purchaseId: purchaseId.toString(), buyer, requestId, ready: true }));
    return;
  }

  const journal = loadOrCreateJournal(requestId, purchaseId, buyer);
  let commitmentMissing = false;
  try {
    await randomnessProvider.revealRandomness.staticCall(requestId, journal.seed);
  } catch (error: unknown) {
    const errorName = parsedErrorName(randomnessProvider, error);
    if (errorName === "RandomnessCommitmentMissing") {
      commitmentMissing = true;
    } else if (errorName === "RandomnessSeedMismatch") {
      throw new Error("The on-chain commitment does not match the local recovery journal seed");
    } else {
      throw error;
    }
  }

  if (commitmentMissing) {
    journal.commitTransactionHash = await submit(
      "commit pack randomness",
      randomnessProvider.commitRandomness(requestId, journal.commitment)
    );
    writeJournal(journal);
  }
  journal.revealTransactionHash = await submit(
    "reveal pack randomness",
    randomnessProvider.revealRandomness(requestId, journal.seed)
  );
  journal.completedAt = new Date().toISOString();
  writeJournal(journal);

  const [ready] = await randomnessProvider.readRandomness(requestId);
  if (!ready) throw new Error("Randomness provider did not become ready after reveal");
  console.log(JSON.stringify({
    purchaseId: purchaseId.toString(),
    buyer,
    requestId,
    ready,
    commitTransactionHash: journal.commitTransactionHash ?? null,
    revealTransactionHash: journal.revealTransactionHash
  }));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
