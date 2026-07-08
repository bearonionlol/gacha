import { describe, expect, it } from "vitest";
import type { Chain } from "viem";

import { robinhoodChain, robinhoodChainTestnet, robinhoodChainsById } from "../chains";

describe("Robinhood Chain config", () => {
  it("defines viem-compatible mainnet and testnet chain metadata", () => {
    const mainnet: Chain = robinhoodChain;
    const testnet: Chain = robinhoodChainTestnet;

    expect(mainnet.id).toBe(4663);
    expect(testnet.id).toBe(46630);
    expect(mainnet.name).toBe("Robinhood Chain");
    expect(testnet.name).toBe("Robinhood Chain Testnet");
  });

  it("uses the public Robinhood RPC URLs and ETH native currency", () => {
    expect(robinhoodChain.rpcUrls.default.http).toEqual(["https://rpc.mainnet.chain.robinhood.com"]);
    expect(robinhoodChainTestnet.rpcUrls.default.http).toEqual(["https://rpc.testnet.chain.robinhood.com"]);
    expect(robinhoodChain.nativeCurrency.symbol).toBe("ETH");
    expect(robinhoodChainTestnet.nativeCurrency.symbol).toBe("ETH");
  });

  it("provides lookup by chain ID", () => {
    expect(robinhoodChainsById[4663]).toBe(robinhoodChain);
    expect(robinhoodChainsById[46630]).toBe(robinhoodChainTestnet);
  });
});
