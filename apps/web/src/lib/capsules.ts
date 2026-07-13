import type { Address, Hex } from "viem";

export type CapsulePurchase = {
  buyerAddress: Address;
  chainId: number;
  dropId: string;
  inventoryId: string | null;
  priceWei: string;
  purchaseBlockNumber: string;
  purchaseId: string;
  purchaseTransactionHash: Hex;
  refundTransactionHash: Hex | null;
  requestId: Hex;
  revealTransactionHash: Hex | null;
  status: "pending" | "revealed" | "refunded";
  tokenId: string | null;
};
