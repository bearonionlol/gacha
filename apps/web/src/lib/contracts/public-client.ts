import { robinhoodChainTestnet } from "@gacha/shared";
import { createPublicClient, http } from "viem";

export function createRobinhoodPublicClient(rpcUrl = process.env.NEXT_PUBLIC_GACHA_RPC_URL) {
  const fallbackRpc = robinhoodChainTestnet.rpcUrls.default.http[0];
  const resolvedRpc = rpcUrl && rpcUrl.trim().length > 0 ? rpcUrl : fallbackRpc;

  return createPublicClient({
    chain: robinhoodChainTestnet,
    transport: http(resolvedRpc)
  });
}
