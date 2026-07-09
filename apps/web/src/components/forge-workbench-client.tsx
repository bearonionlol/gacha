"use client";

import { type DragEvent, useMemo, useState } from "react";
import {
  ArchiveRestore,
  Beaker,
  BookOpenCheck,
  Coins,
  FlaskConical,
  Hammer,
  LockKeyhole,
  PackagePlus,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { ForgeCraftPanel } from "./testnet-write-panels";
import { formatCents } from "../lib/format";

export type ForgeRecipeView = {
  id: string;
  title: string;
  tier: "rare" | "elite" | "grail";
  status: "known" | "discovery" | "locked";
  description: string;
  progressPercent: number;
  ingredients: string[];
  requiredMaterialIds: string[];
  output: string;
  cap: number;
  feeCents: number;
  expectedProtocolRevenueCents: number;
  warning: string;
};

export type ForgeMaterialView = {
  id: string;
  label: string;
  balance: number;
  source: string;
  tone: string;
  recipeTags: string[];
};

export type ForgeIngredientView = {
  id: string;
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

const gridSlots = Array.from({ length: 9 }, (_, index) => index);

export function ForgeWorkbenchClient({ ingredients, materials, recipes }: ForgeWorkbenchClientProps) {
  const [selectedRecipeId, setSelectedRecipeId] = useState(recipes[0]?.id ?? "");
  const [mode, setMode] = useState<ForgeMode>("lab");
  const [slotMaterialIds, setSlotMaterialIds] = useState<Array<string | null>>(Array(9).fill(null));
  const [dustBalance, setDustBalance] = useState(materials.find((material) => material.id === "forge-dust")?.balance ?? 0);
  const [eventLog, setEventLog] = useState<string[]>([
    "Lab initialized",
    "Protected grails never burn in lab",
    "Recipe provenance will attach to crafted outputs"
  ]);

  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId) ?? recipes[0];
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const lockedIngredients = ingredients.filter((ingredient) => ingredient.protected).slice(0, 3);
  const placedMaterialIds = slotMaterialIds.filter((materialId): materialId is string => materialId !== null);
  const matchedMaterials = selectedRecipe
    ? selectedRecipe.requiredMaterialIds.filter((materialId) => placedMaterialIds.includes(materialId))
    : [];
  const missingMaterials = selectedRecipe
    ? selectedRecipe.requiredMaterialIds.filter((materialId) => !placedMaterialIds.includes(materialId))
    : [];
  const nextOpenSlot = slotMaterialIds.findIndex((materialId, index) => materialId === null && index >= lockedIngredients.length);

  function appendLog(message: string) {
    setEventLog((currentLog) => [message, ...currentLog].slice(0, 6));
  }

  function loadRecipe(recipe: ForgeRecipeView) {
    setSelectedRecipeId(recipe.id);
    setSlotMaterialIds(Array(9).fill(null));
    appendLog(`${recipe.title} loaded`);
  }

  function placeMaterial(materialId: string, preferredSlot = nextOpenSlot) {
    if (preferredSlot < lockedIngredients.length || preferredSlot < 0) {
      return;
    }

    const material = materialById.get(materialId);
    setSlotMaterialIds((currentSlots) => {
      const nextSlots = [...currentSlots];
      nextSlots[preferredSlot] = materialId;
      return nextSlots;
    });

    appendLog(`Placed ${material?.label ?? "material"}`);
  }

  function recycleDuplicateStack() {
    setDustBalance((currentBalance) => currentBalance + 5);
    appendLog("Duplicate stack recycled");
  }

  function handleDragStart(materialId: string, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("text/plain", materialId);
  }

  function handleDrop(slotIndex: number, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const materialId = event.dataTransfer.getData("text/plain");

    if (materialId.length > 0) {
      placeMaterial(materialId, slotIndex);
    }
  }

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
        <p>
          The sandbox lets users test combinations first. On-chain crafting stays explicit, fee-aware, and protected
          before the wallet path submits `Forge.craft`.
        </p>
        {mode === "live" ? (
          <p className="forge-warning">Protected grails stay locked. Lab mode first, then explicit wallet confirmation.</p>
        ) : null}
      </div>

      <div className="panel recipe-book">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Recipes</span>
            <h2>Recipe Book</h2>
          </div>
          <span className="chain-pill">{recipes.length} paths</span>
        </div>
        <p>Discovery recipes turn the Forge into a puzzle instead of a burn form.</p>

        <div className="recipe-list">
          {recipes.map((recipe) => (
            <article
              className={recipe.id === selectedRecipe?.id ? "recipe-card selected" : "recipe-card"}
              key={recipe.id}
            >
              <div className="card-title-row">
                <div>
                  <span className="eyebrow">
                    {recipe.status === "discovery" ? "Discovery path" : recipe.status} / {recipe.tier}
                  </span>
                  <h3>{recipe.title}</h3>
                </div>
                <span className="tier-pill">
                  <Coins size={14} aria-hidden="true" />
                  {formatCents(recipe.feeCents)}
                </span>
              </div>
              <p>{recipe.description}</p>
              <div className="tag-row" aria-label={`${recipe.title} ingredients`}>
                {recipe.ingredients.map((ingredient) => (
                  <span key={ingredient}>{ingredient}</span>
                ))}
              </div>
              <div className="progress-row">
                <span>{recipe.progressPercent}% solved by the community</span>
                <strong>{recipe.output}</strong>
              </div>
              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${recipe.progressPercent}%` }} />
              </div>
              <button className="secondary-action" onClick={() => loadRecipe(recipe)} type="button">
                <BookOpenCheck size={15} aria-hidden="true" />
                {recipe.status === "locked" ? `Inspect ${recipe.title}` : `Load ${recipe.title}`}
              </button>
            </article>
          ))}
        </div>
      </div>

      <div className="panel forge-grid-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Craft surface</span>
            <h2>3 x 3 Forge Grid</h2>
          </div>
          <span className="chain-pill">grail-protected</span>
        </div>
        <p>
          Drag materials into open cells or use the material buttons. Locked cells reference grails without burning them.
        </p>

        <div className="forge-grid" aria-label="3 x 3 Forge Grid slots" role="grid">
          {gridSlots.map((slotIndex) => {
            const lockedIngredient = lockedIngredients[slotIndex];
            const material = slotMaterialIds[slotIndex] ? materialById.get(slotMaterialIds[slotIndex] ?? "") : null;

            return (
              <div
                aria-label={
                  lockedIngredient
                    ? `Protected forge slot ${slotIndex + 1} ${lockedIngredient.title}`
                    : material
                      ? `Filled forge slot ${slotIndex + 1} ${material.label}`
                      : `Open forge slot ${slotIndex + 1}`
                }
                className={lockedIngredient ? "forge-slot protected" : material ? "forge-slot filled" : "forge-slot"}
                key={slotIndex}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => handleDrop(slotIndex, event)}
                role="gridcell"
              >
                {lockedIngredient ? (
                  <>
                    <LockKeyhole size={18} aria-hidden="true" />
                    <strong>{lockedIngredient.title}</strong>
                    <span>{lockedIngredient.grailTier} input locked</span>
                  </>
                ) : material ? (
                  <>
                    <Sparkles size={18} aria-hidden="true" />
                    <strong>{material.label}</strong>
                    <span>{material.label} placed</span>
                  </>
                ) : (
                  <>
                    <PackagePlus size={18} aria-hidden="true" />
                    <strong>Slot {slotIndex + 1}</strong>
                    <span>Open cell</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel material-bank-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Materials</span>
            <h2>Material bank</h2>
          </div>
          <ShieldCheck size={18} aria-hidden="true" />
        </div>
        <div className="material-bank-grid">
          {materials.map((material) => {
            const balance = material.id === "forge-dust" ? dustBalance : material.balance;

            return (
              <article className="material-card" key={material.id}>
                <div>
                  <span className="eyebrow">{material.tone}</span>
                  <strong>{material.label}</strong>
                  <small>
                    {material.id === "forge-dust" ? `Dust balance ${balance}` : `${balance} available`}
                  </small>
                </div>
                <p>{material.source}</p>
                <button
                  className="secondary-action"
                  draggable
                  onClick={() => placeMaterial(material.id)}
                  onDragStart={(event) => handleDragStart(material.id, event)}
                  type="button"
                >
                  <PackagePlus size={15} aria-hidden="true" />
                  Add {material.label}
                </button>
              </article>
            );
          })}
        </div>
      </div>

      <div className="panel recycler-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Duplicates</span>
            <h2>Duplicate recycler</h2>
          </div>
          <ArchiveRestore size={18} aria-hidden="true" />
        </div>
        <p>
          Duplicate pulls become creative fuel. Recycling adds dust without touching protected grails or redemption items.
        </p>
        <button className="secondary-action" onClick={recycleDuplicateStack} type="button">
          <ArchiveRestore size={15} aria-hidden="true" />
          Recycle duplicate stack
        </button>
      </div>

      <div className="panel output-preview">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Preview result</span>
            <h2>Output Preview</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
        </div>
        <dl className="detail-grid">
          <div>
            <dt>Preview output</dt>
            <dd>{selectedRecipe?.output ?? "No recipe selected"}</dd>
          </div>
          <div>
            <dt>Recipe cap</dt>
            <dd>{selectedRecipe?.cap ?? 0} crafts</dd>
          </div>
          <div>
            <dt>Protocol fee preview</dt>
            <dd>{formatCents(selectedRecipe?.expectedProtocolRevenueCents ?? 0)}</dd>
          </div>
          <div>
            <dt>Match state</dt>
            <dd>
              {matchedMaterials.length} of {selectedRecipe?.requiredMaterialIds.length ?? 0} ingredients matched
            </dd>
          </div>
        </dl>

        {missingMaterials.length > 0 ? (
          <div className="tag-row" aria-label="Missing Forge materials">
            {missingMaterials.map((materialId) => (
              <span key={materialId}>{materialById.get(materialId)?.label ?? materialId}</span>
            ))}
          </div>
        ) : (
          <p className="transaction-success" role="status">
            <Sparkles size={15} aria-hidden="true" />
            Lab recipe matched. Wallet crafting still requires confirmation.
          </p>
        )}

        <p className="disclosure">
          The sandbox does not submit burns, guarantee recipe outcomes, or imply resale value. The testnet write panel
          below handles wallet submission.
        </p>
        <ForgeCraftPanel />
      </div>

      <div className="panel provenance-panel">
        <div className="panel-header compact">
          <div>
            <span className="eyebrow">Craft trail</span>
            <h2>Provenance log</h2>
          </div>
          <Sparkles size={18} aria-hidden="true" />
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
