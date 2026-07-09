"use client";

import { useMemo, useState } from "react";
import { loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";
import { getReadyContractRegistry, type ProtocolContracts } from "../lib/contracts/registry";
import {
  createMarketListRequestForToken,
  createRedemptionRequestForToken,
  parsePositiveTokenId,
  testnetWriteConfig
} from "../lib/contracts/transaction-config";
import { robinhoodTestnetChainId } from "../lib/contracts/wallet";
import { KnownInventoryTokenPicker } from "./known-inventory-token-picker";
import { TransactionActionPanel } from "./transaction-action-panel";

type RegistryPanelState = {
  contracts: ProtocolContracts | null;
  message: string;
};

function useClientRegistry(): RegistryPanelState {
  return useMemo(() => {
    const registry = getReadyContractRegistry(
      loadDeploymentRegistrySnapshotFromEnv({
        NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
      })
    );

    if (registry.contracts === null) {
      return { contracts: null, message: registry.status.message };
    }

    if (registry.chainId !== robinhoodTestnetChainId) {
      return {
        contracts: null,
        message: "This write flow is locked to Robinhood Chain Testnet."
      };
    }

    return { contracts: registry.contracts, message: registry.status.message };
  }, []);
}

export function PackPurchasePanel() {
  const registry = useClientRegistry();

  return (
    <TransactionActionPanel
      contracts={registry.contracts}
      ctaLabel="Reserve pack"
      description="Calls PackSale.purchase with the exact seeded testnet ETH value."
      registryMessage={registry.message}
      summary={[
        { label: "Function", value: "PackSale.purchase" },
        { label: "Drop ID", value: testnetWriteConfig.pack.dropId.toString() },
        { label: "Value", value: testnetWriteConfig.pack.displayValue }
      ]}
      title="Reserve pack on testnet"
      writeRequest={(contracts) => ({
        kind: "packPurchase",
        contracts,
        dropId: testnetWriteConfig.pack.dropId,
        value: testnetWriteConfig.pack.value
      })}
    />
  );
}

type TokenInputPanelProps = {
  inputId: string;
};

export function MarketplaceListPanel({ inputId }: TokenInputPanelProps) {
  const registry = useClientRegistry();
  const [tokenIdInput, setTokenIdInput] = useState("");
  const tokenId = parsePositiveTokenId(tokenIdInput);

  return (
    <div className="transaction-panel-stack">
      <KnownInventoryTokenPicker
        contracts={registry.contracts}
        onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
        registryMessage={registry.message}
      />
      <label className="transaction-input-row" htmlFor={inputId}>
        <span>Owned inventory token ID</span>
        <input
          id={inputId}
          inputMode="numeric"
          onChange={(event) => setTokenIdInput(event.target.value)}
          placeholder="Paste token ID"
          type="text"
          value={tokenIdInput}
        />
      </label>
      <TransactionActionPanel
        actionDisabledReason={tokenId === null ? "Enter an owned inventory token ID before listing." : null}
        approval={{
          ctaLabel: "Approve Marketplace",
          description: "Approves Marketplace as an ERC-1155 operator before escrow listing.",
          writeRequest: (contracts) => ({
            kind: "approval",
            contracts,
            operator: "Marketplace",
            approved: true
          })
        }}
        contracts={registry.contracts}
        ctaLabel="List item"
        description="Calls Marketplace.list for one owned inventory-backed token."
        registryMessage={registry.message}
        summary={[
          { label: "Function", value: "Marketplace.list" },
          { label: "Amount", value: testnetWriteConfig.market.amount.toString() },
          { label: "Ask", value: testnetWriteConfig.market.displayPrice }
        ]}
        title="List item on testnet"
        writeRequest={(contracts) => createMarketListRequestForToken(contracts, tokenId)}
      />
    </div>
  );
}

export function ForgeCraftPanel() {
  const registry = useClientRegistry();

  return (
    <TransactionActionPanel
      approval={{
        ctaLabel: "Approve Forge",
        description: "Approves Forge as an ERC-1155 operator so recipe inputs can be burned.",
        writeRequest: (contracts) => ({
          kind: "approval",
          contracts,
          operator: "Forge",
          approved: true
        })
      }}
      contracts={registry.contracts}
      ctaLabel="Craft recipe"
      description="Calls Forge.craft with the exact seeded recipe fee."
      registryMessage={registry.message}
      summary={[
        { label: "Function", value: "Forge.craft" },
        { label: "Recipe ID", value: testnetWriteConfig.forge.recipeId.toString() },
        { label: "Fee", value: testnetWriteConfig.forge.displayValue }
      ]}
      title="Craft recipe on testnet"
      writeRequest={(contracts) => ({
        kind: "forgeCraft",
        contracts,
        recipeId: testnetWriteConfig.forge.recipeId,
        value: testnetWriteConfig.forge.value
      })}
    />
  );
}

export function RedemptionRequestPanel() {
  const registry = useClientRegistry();
  const [tokenIdInput, setTokenIdInput] = useState("");
  const tokenId = parsePositiveTokenId(tokenIdInput);

  return (
    <div className="transaction-panel-stack">
      <KnownInventoryTokenPicker
        contracts={registry.contracts}
        onSelectTokenId={(selectedTokenId) => setTokenIdInput(selectedTokenId.toString())}
        registryMessage={registry.message}
        requireRedeemable
      />
      <label className="transaction-input-row" htmlFor="redemption-token-id">
        <span>Redeemable inventory token ID</span>
        <input
          id="redemption-token-id"
          inputMode="numeric"
          onChange={(event) => setTokenIdInput(event.target.value)}
          placeholder="Paste token ID"
          type="text"
          value={tokenIdInput}
        />
      </label>
      <TransactionActionPanel
        actionDisabledReason={tokenId === null ? "Enter a redeemable inventory token ID before requesting redemption." : null}
        approval={{
          ctaLabel: "Approve RedemptionRegistry",
          description: "Approves RedemptionRegistry as an ERC-1155 operator before escrow.",
          writeRequest: (contracts) => ({
            kind: "approval",
            contracts,
            operator: "RedemptionRegistry",
            approved: true
          })
        }}
        contracts={registry.contracts}
        ctaLabel="Request redemption"
        description="Calls RedemptionRegistry.requestRedemption for an owned redeemable inventory token."
        registryMessage={registry.message}
        summary={[{ label: "Function", value: "RedemptionRegistry.requestRedemption" }]}
        title="Request redemption on testnet"
        writeRequest={(contracts) => createRedemptionRequestForToken(contracts, tokenId)}
      />
    </div>
  );
}
