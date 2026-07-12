import { describe, expect, it, vi } from "vitest";
import type { Abi, Address } from "viem";
import type { ProtocolContracts } from "../registry";
import { readKnownInventoryTokenStates, type TokenReadClient } from "../known-inventory-tokens";

const contracts: ProtocolContracts = {
  InventoryRegistry: "0x32657A9d0AFe229E132dA8610a23D6d32d22C4Ee",
  ItemToken: "0x78Cb0aE303a90719F41383E2040D06BBedB2d26d",
  CommitRevealRandomnessProvider: "0xBcD78FfB562cFAeae978Ba38496f042Da6eeB113",
  PackSale: "0x363074770a98a3f8c258148678aFd095c4E5C0Ba",
  Marketplace: "0x2d4Cfd663DDAef48ae4659c09068E842FC31423C",
  BuybackVault: "0x78d0d7C799A6D44085cb4372F1FF6BA49eD224b0",
  Forge: "0x26F77058552b9E69e7d1EE6AADeFeD4BbF555B4B",
  RedemptionRegistry: "0x36C37cb08c78E50a87BB705D6F06EBae11C07451"
};

const account = "0x1234567890abcdef1234567890abcdef12345678" as Address;

function createClient(balances: Record<string, bigint>): TokenReadClient {
  return {
    readContract: vi.fn(
      async ({
        functionName,
        args
      }: {
        address: Address;
        abi: Abi;
        functionName: string;
        args?: readonly unknown[];
      }) => {
        if (functionName === "derivePhysicalTokenId") {
          const inventoryId = String(args?.[0]);
          const tokenIds: Record<string, bigint> = {
            "inv-sample-pkm-raw-001": 1001n,
            "inv-sample-op-raw-001": 1002n,
            "inv-sample-graded-001": 1003n,
            "inv-op06-case-001": 1004n
          };
          return tokenIds[inventoryId] ?? 0n;
        }

        if (functionName === "balanceOf") {
          return balances[String(args?.[1])] ?? 0n;
        }

        return 0n;
      }
    )
  };
}

describe("known inventory token scanner", () => {
  it("derives known seeded token IDs and returns owned balances", async () => {
    const client = createClient({ "1001": 1n });

    const result = await readKnownInventoryTokenStates({ account, contracts, client });

    expect(result.status).toBe("ready");
    expect(result.tokens).toHaveLength(1);
    expect(result.tokens[0]).toMatchObject({
      inventoryId: "inv-sample-pkm-raw-001",
      title: "Pokemon TCG Charizard ex",
      tokenId: 1001n,
      balance: 1n,
      redeemable: true,
      grailTier: "major",
      forgeTier: 2,
      tradeInEligible: true
    });
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: contracts.InventoryRegistry,
        functionName: "derivePhysicalTokenId",
        args: ["inv-sample-pkm-raw-001"]
      })
    );
    expect(client.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: contracts.ItemToken,
        functionName: "balanceOf",
        args: [account, 1001n]
      })
    );
  });

  it("returns an empty state when no seeded inventory balances are found", async () => {
    const result = await readKnownInventoryTokenStates({ account, contracts, client: createClient({}) });

    expect(result.status).toBe("empty");
    expect(result.tokens).toEqual([]);
    expect(result.message).toMatch(/No known inventory tokens found/i);
  });

  it("recognizes the reviewed OP-06 case without making it trade-in eligible", async () => {
    const result = await readKnownInventoryTokenStates({
      account,
      contracts,
      client: createClient({ "1004": 1n })
    });

    expect(result.status).toBe("ready");
    expect(result.tokens).toEqual([
      expect.objectContaining({
        inventoryId: "inv-op06-case-001",
        title: "Wings of the Captain OP-06 Sealed Booster Case",
        tokenId: 1004n,
        balance: 1n,
        redeemable: true,
        grailTier: "grail",
        forgeTier: 4,
        tradeInEligible: false
      })
    ]);
  });

  it("returns sanitized degraded state when a token read fails", async () => {
    const client: TokenReadClient = {
      readContract: async () => {
        throw new Error("RPC failed at https://secret.example/rpc");
      }
    };

    const result = await readKnownInventoryTokenStates({ account, contracts, client });

    expect(result.status).toBe("degraded");
    expect(result.tokens).toEqual([]);
    expect(result.message).toMatch(/Unable to scan known inventory/i);
    expect(result.message).not.toContain("secret.example");
  });
});
