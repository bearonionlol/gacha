import type { Chain } from "viem";

export const ROBINHOOD_CHAIN_MAINNET_ID = 4663;
export const ROBINHOOD_CHAIN_TESTNET_ID = 46630;

export const ROBINHOOD_CHAIN_MAINNET_RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const ROBINHOOD_CHAIN_TESTNET_RPC_URL = "https://rpc.testnet.chain.robinhood.com";

const nativeCurrency = {
  name: "Ether",
  symbol: "ETH",
  decimals: 18
} as const;

export const robinhoodChain = {
  id: ROBINHOOD_CHAIN_MAINNET_ID,
  name: "Robinhood Chain",
  nativeCurrency,
  rpcUrls: {
    default: {
      http: [ROBINHOOD_CHAIN_MAINNET_RPC_URL]
    },
    public: {
      http: [ROBINHOOD_CHAIN_MAINNET_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com"
    }
  },
  testnet: false
} as const satisfies Chain;

export const robinhoodChainTestnet = {
  id: ROBINHOOD_CHAIN_TESTNET_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency,
  rpcUrls: {
    default: {
      http: [ROBINHOOD_CHAIN_TESTNET_RPC_URL]
    },
    public: {
      http: [ROBINHOOD_CHAIN_TESTNET_RPC_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://explorer.testnet.chain.robinhood.com"
    }
  },
  testnet: true
} as const satisfies Chain;

export const robinhoodChains = [robinhoodChain, robinhoodChainTestnet] as const;

export const robinhoodChainsById: Readonly<Partial<Record<number, Chain>>> = {
  [robinhoodChain.id]: robinhoodChain,
  [robinhoodChainTestnet.id]: robinhoodChainTestnet
};
