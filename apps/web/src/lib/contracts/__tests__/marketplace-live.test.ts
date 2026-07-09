import type { Address } from "viem";
import { readMarketplaceListing, type MarketplaceReadClient } from "../marketplace-live";

describe("live marketplace listing reads", () => {
  it("normalizes an active on-chain listing", async () => {
    const client: MarketplaceReadClient = {
      readContract: async () => [
        "0x1234567890abcdef1234567890abcdef12345678",
        99n,
        1n,
        15_000n,
        true,
        false,
        false
      ]
    };

    await expect(
      readMarketplaceListing(client, "0x0000000000000000000000000000000000000001" as Address, 7n)
    ).resolves.toEqual({
      id: 7n,
      seller: "0x1234567890abcdef1234567890abcdef12345678",
      tokenId: 99n,
      amount: 1n,
      price: 15_000n,
      active: true,
      sold: false,
      cancelled: false
    });
  });

  it("treats an empty mapping row as a missing listing", async () => {
    const client: MarketplaceReadClient = {
      readContract: async () => ["0x0000000000000000000000000000000000000000", 0n, 0n, 0n, false, false, false]
    };

    await expect(
      readMarketplaceListing(client, "0x0000000000000000000000000000000000000001" as Address, 9n)
    ).resolves.toBeNull();
  });
});
