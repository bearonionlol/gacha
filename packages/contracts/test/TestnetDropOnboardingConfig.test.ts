import { expect } from "chai";
import { ethers } from "hardhat";
import { parseReviewedDropManifest, singleBuyerAllowlistRoot } from "../scripts/drop-onboarding-config";

const buyer = "0x9Ec1807165F0e887ffDaA044b2224f33Aa49a6dE";

function validManifest() {
  return {
    version: 1,
    inventory: {
      inventoryId: "inv-reviewed-001",
      inventoryHash: `0x${"ab".repeat(32)}`,
      metadataUri: "https://assets.example.com/inv-reviewed-001.json",
      redeemable: true,
      grailProtected: true,
      policy: {
        canonicalKey: "one_piece:op06:sealed_case:english",
        setKey: "one_piece:op06:sealed_case",
        tier: 4,
        tradeInEligible: false,
        tierPoolEligible: false
      }
    },
    drop: {
      expectedDropId: "2",
      name: "Controlled OP-06 Testnet Capsule",
      priceWei: "1000000000000000",
      startTime: "2026-07-12T00:00:00.000Z",
      endTime: "2026-08-12T00:00:00.000Z",
      allowedBuyer: buyer,
      dustPolicyId: "1",
      bonusItems: [
        { tokenId: "7001", amount: "3", tokenUri: "ipfs://metadata/game/fire-shard.json" }
      ]
    }
  };
}

describe("reviewed testnet drop manifest", function () {
  it("parses exact values without lossy JSON numbers", function () {
    const parsed = parseReviewedDropManifest(validManifest());
    expect(parsed.drop.expectedDropId).to.equal(2n);
    expect(parsed.drop.priceWei).to.equal(1_000_000_000_000_000n);
    expect(parsed.drop.allowedBuyer).to.equal(ethers.getAddress(buyer));
    expect(parsed.inventory.policy.tier).to.equal(4);
    expect(parsed.drop.bonusItems[0]).to.deep.equal({
      tokenId: 7001n,
      amount: 3n,
      tokenUri: "ipfs://metadata/game/fire-shard.json"
    });
  });

  it("rejects zero hashes, unsafe numbers, duplicate bonuses, and unknown fields", function () {
    expect(() => parseReviewedDropManifest({
      ...validManifest(),
      inventory: { ...validManifest().inventory, inventoryHash: ethers.ZeroHash }
    })).to.throw(/cannot be zero/);
    expect(() => parseReviewedDropManifest({
      ...validManifest(),
      drop: { ...validManifest().drop, priceWei: 1_000_000_000_000_000 }
    })).to.throw(/decimal string/);
    expect(() => parseReviewedDropManifest({
      ...validManifest(),
      drop: {
        ...validManifest().drop,
        bonusItems: [
          { tokenId: "7001", amount: "1", tokenUri: "ipfs://a" },
          { tokenId: "7001", amount: "1", tokenUri: "ipfs://b" }
        ]
      }
    })).to.throw(/duplicate token IDs/);
    expect(() => parseReviewedDropManifest({ ...validManifest(), unexpected: true })).to.throw(/exactly/);
  });

  it("computes the same double-hashed leaf used by PackSale for a one-wallet tree", function () {
    const inner = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address"], [buyer]));
    expect(singleBuyerAllowlistRoot(buyer)).to.equal(ethers.keccak256(inner));
  });
});
