"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther, isAddress, keccak256, stringToHex, type Address } from "viem";
import { Activity, Coins, ShieldCheck } from "lucide-react";
import { loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";
import { dustLedgerAbi, itemTokenAbi, vaultForgeAbi, vaultPassportAbi } from "../lib/contracts/abis";
import { createRobinhoodPublicClient } from "../lib/contracts/public-client";
import { getReadyContractRegistry, type ProtocolContracts } from "../lib/contracts/registry";
import { parsePositiveActionId, parsePositiveTokenId } from "../lib/contracts/transaction-config";
import type { PreparedWrite } from "../lib/contracts/transactions";
import { robinhoodTestnetChainId } from "../lib/contracts/wallet";
import { TransactionActionPanel } from "./transaction-action-panel";

type LiveAction = "craft" | "exchange" | "reveal" | "select" | "default" | "cancel";
type LiveRecipe = {
  id: number;
  label: string;
  tradeIns: number;
  ascension: boolean;
};

const recipes: LiveRecipe[] = [
  { id: 0, label: "Recast Seal", tradeIns: 1, ascension: false },
  { id: 1, label: "Guided Recast", tradeIns: 1, ascension: false },
  { id: 2, label: "Ascension Seal", tradeIns: 2, ascension: true },
  { id: 3, label: "Guided Ascension", tradeIns: 2, ascension: true },
  { id: 4, label: "Set-Focused Ascension", tradeIns: 2, ascension: true }
];

const actionLabels: Record<LiveAction, string> = {
  craft: "Create claim",
  exchange: "Exchange Dust",
  reveal: "Reveal claim",
  select: "Choose candidate",
  default: "Settle default",
  cancel: "Cancel expired claim"
};

const dustKindLabels = ["Magic", "Echo", "Prism", "Star"] as const;

type LiveAddresses = {
  VaultForge: Address;
  DustLedger: Address;
  VaultPassport: Address;
};

type RecipeConfig = {
  dustAmounts: readonly bigint[];
  fee: bigint;
  active: boolean;
};

export function VaultForgeLivePanel() {
  const registry = useMemo(() => loadLiveRegistry(), []);
  const client = useMemo(() => createRobinhoodPublicClient(), []);
  const [action, setAction] = useState<LiveAction>("craft");
  const [recipeId, setRecipeId] = useState(0);
  const [anchorInput, setAnchorInput] = useState("");
  const [tradeInInputs, setTradeInInputs] = useState(["", ""]);
  const [duplicateProofInputs, setDuplicateProofInputs] = useState(["", ""]);
  const [claimInput, setClaimInput] = useState("");
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [fromDust, setFromDust] = useState(1);
  const [toDust, setToDust] = useState(2);
  const [account, setAccount] = useState<Address | null>(null);
  const [config, setConfig] = useState<RecipeConfig | null>(null);
  const [dustBalances, setDustBalances] = useState<readonly bigint[] | null>(null);
  const [passportRank, setPassportRank] = useState<number | null>(null);
  const [refresh, setRefresh] = useState(0);

  const recipe = recipes[recipeId] ?? recipes[0]!;
  const anchorTokenId = parsePositiveTokenId(anchorInput);
  const tradeInTokenIds = tradeInInputs.slice(0, recipe.tradeIns).map(parsePositiveTokenId);
  const duplicateProofTokenIds = duplicateProofInputs.slice(0, recipe.tradeIns).map(parsePositiveTokenId);
  const claimId = parsePositiveActionId(claimInput);
  const imprintHash = keccak256(stringToHex(
    `vault-ascension-v4:${recipeId}:${anchorInput}:${tradeInInputs.join(":")}:${duplicateProofInputs.join(":")}`
  ));

  useEffect(() => {
    let cancelled = false;
    if (registry.addresses === null) {
      setConfig(null);
      return () => {
        cancelled = true;
      };
    }
    void client.readContract({
      address: registry.addresses.VaultForge,
      abi: vaultForgeAbi,
      functionName: "getRecipeConfig",
      args: [recipeId]
    }).then(
      (nextConfig) => {
        if (!cancelled) setConfig({
          dustAmounts: nextConfig.dustAmounts,
          fee: nextConfig.fee,
          active: nextConfig.active
        });
      },
      () => {
        if (!cancelled) setConfig(null);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [client, recipeId, refresh, registry.addresses]);

  useEffect(() => {
    let cancelled = false;
    if (registry.addresses === null || account === null) {
      setDustBalances(null);
      setPassportRank(null);
      return () => {
        cancelled = true;
      };
    }
    void Promise.all([
      client.readContract({
        address: registry.addresses.DustLedger,
        abi: dustLedgerAbi,
        functionName: "balancesOf",
        args: [account]
      }),
      client.readContract({
        address: registry.addresses.VaultPassport,
        abi: vaultPassportAbi,
        functionName: "rankOf",
        args: [account]
      })
    ]).then(
      ([balances, rank]) => {
        if (!cancelled) {
          setDustBalances(balances);
          setPassportRank(rank);
        }
      },
      () => {
        if (!cancelled) {
          setDustBalances(null);
          setPassportRank(null);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [account, client, refresh, registry.addresses]);

  const disabledReason = getDisabledReason({
    action,
    anchorTokenId,
    claimId,
    config,
    recipe,
    toDust,
    fromDust,
    tradeInTokenIds,
    duplicateProofTokenIds
  });
  const preparedWrite = createLiveWrite({
    action,
    addresses: registry.addresses,
    account,
    anchorTokenId,
    candidateIndex,
    claimId,
    config,
    fromDust,
    imprintHash,
    recipe,
    toDust,
    tradeInTokenIds,
    duplicateProofTokenIds
  });
  const summary = buildSummary(action, recipe, config, claimId, candidateIndex, fromDust, toDust);

  return (
    <section className="panel vault-forge-live" id="vault-forge-live" aria-labelledby="vault-forge-live-title">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Robinhood Chain Testnet</span>
          <h2 id="vault-forge-live-title">Live settlement</h2>
        </div>
        <span className="chain-pill">VaultForge V4</span>
      </div>

      <div className="vault-forge-live-metrics">
        <div><ShieldCheck size={16} aria-hidden="true" /><span>Passport rank</span><strong>{passportRank ?? "-"}</strong></div>
        {(["Magic", "Echo", "Prism", "Star"] as const).map((label, index) => (
          <div key={label}><Coins size={16} aria-hidden="true" /><span>{label}</span><strong>{dustBalances?.[index]?.toString() ?? "-"}</strong></div>
        ))}
      </div>

      <div className="vault-forge-live-fields">
        <label>
          <span>Action</span>
          <select aria-label="Vault Forge action" value={action} onChange={(event) => setAction(event.target.value as LiveAction)}>
            <option value="craft">Craft blueprint</option>
            <option value="exchange">Exchange Dust</option>
            <option value="reveal">Reveal claim</option>
            <option value="select">Choose guided candidate</option>
            <option value="default">Settle expired choice</option>
            <option value="cancel">Cancel randomness timeout</option>
          </select>
        </label>

        {action === "craft" ? (
          <>
            <label>
              <span>Blueprint</span>
              <select aria-label="Live Vault Forge blueprint" value={recipeId} onChange={(event) => setRecipeId(Number(event.target.value))}>
                {recipes.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
              </select>
            </label>
            {recipe.ascension ? (
              <label><span>Anchor token ID</span><input inputMode="numeric" value={anchorInput} onChange={(event) => setAnchorInput(event.target.value)} /></label>
            ) : null}
            {Array.from({ length: recipe.tradeIns }, (_, index) => (
              <div className="vault-forge-live-pair" key={index}>
                <label>
                  <span>Trade-in token {index + 1}</span>
                  <input
                    inputMode="numeric"
                    value={tradeInInputs[index] ?? ""}
                    onChange={(event) => setTradeInInputs((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))}
                  />
                </label>
                <label>
                  <span>Retained duplicate proof {index + 1}</span>
                  <input
                    inputMode="numeric"
                    value={duplicateProofInputs[index] ?? ""}
                    onChange={(event) => setDuplicateProofInputs((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))}
                  />
                </label>
              </div>
            ))}
          </>
        ) : null}

        {action === "exchange" ? (
          <>
            <label><span>Spend</span><select value={fromDust} onChange={(event) => setFromDust(Number(event.target.value))}><option value={1}>Echo</option><option value={2}>Prism</option><option value={3}>Star</option></select></label>
            <label><span>Receive</span><select value={toDust} onChange={(event) => setToDust(Number(event.target.value))}><option value={1}>Echo</option><option value={2}>Prism</option><option value={3}>Star</option></select></label>
          </>
        ) : null}

        {action !== "craft" && action !== "exchange" ? (
          <label><span>Claim ID</span><input inputMode="numeric" value={claimInput} onChange={(event) => setClaimInput(event.target.value)} /></label>
        ) : null}
        {action === "select" ? (
          <label><span>Candidate</span><select value={candidateIndex} onChange={(event) => setCandidateIndex(Number(event.target.value))}><option value={0}>Choice 1</option><option value={1}>Choice 2</option><option value={2}>Choice 3</option></select></label>
        ) : null}
      </div>

      <div className="vault-forge-live-note">
        <Activity size={17} aria-hidden="true" />
        <p>{buildActionNote(action)}</p>
      </div>

      <TransactionActionPanel
        actionDisabledReason={disabledReason}
        approval={action === "craft" && registry.addresses !== null ? {
          ctaLabel: "Approve Vault Forge",
          description: "Approves claim-specific physical trade-in transfers.",
          writeRequest: () => ({
            address: registry.baseContracts!.ItemToken,
            abi: itemTokenAbi,
            functionName: "setApprovalForAll",
            args: [registry.addresses!.VaultForge, true]
          })
        } : undefined}
        contracts={registry.addresses === null ? null : registry.baseContracts}
        ctaLabel={actionLabels[action]}
        description="Submits the exact selected VaultForge V4 action. The contract revalidates Dust, custody, policy, pool capacity, and claim state."
        onAccountChange={setAccount}
        onConfirmed={() => setRefresh((revision) => revision + 1)}
        registryMessage={registry.message}
        summary={summary}
        title="Vault Forge transaction"
        writeRequest={() => preparedWrite}
      />
    </section>
  );
}

function loadLiveRegistry(): {
  addresses: LiveAddresses | null;
  baseContracts: ProtocolContracts | null;
  message: string;
} {
  const snapshot = loadDeploymentRegistrySnapshotFromEnv({
    NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
  });
  const base = getReadyContractRegistry(snapshot);
  const vaultForge = snapshot?.contracts?.VaultForge;
  const dustLedger = snapshot?.contracts?.DustLedger;
  const vaultPassport = snapshot?.contracts?.VaultPassport;
  if (
    base.contracts === null || base.chainId !== robinhoodTestnetChainId || !vaultForge || !dustLedger || !vaultPassport
      || !isAddress(vaultForge) || !isAddress(dustLedger) || !isAddress(vaultPassport)
  ) {
    const isV4TestnetRegistry = snapshot?.chainId === robinhoodTestnetChainId;
    return {
      addresses: null,
      baseContracts: base.contracts,
      message: isV4TestnetRegistry
        ? "Vault Forge V4 is not deployed in the active testnet registry. Redeploy and pass the V4 smoke gate before enabling settlement."
        : base.status.message
    };
  }
  return {
    addresses: { VaultForge: vaultForge, DustLedger: dustLedger, VaultPassport: vaultPassport },
    baseContracts: base.contracts,
    message: "Vault Forge V4 testnet registry loaded."
  };
}

function getDisabledReason(input: {
  action: LiveAction;
  anchorTokenId: bigint | null;
  claimId: bigint | null;
  config: RecipeConfig | null;
  recipe: LiveRecipe;
  fromDust: number;
  toDust: number;
  tradeInTokenIds: Array<bigint | null>;
  duplicateProofTokenIds: Array<bigint | null>;
}): string | null {
  if (input.action === "craft") {
    if (input.config === null) return "The live recipe configuration is unavailable.";
    if (!input.config.active) return "This live blueprint is paused.";
    if (input.recipe.ascension && input.anchorTokenId === null) return "Enter an owned Anchor token ID.";
    if (input.tradeInTokenIds.some((tokenId) => tokenId === null)) return "Enter every required trade-in token ID.";
    if (input.duplicateProofTokenIds.some((tokenId) => tokenId === null)) return "Enter a retained duplicate proof for every trade-in.";
    const ids = input.tradeInTokenIds.filter((tokenId): tokenId is bigint => tokenId !== null);
    if (new Set(ids.map(String)).size !== ids.length) return "Trade-in token IDs must be different.";
    const proofIds = input.duplicateProofTokenIds.filter((tokenId): tokenId is bigint => tokenId !== null);
    if (proofIds.some((proofTokenId) => ids.some((tradeInTokenId) => tradeInTokenId === proofTokenId))) {
      return "A retained proof cannot also be a trade-in.";
    }
    return null;
  }
  if (input.action === "exchange") return input.fromDust === input.toDust ? "Choose a different output Dust." : null;
  return input.claimId === null ? "Enter a valid claim ID." : null;
}

function createLiveWrite(input: {
  action: LiveAction;
  addresses: LiveAddresses | null;
  account: Address | null;
  anchorTokenId: bigint | null;
  candidateIndex: number;
  claimId: bigint | null;
  config: RecipeConfig | null;
  fromDust: number;
  imprintHash: `0x${string}`;
  recipe: LiveRecipe;
  toDust: number;
  tradeInTokenIds: Array<bigint | null>;
  duplicateProofTokenIds: Array<bigint | null>;
}): PreparedWrite | null {
  if (input.addresses === null) return null;
  if (input.action === "craft") {
    if (
      input.config === null || input.tradeInTokenIds.some((tokenId) => tokenId === null)
        || input.duplicateProofTokenIds.some((tokenId) => tokenId === null)
    ) return null;
    return {
      address: input.addresses.VaultForge,
      abi: vaultForgeAbi,
      functionName: "craft",
      args: [
        input.recipe.id,
        input.recipe.ascension ? input.anchorTokenId ?? 0n : 0n,
        input.tradeInTokenIds as bigint[],
        input.duplicateProofTokenIds as bigint[],
        input.imprintHash
      ],
      value: input.config.fee
    };
  }
  if (input.action === "exchange") return { address: input.addresses.VaultForge, abi: vaultForgeAbi, functionName: "exchangeDust", args: [input.fromDust, input.toDust] };
  if (input.claimId === null) return null;
  if (input.action === "reveal") return { address: input.addresses.VaultForge, abi: vaultForgeAbi, functionName: "reveal", args: [input.claimId] };
  if (input.action === "default") return { address: input.addresses.VaultForge, abi: vaultForgeAbi, functionName: "settleDefault", args: [input.claimId] };
  if (input.action === "cancel") return { address: input.addresses.VaultForge, abi: vaultForgeAbi, functionName: "cancelExpired", args: [input.claimId] };
  if (input.account === null) return null;
  return { address: input.addresses.VaultForge, abi: vaultForgeAbi, functionName: "selectCandidate", args: [input.claimId, input.candidateIndex, input.account] };
}

function buildSummary(
  action: LiveAction,
  recipe: LiveRecipe,
  config: RecipeConfig | null,
  claimId: bigint | null,
  candidateIndex: number,
  fromDust: number,
  toDust: number
) {
  if (action === "craft") return [
    { label: "Blueprint", value: recipe.label },
    { label: "Trade-ins", value: recipe.tradeIns.toString() },
    { label: "Retained proofs", value: recipe.tradeIns.toString() },
    { label: "Exact fee", value: config ? `${formatEther(config.fee)} ETH` : "loading" },
    { label: "Dust", value: config ? formatDustAmounts(config.dustAmounts) : "loading" }
  ];
  if (action === "exchange") return [
    { label: "Function", value: "VaultForge.exchangeDust" },
    { label: "Dust kinds", value: `${dustKindLabels[fromDust] ?? "Unknown"} -> ${dustKindLabels[toDust] ?? "Unknown"}` }
  ];
  return [
    { label: "Function", value: actionLabels[action] },
    { label: "Claim ID", value: claimId?.toString() ?? "required" },
    ...(action === "select" ? [{ label: "Choice", value: String(candidateIndex + 1) }] : [])
  ];
}

function buildActionNote(action: LiveAction): string {
  if (action === "craft") {
    return "Each proof must be a retained card with the same collectible identity as its trade-in. A randomness timeout returns the exact cards, Dust, and fee.";
  }
  if (action === "exchange") {
    return "Dust Exchange is deterministic: it spends the configured Magic and matching specialty Dust, then credits the selected specialty Dust in one transaction.";
  }
  if (action === "cancel") {
    return "Cancellation is available only after the randomness timeout and only while randomness remains unavailable. Restoration is exact and replay-safe.";
  }
  if (action === "select") {
    return "Only the claim owner can choose a guided candidate before the choice window closes. Unchosen cards return to their reserved pool.";
  }
  if (action === "default") {
    return "After the guided choice window closes, anyone may settle the claim to its precommitted random default for the original owner.";
  }
  return "Reveal prepares only inventory reserved for this claim. Basic recipes settle immediately; guided recipes open their bounded choice window.";
}

function formatDustAmounts(amounts: readonly bigint[]): string {
  const parts = amounts.flatMap((amount, index) => amount === 0n ? [] : [`${amount} ${dustKindLabels[index] ?? "Unknown"}`]);
  return parts.length > 0 ? parts.join(" · ") : "None";
}
