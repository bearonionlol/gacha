import type { Abi, Address } from "viem";
import { getForgeWalletSnapshot, type ForgeReadClient } from "../forge-live";

const contracts = {
  Forge: "0x0000000000000000000000000000000000000001" as Address,
  ItemToken: "0x0000000000000000000000000000000000000002" as Address
};
const account = "0x0000000000000000000000000000000000000003" as Address;

describe("Forge live wallet state", () => {
  it("loads recipe limits, approval, wallet crafts, and all required balances", async () => {
    const balances = new Map([[7_001n, 3n], [7_002n, 1n], [7_003n, 0n], [99_001n, 1n]]);
    const client: ForgeReadClient = {
      readContract: async ({ functionName, args }) => {
        if (functionName === "recipes") {
          return {
            outputTokenId: 9_001n,
            outputAmount: 1n,
            fee: 1_000n,
            maxTotalCrafts: 100n,
            maxCraftsPerWallet: 5n,
            totalCrafts: 20n,
            status: 4,
            outputSupplyCap: 100n,
            blueprintHash: `0x${"ab".repeat(32)}`
          };
        }
        if (functionName === "walletCrafts") {
          return 2n;
        }
        if (functionName === "isApprovedForAll") {
          return true;
        }
        if (functionName === "balanceOf") {
          return balances.get(BigInt(String(args?.[1]))) ?? 0n;
        }
        throw new Error(`Unexpected ${functionName}`);
      }
    };

    const snapshot = await getForgeWalletSnapshot({
      account,
      client,
      contracts,
      recipeId: 2n,
      tokenIds: [7_001n, 7_002n, 7_003n, 99_001n]
    });

    expect(snapshot.recipe).toMatchObject({
      outputTokenId: 9_001n,
      fee: 1_000n,
      totalCrafts: 20n,
      status: 4,
      outputSupplyCap: 100n
    });
    expect(snapshot.walletCrafts).toBe(2n);
    expect(snapshot.approved).toBe(true);
    expect(snapshot.balances.get(7_001n)).toBe(3n);
    expect(snapshot.balances.get(7_003n)).toBe(0n);
    expect(snapshot.balances.get(99_001n)).toBe(1n);
  });

  it("normalizes positional tuple responses", async () => {
    const tuple = [9_001n, 1n, "ipfs://output", 1_000n, 1n, 2n, 100n, 5n, 20n, 4, false, true, true, 100n, "0x01", `0x${"cd".repeat(32)}`, false];
    const client: ForgeReadClient = {
      readContract: async ({ functionName }) => {
        if (functionName === "recipes") return tuple;
        if (functionName === "walletCrafts") return 0n;
        if (functionName === "isApprovedForAll") return false;
        return 0n;
      }
    };

    const snapshot = await getForgeWalletSnapshot({ account, client, contracts, recipeId: 2n, tokenIds: [] });
    expect(snapshot.recipe.blueprintHash).toBe(`0x${"cd".repeat(32)}`);
    expect(snapshot.recipe.maxCraftsPerWallet).toBe(5n);
  });
});
