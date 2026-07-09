"use client";

import { type DragEvent, useEffect, useMemo, useState } from "react";
import { formatEther, type Address } from "viem";
import {
  ArchiveRestore,
  Beaker,
  BookOpenCheck,
  Check,
  Coins,
  Fingerprint,
  FlaskConical,
  Gem,
  Hammer,
  LockKeyhole,
  PackagePlus,
  Palette,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import {
  buildForgeImprint,
  evaluateForgePattern,
  getForgeRevenueProjection,
  placeForgeMaterial,
  type ForgeFrame,
  type ForgeSlot
} from "../lib/forge-model";
import { loadDeploymentRegistrySnapshotFromEnv } from "../lib/deployments";
import { getForgeWalletSnapshot, type ForgeWalletSnapshot } from "../lib/contracts/forge-live";
import { createRobinhoodPublicClient } from "../lib/contracts/public-client";
import { getReadyContractRegistry } from "../lib/contracts/registry";
import { ForgeCraftPanel } from "./testnet-write-panels";

export type ForgeRecipeView = {
  id: string;
  chainRecipeId: string;
  title: string;
  tier: "utility" | "rare" | "grail";
  status: "known" | "discovery" | "locked";
  category: "recycle" | "craft" | "catalyst" | "refine";
  description: string;
  pattern: ForgeSlot[];
  catalystCardIds: string[];
  catalystMaterialIds: string[];
  output: string;
  outputTokenId: string;
  outputSupplyCap: number;
  totalCrafts: number;
  maxCraftsPerWallet: number;
  feeWei: string;
  displayFee: string;
  metadataHashLabel: string;
};

export type ForgeMaterialView = {
  id: string;
  tokenId: string;
  label: string;
  labBalance: number;
  source: string;
  tone: string;
  catalystOnly?: boolean;
};

export type ForgeIngredientView = {
  id: string;
  tokenId: string;
  title: string;
  subtitle: string;
  tags: string[];
  grailTier: string;
  protected: boolean;
};

type ForgeWorkbenchClientProps = {
  ingredients: ForgeIngredientView[];
  materials: ForgeMaterialView[];
  recipes: ForgeRecipeView[];
};

type ForgeMode = "lab" | "live";
type LiveForgeState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: ForgeWalletSnapshot }
  | { status: "error" };

type ForgeTokenRequirement = {
  tokenId: bigint;
  amount: bigint;
};

const gridSlots = Array.from({ length: 9 }, (_, index) => index);
const frameOptions: Array<{ id: ForgeFrame; label: string }> = [
  { id: "signal", label: "Signal" },
  { id: "prism", label: "Prism" },
  { id: "mono", label: "Mono" }
];

export function ForgeWorkbenchClient({ ingredients, materials, recipes }: ForgeWorkbenchClientProps) {
  const initialRecipeId = recipes.find((recipe) => recipe.category === "craft")?.id ?? recipes[0]?.id ?? "";
  const [selectedRecipeId, setSelectedRecipeId] = useState(initialRecipeId);
  const [mode, setMode] = useState<ForgeMode>("lab");
  const [slotMaterialIds, setSlotMaterialIds] = useState<ForgeSlot[]>(Array(9).fill(null));
  const [frame, setFrame] = useState<ForgeFrame>("signal");
  const [inscription, setInscription] = useState("FIRST LIGHT");
  const [walletAccount, setWalletAccount] = useState<Address | null>(null);
  const [liveForgeState, setLiveForgeState] = useState<LiveForgeState>({ status: "idle" });
  const [liveRefresh, setLiveRefresh] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>([
    "Forge v3 ready",
    "Physical inventory locked from burns",
    "Output capacity reserved on-chain"
  ]);

  const selectedRecipe = (recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0])!;
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const ingredientById = useMemo(
    () => new Map(ingredients.map((ingredient) => [ingredient.id, ingredient])),
    [ingredients]
  );

  const activeRecipe = selectedRecipe;

  const patternResult = evaluateForgePattern(activeRecipe.pattern, slotMaterialIds);
  const catalystIngredients = activeRecipe.catalystCardIds
    .map((id) => ingredientById.get(id))
    .filter((ingredient): ingredient is ForgeIngredientView => ingredient !== undefined);
  const catalystMaterials = activeRecipe.catalystMaterialIds
    .map((id) => materialById.get(id))
    .filter((material): material is ForgeMaterialView => material !== undefined);
  const burnMaterials = activeRecipe.pattern
    .map((materialId) => materialId === null ? undefined : materialById.get(materialId))
    .filter((material): material is ForgeMaterialView => material !== undefined);
  const burnRequirements = buildTokenRequirements(burnMaterials.map((material) => BigInt(material.tokenId)));
  const catalystRequirements = buildTokenRequirements([
    ...catalystMaterials.map((material) => BigInt(material.tokenId)),
    ...catalystIngredients.map((ingredient) => BigInt(ingredient.tokenId))
  ]);
  const recipeId = BigInt(activeRecipe.chainRecipeId);
  const configuredFeeWei = BigInt(activeRecipe.feeWei);
  const readySnapshot = liveForgeState.status === "ready" ? liveForgeState.snapshot : null;
  const feeWei = readySnapshot?.recipe.fee ?? configuredFeeWei;
  const outputSupplyCap = Number(readySnapshot?.recipe.outputSupplyCap ?? BigInt(activeRecipe.outputSupplyCap));
  const totalCrafts = Number(readySnapshot?.recipe.totalCrafts ?? BigInt(activeRecipe.totalCrafts));
  const displayFee = feeWei === 0n ? "Free" : formatWei(feeWei);
  const imprintHash = buildForgeImprint({ recipeId, frame, inscription, slots: slotMaterialIds });
  const revenue = getForgeRevenueProjection({
    feeWei,
    maxTotalCrafts: outputSupplyCap,
    totalCrafts
  });
  const requiredTokenIds = [...new Set([
    ...burnRequirements.map((requirement) => requirement.tokenId),
    ...catalystRequirements.map((requirement) => requirement.tokenId)
  ])];
  const requiredTokenKey = requiredTokenIds.map(String).join(":");
  const registry = useMemo(
    () => getReadyContractRegistry(
      loadDeploymentRegistrySnapshotFromEnv({
        NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
      })
    ),
    []
  );
  const publicClient = useMemo(() => createRobinhoodPublicClient(), []);

  useEffect(() => {
    let cancelled = false;
    if (walletAccount === null || registry.contracts === null || recipeId === 0n) {
      setLiveForgeState({ status: "idle" });
      return () => {
        cancelled = true;
      };
    }

    setLiveForgeState({ status: "loading" });
    void getForgeWalletSnapshot({
      account: walletAccount,
      client: publicClient,
      contracts: registry.contracts,
      recipeId,
      tokenIds: requiredTokenIds
    }).then(
      (snapshot) => {
        if (!cancelled) setLiveForgeState({ status: "ready", snapshot });
      },
      () => {
        if (!cancelled) setLiveForgeState({ status: "error" });
      }
    );

    return () => {
      cancelled = true;
    };
  }, [liveRefresh, publicClient, recipeId, registry.contracts, requiredTokenKey, walletAccount]);

  const actionDisabledReason = getCraftDisabledReason({
    mode,
    patternComplete: patternResult.complete,
    recipe: activeRecipe,
    liveForgeState,
    materials,
    burnRequirements,
    catalystMaterials,
    catalystIngredients,
    catalystRequirements,
    walletAccount
  });

  function appendLog(message: string) {
    setEventLog((currentLog) => [message, ...currentLog].slice(0, 7));
  }

  function loadRecipe(recipe: ForgeRecipeView) {
    setSelectedRecipeId(recipe.id);
    setSlotMaterialIds(Array(9).fill(null));
    appendLog(`${recipe.title} loaded`);
  }

  function placeMaterial(materialId: string, preferredSlot?: number) {
    const material = materialById.get(materialId);
    if (!material) {
      return;
    }
    if (material.catalystOnly) {
      appendLog(`${material.label} is a held catalyst and cannot enter the burn grid`);
      return;
    }

    const result = placeForgeMaterial({
      balance: material.labBalance,
      materialId,
      pattern: activeRecipe.pattern,
      slots: slotMaterialIds,
      preferredSlot
    });
    if (result.placedAt === null) {
      appendLog(result.reason === "balance-exhausted" ? `${material.label} lab stock exhausted` : "No open Forge slot");
      return;
    }

    setSlotMaterialIds(result.slots);
    appendLog(`Placed ${material.label} in slot ${result.placedAt + 1}`);
  }

  function removeMaterial(slotIndex: number) {
    const materialId = slotMaterialIds[slotIndex];
    if (materialId === null || materialId === undefined) {
      return;
    }

    const nextSlots = [...slotMaterialIds];
    nextSlots[slotIndex] = null;
    setSlotMaterialIds(nextSlots);
    appendLog(`Removed ${materialById.get(materialId)?.label ?? "material"}`);
  }

  function handleDragStart(materialId: string, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("text/plain", materialId);
  }

  function handleDrop(slotIndex: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const materialId = event.dataTransfer.getData("text/plain");
    if (materialId.length > 0) {
      placeMaterial(materialId, slotIndex);
    }
  }

  const recyclerRecipe = recipes.find((recipe) => recipe.category === "recycle");

  return (
    <section className="forge-workbench phase-five-forge" aria-label="Forge workbench">
      <div className="panel forge-control-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Mode</span>
            <h2>Crafting Lab</h2>
          </div>
          <Beaker size={18} aria-hidden="true" />
        </div>
        <div className="forge-mode-toggle" role="group" aria-label="Forge mode">
          <button
            aria-pressed={mode === "lab"}
            className={mode === "lab" ? "mode-button active" : "mode-button"}
            onClick={() => setMode("lab")}
            type="button"
          >
            <FlaskConical size={15} aria-hidden="true" />
            Lab mode
          </button>
          <button
            aria-pressed={mode === "live"}
            className={mode === "live" ? "mode-button active" : "mode-button"}
            onClick={() => setMode("live")}
            type="button"
          >
            <Hammer size={15} aria-hidden="true" />
            Live craft
          </button>
        </div>
        <dl className="forge-invariant-list">
          <div>
            <dt>Burn boundary</dt>
            <dd>Game materials only</dd>
          </div>
          <div>
            <dt>Inventory cards</dt>
            <dd>Retained catalysts</dd>
          </div>
          <div>
            <dt>Output cap</dt>
            <dd>Reserved on-chain</dd>
          </div>
        </dl>
        <p className="forge-live-status" role="status">
          {walletAccount === null
            ? "Lab inventory"
            : liveForgeState.status === "ready"
              ? "Wallet recipe state verified"
              : liveForgeState.status === "error"
                ? "Live recipe verification failed"
                : "Checking wallet recipe state"}
        </p>
        {mode === "live" ? (
          <p className="forge-warning">Live craft uses the displayed fee, blueprint, and imprint.</p>
        ) : null}
      </div>

      <div className="panel recipe-book">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Blueprints</span>
            <h2>Recipe Book</h2>
          </div>
          <span className="chain-pill">{recipes.length} on-chain</span>
        </div>
        <p>Discovery recipes reveal their pattern through valid lab matches.</p>

        <div className="recipe-list">
          {recipes.map((recipe) => {
            const craftPercent = Math.min(100, Math.round((recipe.totalCrafts / recipe.outputSupplyCap) * 100));
            return (
              <article className={recipe.id === selectedRecipe.id ? "recipe-card selected" : "recipe-card"} key={recipe.id}>
                <div className="card-title-row">
                  <div>
                    <span className="eyebrow">#{recipe.chainRecipeId} / {recipe.tier}</span>
                    <h3>{recipe.title}</h3>
                  </div>
                  <span className="tier-pill">
                    <Coins size={14} aria-hidden="true" />
                    {recipe.displayFee}
                  </span>
                </div>
                <p>{recipe.description}</p>
                <div className="progress-row">
                  <span>{recipe.outputSupplyCap - recipe.totalCrafts} output remaining</span>
                  <strong>{recipe.output}</strong>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <span style={{ width: `${craftPercent}%` }} />
                </div>
                <button className="secondary-action" onClick={() => loadRecipe(recipe)} type="button">
                  <BookOpenCheck size={15} aria-hidden="true" />
                  Load {recipe.title}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="panel forge-grid-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Blueprint #{selectedRecipe.chainRecipeId}</span>
            <h2>3 x 3 Forge Grid</h2>
          </div>
          <span className={patternResult.complete ? "chain-pill ready" : "chain-pill"}>
            {patternResult.complete ? "matched" : `${patternResult.matchedSlots}/${patternResult.requiredSlots}`}
          </span>
        </div>

        <div className="forge-grid" aria-label="3 x 3 Forge Grid slots" role="grid">
          {gridSlots.map((slotIndex) => {
            const materialId = slotMaterialIds[slotIndex] ?? null;
            const material = materialId ? materialById.get(materialId) : null;
            const expectedMaterialId = selectedRecipe.pattern[slotIndex] ?? null;
            const expectedMaterial = expectedMaterialId ? materialById.get(expectedMaterialId) : null;
            const isMatched = materialId !== null && materialId === expectedMaterialId;
            const className = material
              ? `forge-slot filled${isMatched ? " matched" : " misplaced"}`
              : expectedMaterial
                ? "forge-slot hinted"
                : "forge-slot";

            return (
              <button
                aria-label={material ? `Remove ${material.label} from slot ${slotIndex + 1}` : `Open forge slot ${slotIndex + 1}`}
                className={className}
                key={slotIndex}
                onClick={() => removeMaterial(slotIndex)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(slotIndex, event)}
                role="gridcell"
                type="button"
              >
                {material ? (
                  <>
                    {isMatched ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
                    <strong>{material.label}</strong>
                    <span>{isMatched ? "Pattern match" : "Wrong position"}</span>
                  </>
                ) : expectedMaterial && selectedRecipe.status !== "discovery" ? (
                  <>
                    <PackagePlus size={18} aria-hidden="true" />
                    <strong>{expectedMaterial.label}</strong>
                    <span>Blueprint slot</span>
                  </>
                ) : (
                  <>
                    <PackagePlus size={18} aria-hidden="true" />
                    <strong>Slot {slotIndex + 1}</strong>
                    <span>{expectedMaterial ? "Unknown signal" : "Open"}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel material-bank-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Sandbox inventory</span>
            <h2>Material bank</h2>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>
        <div className="material-bank-grid">
          {materials.map((material) => {
            const placed = slotMaterialIds.filter((materialId) => materialId === material.id).length;
            const remaining = Math.max(0, material.labBalance - placed);
            const walletBalance = readySnapshot?.balances.get(BigInt(material.tokenId));
            const isCatalystOnly = material.catalystOnly === true;
            return (
              <article className="material-card" key={material.id}>
                <div>
                  <span className="eyebrow">Token #{material.tokenId}</span>
                  <strong>{material.label}</strong>
                  <small>
                    {remaining} of {material.labBalance} lab stock
                    {walletBalance !== undefined ? ` / wallet ${walletBalance}` : ""}
                  </small>
                </div>
                <p>{material.source}</p>
                <button
                  className="secondary-action"
                  disabled={isCatalystOnly || remaining === 0}
                  draggable={!isCatalystOnly && remaining > 0}
                  onClick={() => placeMaterial(material.id)}
                  onDragStart={(event) => handleDragStart(material.id, event)}
                  type="button"
                >
                  {isCatalystOnly ? <LockKeyhole size={15} aria-hidden="true" /> : <PackagePlus size={15} aria-hidden="true" />}
                  {isCatalystOnly ? "Held catalyst" : `Add ${material.label}`}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="panel catalyst-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Retained holdings</span>
            <h2>Required catalysts</h2>
          </div>
          <Gem size={18} aria-hidden="true" />
        </div>
        {catalystMaterials.length === 0 && catalystIngredients.length === 0 ? (
          <p className="forge-empty-state">No retained catalyst in this blueprint.</p>
        ) : (
          <div className="catalyst-list">
            {catalystMaterials.map((material) => (
              <article className="catalyst-row" key={material.id}>
                <Gem size={18} aria-hidden="true" />
                <div>
                  <strong>{material.label}</strong>
                  <span>{material.source} / held, never burned</span>
                </div>
                <span className="chain-pill">
                  {readySnapshot ? `${readySnapshot.balances.get(BigInt(material.tokenId)) ?? 0n} held` : "wallet check"}
                </span>
              </article>
            ))}
            {catalystIngredients.map((ingredient) => (
              <article className="catalyst-row" key={ingredient.id}>
                <LockKeyhole size={18} aria-hidden="true" />
                <div>
                  <strong>{ingredient.title}</strong>
                  <span>{ingredient.grailTier} / held, never burned</span>
                </div>
                <span className="chain-pill">
                  {readySnapshot ? `${readySnapshot.balances.get(BigInt(ingredient.tokenId)) ?? 0n} held` : "wallet check"}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel recycler-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Duplicate sink</span>
            <h2>Duplicate Recycler</h2>
          </div>
          <ArchiveRestore size={18} aria-hidden="true" />
        </div>
        <dl className="forge-invariant-list">
          <div>
            <dt>Input</dt>
            <dd>2 Fire shards</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>1 Forge dust</dd>
          </div>
          <div>
            <dt>Fee</dt>
            <dd>Free</dd>
          </div>
        </dl>
        <button
          className="secondary-action"
          disabled={!recyclerRecipe}
          onClick={() => recyclerRecipe && loadRecipe(recyclerRecipe)}
          type="button"
        >
          <ArchiveRestore size={15} aria-hidden="true" />
          Load Duplicate Recycler
        </button>
      </div>

      <div className="panel imprint-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Creative provenance</span>
            <h2>Imprint Studio</h2>
          </div>
          <Fingerprint size={18} aria-hidden="true" />
        </div>
        <div className="imprint-frame-control" role="group" aria-label="Imprint frame">
          {frameOptions.map((option) => (
            <button
              aria-pressed={frame === option.id}
              className={frame === option.id ? `imprint-swatch ${option.id} active` : `imprint-swatch ${option.id}`}
              key={option.id}
              onClick={() => setFrame(option.id)}
              title={`${option.label} imprint frame`}
              type="button"
            >
              <Palette size={15} aria-hidden="true" />
              {option.label}
            </button>
          ))}
        </div>
        <label className="transaction-input-row" htmlFor="forge-inscription">
          <span>Inscription</span>
          <input
            id="forge-inscription"
            maxLength={24}
            onChange={(event) => setInscription(event.target.value)}
            type="text"
            value={inscription}
          />
        </label>
        <div className={`imprint-preview ${frame}`}>
          <Sparkles size={20} aria-hidden="true" />
          <strong>{inscription.trim() || "UNTITLED"}</strong>
          <span>{selectedRecipe.output}</span>
        </div>
        <code className="forge-imprint-hash" title={imprintHash}>{imprintHash}</code>
      </div>

      <div className="panel output-preview">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Bounded output</span>
            <h2>Output Preview</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Output</dt>
            <dd>{selectedRecipe.output}</dd>
          </div>
          <div>
            <dt>Supply remaining</dt>
            <dd>{revenue.remainingCrafts} / {outputSupplyCap}</dd>
          </div>
          <div>
            <dt>Protocol fee preview</dt>
            <dd>{displayFee}</dd>
          </div>
          <div>
            <dt>Max remaining fees</dt>
            <dd>{formatWei(revenue.remainingFeeWei)}</dd>
          </div>
          <div>
            <dt>Wallet cap</dt>
            <dd>{readySnapshot?.recipe.maxCraftsPerWallet.toString() ?? selectedRecipe.maxCraftsPerWallet}</dd>
          </div>
          <div>
            <dt>Blueprint state</dt>
            <dd>{patternResult.matchedSlots} of {patternResult.requiredSlots} matched</dd>
          </div>
        </dl>
        {patternResult.misplacedSlots > 0 ? (
          <p className="transaction-error" role="status">{patternResult.misplacedSlots} material in the wrong position.</p>
        ) : patternResult.complete ? (
          <p className="transaction-success" role="status">
            <Check size={15} aria-hidden="true" />
            Blueprint matched. Imprint locked for wallet review.
          </p>
        ) : null}
        <div className="forge-output-actions">
          <button
            className="secondary-action"
            onClick={() => {
              setSlotMaterialIds(Array(9).fill(null));
              appendLog("Forge grid cleared");
            }}
            type="button"
          >
            <RotateCcw size={15} aria-hidden="true" />
            Clear grid
          </button>
        </div>
      </div>

      <ForgeCraftPanel
        actionDisabledReason={actionDisabledReason}
        displayValue={displayFee}
        imprintHash={imprintHash}
        onAccountChange={setWalletAccount}
        onConfirmed={() => setLiveRefresh((revision) => revision + 1)}
        recipeId={recipeId}
        value={feeWei}
      />

      <div className="panel provenance-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Local session</span>
            <h2>Provenance log</h2>
          </div>
          <Fingerprint size={18} aria-hidden="true" />
        </div>
        <ol className="provenance-list" aria-label="Forge provenance log">
          {eventLog.map((event, index) => (
            <li key={`${event}-${index}`}>{event}</li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function getCraftDisabledReason(input: {
  mode: ForgeMode;
  patternComplete: boolean;
  recipe: ForgeRecipeView;
  liveForgeState: LiveForgeState;
  materials: ForgeMaterialView[];
  burnRequirements: ForgeTokenRequirement[];
  catalystMaterials: ForgeMaterialView[];
  catalystIngredients: ForgeIngredientView[];
  catalystRequirements: ForgeTokenRequirement[];
  walletAccount: Address | null;
}): string | null {
  if (input.recipe.status === "locked") {
    return "This blueprint is not active on-chain.";
  }
  if (!input.patternComplete) {
    return "Match every blueprint slot before crafting.";
  }
  if (input.mode !== "live") {
    return "Switch to Live craft after the lab match.";
  }
  if (input.walletAccount === null) {
    return null;
  }
  if (input.liveForgeState.status === "loading" || input.liveForgeState.status === "idle") {
    return "Checking live recipe and wallet balances.";
  }
  if (input.liveForgeState.status === "error") {
    return "Live recipe verification failed. Retry after checking the testnet RPC.";
  }

  const snapshot = input.liveForgeState.snapshot;
  if (snapshot.recipe.status !== 4) {
    return "This recipe is not active on-chain.";
  }
  if (snapshot.recipe.outputTokenId !== BigInt(input.recipe.outputTokenId)) {
    return "The live output token does not match this blueprint.";
  }
  if (!sameTokenRequirements(snapshot.recipe.inputTokenIds, snapshot.recipe.inputAmounts, input.burnRequirements)) {
    return "The live burn inputs do not match this blueprint.";
  }
  if (!sameTokenRequirements(snapshot.recipe.catalystTokenIds, snapshot.recipe.catalystAmounts, input.catalystRequirements)) {
    return "The live retained catalysts do not match this blueprint.";
  }
  if (snapshot.recipe.totalCrafts >= snapshot.recipe.maxTotalCrafts) {
    return "This recipe has reached its global craft cap.";
  }
  if (snapshot.walletCrafts >= snapshot.recipe.maxCraftsPerWallet) {
    return "This wallet has reached the recipe craft cap.";
  }
  if (!snapshot.approved) {
    return "Approve Forge before submitting the craft.";
  }

  for (const material of input.materials) {
    const required = input.recipe.pattern.filter((materialId) => materialId === material.id).length;
    if (required === 0) continue;
    const available = snapshot.balances.get(BigInt(material.tokenId)) ?? 0n;
    if (available < BigInt(required)) {
      return `Wallet needs ${required} ${material.label}; ${available} available.`;
    }
  }

  for (const catalyst of input.catalystIngredients) {
    const available = snapshot.balances.get(BigInt(catalyst.tokenId)) ?? 0n;
    if (available < 1n) {
      return `Wallet does not hold the required ${catalyst.title} catalyst.`;
    }
  }

  for (const catalyst of input.catalystMaterials) {
    const available = snapshot.balances.get(BigInt(catalyst.tokenId)) ?? 0n;
    if (available < 1n) {
      return `Wallet does not hold the required ${catalyst.label} catalyst.`;
    }
  }

  return null;
}

function buildTokenRequirements(tokenIds: readonly bigint[]): ForgeTokenRequirement[] {
  const amounts = new Map<bigint, bigint>();
  for (const tokenId of tokenIds) {
    amounts.set(tokenId, (amounts.get(tokenId) ?? 0n) + 1n);
  }

  return [...amounts.entries()]
    .map(([tokenId, amount]) => ({ tokenId, amount }))
    .sort((left, right) => left.tokenId < right.tokenId ? -1 : left.tokenId > right.tokenId ? 1 : 0);
}

function sameTokenRequirements(
  actualTokenIds: readonly bigint[],
  actualAmounts: readonly bigint[],
  expected: readonly ForgeTokenRequirement[]
): boolean {
  if (actualTokenIds.length !== actualAmounts.length || actualTokenIds.length !== expected.length) {
    return false;
  }

  const actual = actualTokenIds
    .map((tokenId, index) => ({ tokenId, amount: actualAmounts[index] ?? 0n }))
    .sort((left, right) => left.tokenId < right.tokenId ? -1 : left.tokenId > right.tokenId ? 1 : 0);

  return actual.every((requirement, index) => {
    const expectedRequirement = expected[index];
    return expectedRequirement !== undefined
      && requirement.tokenId === expectedRequirement.tokenId
      && requirement.amount === expectedRequirement.amount;
  });
}

function formatWei(value: bigint): string {
  if (value === 0n) {
    return "0 ETH";
  }

  const formatted = formatEther(value);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, 4).replace(/0+$/, "");
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction} ETH` : `${whole} ETH`;
}
