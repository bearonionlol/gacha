import type { Address } from "viem";
import { readBuybackQuote, type BuybackReadClient } from "../buyback-live";

describe("live buyback quotes", () => {
  it("normalizes active and inactive quote rows", async () => {
    const activeClient: BuybackReadClient = { readContract: async () => [2_500n, true] };
    const inactiveClient: BuybackReadClient = { readContract: async () => ({ price: 0n, active: false }) };
    const vault = "0x0000000000000000000000000000000000000001" as Address;

    await expect(readBuybackQuote(activeClient, vault, 99n)).resolves.toEqual({ tokenId: 99n, price: 2_500n, active: true });
    await expect(readBuybackQuote(inactiveClient, vault, 99n)).resolves.toEqual({ tokenId: 99n, price: 0n, active: false });
  });
});
