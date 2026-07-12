import { AbiCoder, getAddress, isAddress, isHexString, keccak256 } from "ethers";

export type ReviewedDropBonusItem = {
  amount: bigint;
  tokenId: bigint;
  tokenUri: string;
};

export type ReviewedDropManifest = {
  version: 1;
  inventory: {
    grailProtected: boolean;
    inventoryHash: string;
    inventoryId: string;
    metadataUri: string;
    policy: {
      canonicalKey: string;
      setKey: string;
      tier: number;
      tierPoolEligible: boolean;
      tradeInEligible: boolean;
    };
    redeemable: boolean;
  };
  drop: {
    allowedBuyer: string;
    bonusItems: ReviewedDropBonusItem[];
    dustPolicyId: bigint;
    endTime: bigint;
    expectedDropId: bigint;
    name: string;
    priceWei: bigint;
    startTime: bigint;
  };
};

const bytes32Pattern = /^0x[a-fA-F0-9]{64}$/;
const decimalPattern = /^\d+$/;
const maxGameTokenId = (1n << 128n) - 1n;

export function parseReviewedDropManifest(value: unknown): ReviewedDropManifest {
  const root = readObject(value, "manifest");
  assertKeys(root, ["version", "inventory", "drop"], "manifest");
  if (root.version !== 1) throw new Error("manifest.version must be 1");

  const inventory = readObject(root.inventory, "manifest.inventory");
  assertKeys(
    inventory,
    ["inventoryId", "inventoryHash", "metadataUri", "redeemable", "grailProtected", "policy"],
    "manifest.inventory"
  );
  const inventoryHash = readBytes32(inventory.inventoryHash, "manifest.inventory.inventoryHash");
  if (/^0x0{64}$/i.test(inventoryHash)) throw new Error("manifest.inventory.inventoryHash cannot be zero");

  const policy = readObject(inventory.policy, "manifest.inventory.policy");
  assertKeys(
    policy,
    ["canonicalKey", "setKey", "tier", "tradeInEligible", "tierPoolEligible"],
    "manifest.inventory.policy"
  );
  const tier = readInteger(policy.tier, "manifest.inventory.policy.tier", 1, 4);

  const drop = readObject(root.drop, "manifest.drop");
  assertKeys(
    drop,
    [
      "expectedDropId",
      "name",
      "priceWei",
      "startTime",
      "endTime",
      "allowedBuyer",
      "dustPolicyId",
      "bonusItems"
    ],
    "manifest.drop"
  );
  const startTime = readIsoTimestamp(drop.startTime, "manifest.drop.startTime");
  const endTime = readIsoTimestamp(drop.endTime, "manifest.drop.endTime");
  if (endTime <= startTime) throw new Error("manifest.drop.endTime must be after startTime");

  const bonusItems = readArray(drop.bonusItems, "manifest.drop.bonusItems").map((candidate, index) => {
    const bonus = readObject(candidate, `manifest.drop.bonusItems[${index}]`);
    assertKeys(bonus, ["tokenId", "amount", "tokenUri"], `manifest.drop.bonusItems[${index}]`);
    const tokenId = readPositiveBigint(bonus.tokenId, `manifest.drop.bonusItems[${index}].tokenId`);
    if (tokenId > maxGameTokenId) {
      throw new Error(`manifest.drop.bonusItems[${index}].tokenId exceeds the game-token range`);
    }
    return {
      tokenId,
      amount: readPositiveBigint(bonus.amount, `manifest.drop.bonusItems[${index}].amount`),
      tokenUri: readText(bonus.tokenUri, `manifest.drop.bonusItems[${index}].tokenUri`)
    };
  });
  if (bonusItems.length > 4) throw new Error("manifest.drop.bonusItems cannot contain more than 4 entries");
  if (new Set(bonusItems.map(({ tokenId }) => tokenId.toString())).size !== bonusItems.length) {
    throw new Error("manifest.drop.bonusItems contains duplicate token IDs");
  }

  const metadataUri = readText(inventory.metadataUri, "manifest.inventory.metadataUri");
  if (!/^(https:\/\/|ipfs:\/\/|data:application\/json)/.test(metadataUri)) {
    throw new Error("manifest.inventory.metadataUri must use HTTPS, IPFS, or an application/json data URI");
  }
  const allowedBuyer = readText(drop.allowedBuyer, "manifest.drop.allowedBuyer");
  if (!isAddress(allowedBuyer)) throw new Error("manifest.drop.allowedBuyer must be an EVM address");

  return {
    version: 1,
    inventory: {
      inventoryId: readText(inventory.inventoryId, "manifest.inventory.inventoryId"),
      inventoryHash,
      metadataUri,
      redeemable: readBoolean(inventory.redeemable, "manifest.inventory.redeemable"),
      grailProtected: readBoolean(inventory.grailProtected, "manifest.inventory.grailProtected"),
      policy: {
        canonicalKey: readText(policy.canonicalKey, "manifest.inventory.policy.canonicalKey"),
        setKey: readText(policy.setKey, "manifest.inventory.policy.setKey"),
        tier,
        tradeInEligible: readBoolean(
          policy.tradeInEligible,
          "manifest.inventory.policy.tradeInEligible"
        ),
        tierPoolEligible: readBoolean(
          policy.tierPoolEligible,
          "manifest.inventory.policy.tierPoolEligible"
        )
      }
    },
    drop: {
      expectedDropId: readPositiveBigint(drop.expectedDropId, "manifest.drop.expectedDropId"),
      name: readText(drop.name, "manifest.drop.name"),
      priceWei: readPositiveBigint(drop.priceWei, "manifest.drop.priceWei"),
      startTime,
      endTime,
      allowedBuyer: getAddress(allowedBuyer),
      dustPolicyId: readPositiveBigint(drop.dustPolicyId, "manifest.drop.dustPolicyId"),
      bonusItems
    }
  };
}

export function singleBuyerAllowlistRoot(account: string): string {
  if (!isAddress(account)) throw new Error("Single-buyer allowlist account must be an EVM address");
  const encoded = AbiCoder.defaultAbiCoder().encode(["address"], [getAddress(account)]);
  return keccak256(keccak256(encoded));
}

function readObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function readText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function readBytes32(value: unknown, label: string): string {
  if (typeof value !== "string" || !bytes32Pattern.test(value) || !isHexString(value, 32)) {
    throw new Error(`${label} must be bytes32`);
  }
  return value;
}

function readInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function readPositiveBigint(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !decimalPattern.test(value)) {
    throw new Error(`${label} must be a decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed <= 0n) throw new Error(`${label} must be positive`);
  return parsed;
}

function readIsoTimestamp(value: unknown, label: string): bigint {
  const timestamp = readText(value, label);
  const milliseconds = Date.parse(timestamp);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString() !== timestamp) {
    throw new Error(`${label} must be an exact ISO-8601 UTC timestamp`);
  }
  return BigInt(Math.floor(milliseconds / 1_000));
}

function assertKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const allowed = [...expected].sort();
  if (actual.length !== allowed.length || actual.some((key, index) => key !== allowed[index])) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}`);
  }
}
