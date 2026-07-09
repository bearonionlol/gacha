import { ROBINHOOD_CHAIN_TESTNET_ID } from "@gacha/shared";
import { buildActivityTimeline, getExplorerTxUrl } from "../activity-index";

describe("activity index", () => {
  it("normalizes protocol events into newest-first user activity", () => {
    const timeline = buildActivityTimeline(
      [
        {
          createdAt: "2026-07-09T00:00:00.000Z",
          detail: "Vault Signal Drop purchase #41",
          txHash: "0xabc",
          type: "PACK_OPENED"
        },
        {
          createdAt: "2026-07-09T00:01:00.000Z",
          detail: "Fire Signal Upgrade recipe #1",
          txHash: "0xdef",
          type: "FORGE_CRAFTED"
        }
      ],
      { chainId: ROBINHOOD_CHAIN_TESTNET_ID }
    );

    expect(timeline[0]?.label).toBe("Forge craft submitted");
    expect(timeline[0]?.nextAction).toBe("Inspect crafted output");
    expect(timeline[0]?.txUrl).toBe("https://explorer.testnet.chain.robinhood.com/tx/0xdef");
    expect(timeline[1]?.label).toBe("Pack opened");
    expect(timeline[1]?.nextAction).toBe("Choose vault, market, buyback, redeem, or Forge");
  });

  it("keeps unsupported chain activity readable without unsafe explorer links", () => {
    expect(getExplorerTxUrl({ chainId: 31337, txHash: "0xabc" })).toBeNull();
  });
});
