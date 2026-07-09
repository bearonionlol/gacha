import { robinhoodChainTestnet } from "@gacha/shared";
import { createWalletClient, custom, type Abi, type Address, type Hash, type TransactionReceipt } from "viem";
import { forgeAbi, itemTokenAbi, marketplaceAbi, packSaleAbi, redemptionRegistryAbi } from "./abis";
import type { ProtocolContractName, ProtocolContracts } from "./registry";
import type { Eip1193Provider } from "./wallet";

export type ApprovalOperator = Extract<ProtocolContractName, "Marketplace" | "Forge" | "RedemptionRegistry">;

export type WriteRequest =
  | {
      kind: "packPurchase";
      contracts: ProtocolContracts;
      dropId: bigint;
      value: bigint;
    }
  | {
      kind: "approval";
      contracts: ProtocolContracts;
      operator: ApprovalOperator;
      approved: boolean;
    }
  | {
      kind: "marketList";
      contracts: ProtocolContracts;
      tokenId: bigint;
      amount: bigint;
      price: bigint;
    }
  | {
      kind: "forgeCraft";
      contracts: ProtocolContracts;
      recipeId: bigint;
      value: bigint;
    }
  | {
      kind: "redemptionRequest";
      contracts: ProtocolContracts;
      tokenId: bigint;
    };

export type PreparedWrite = {
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  value?: bigint;
};

export type ReceiptClient = {
  waitForTransactionReceipt: (parameters: { hash: Hash; timeout?: number }) => Promise<TransactionReceipt>;
};

export function createWriteRequest(request: WriteRequest): PreparedWrite {
  if (request.kind === "packPurchase") {
    return {
      address: request.contracts.PackSale,
      abi: packSaleAbi as Abi,
      functionName: "purchase",
      args: [request.dropId],
      value: request.value
    };
  }

  if (request.kind === "approval") {
    return {
      address: request.contracts.ItemToken,
      abi: itemTokenAbi as Abi,
      functionName: "setApprovalForAll",
      args: [request.contracts[request.operator], request.approved]
    };
  }

  if (request.kind === "marketList") {
    return {
      address: request.contracts.Marketplace,
      abi: marketplaceAbi as Abi,
      functionName: "list",
      args: [request.tokenId, request.amount, request.price]
    };
  }

  if (request.kind === "forgeCraft") {
    return {
      address: request.contracts.Forge,
      abi: forgeAbi as Abi,
      functionName: "craft",
      args: [request.recipeId],
      value: request.value
    };
  }

  return {
    address: request.contracts.RedemptionRegistry,
    abi: redemptionRegistryAbi as Abi,
    functionName: "requestRedemption",
    args: [request.tokenId]
  };
}

export function createInjectedWalletClient(provider: Eip1193Provider) {
  return createWalletClient({
    chain: robinhoodChainTestnet,
    transport: custom(provider)
  });
}

export async function sendPreparedWrite(provider: Eip1193Provider, account: Address, request: PreparedWrite) {
  const walletClient = createInjectedWalletClient(provider);

  return walletClient.writeContract({
    account,
    chain: robinhoodChainTestnet,
    address: request.address,
    abi: request.abi,
    functionName: request.functionName,
    args: request.args,
    value: request.value
  });
}

export function waitForTransactionReceipt(client: ReceiptClient, hash: Hash): Promise<TransactionReceipt> {
  return client.waitForTransactionReceipt({ hash, timeout: 60_000 });
}

export function formatTransactionHash(hash: Hash): string {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

export function buildExplorerTxUrl(hash: Hash): string {
  return `${robinhoodChainTestnet.blockExplorers.default.url}/tx/${hash}`;
}

export function getTransactionErrorMessage(error: unknown): string {
  if (hasProviderErrorCode(error, 4001)) {
    return "Transaction rejected in wallet.";
  }

  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("insufficient funds") || message.includes("exceeds the balance")) {
    return "Wallet does not have enough testnet ETH for this action.";
  }

  return "Transaction failed or could not be confirmed. Review wallet details and retry.";
}

function hasProviderErrorCode(error: unknown, code: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code: unknown }).code) === code
  );
}
