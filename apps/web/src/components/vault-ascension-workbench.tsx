"use client";

import { type DragEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Beaker,
  BookOpenCheck,
  Check,
  CircleAlert,
  Copy,
  Gem,
  Hammer,
  LockKeyhole,
  PackageCheck,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  type LucideIcon
} from "lucide-react";
import { loadChainContextFromEnv } from "../lib/deployments";

type DustId = "magic" | "echo" | "prism" | "star";
type SpecialtyDustId = Exclude<DustId, "magic">;
type RecipeCell = DustId | "duplicate" | "matching" | null;
type PlacedItem = DustId | `duplicate:${string}` | null;
type RecipeGroup = "Swap" | "Ascend" | "Refine";

type DustDefinition = {
  id: DustId;
  label: string;
  role: string;
  balance: number;
  icon: LucideIcon;
};

type Blueprint = {
  id: string;
  title: string;
  shortTitle: string;
  group: RecipeGroup;
  pattern: RecipeCell[];
  intent: string;
  poolRule: string;
  dustCost: Record<DustId, number>;
};

type VaultCard = {
  id: string;
  title: string;
  set: string;
  tier: string;
  descriptor: string;
  vaultLabel: string;
};

const dustDefinitions: DustDefinition[] = [
  { id: "magic", label: "Magic Dust", role: "Fuel", balance: 420, icon: Sparkles },
  { id: "echo", label: "Echo Dust", role: "Exchange", balance: 48, icon: RotateCcw },
  { id: "prism", label: "Prism Dust", role: "Ascend", balance: 32, icon: Gem },
  { id: "star", label: "Star Dust", role: "Choice", balance: 12, icon: Star }
];

const dustById = new Map(dustDefinitions.map((dust) => [dust.id, dust]));

const blueprints: Blueprint[] = [
  {
    id: "recast",
    title: "Recast Seal",
    shortTitle: "Recast",
    group: "Swap",
    pattern: [null, null, null, "echo", "magic", "echo", null, "duplicate", null],
    intent: "Trade one duplicate for a different card from the same tier.",
    poolRule: "Same tier · surrendered identity excluded",
    dustCost: { magic: 5, echo: 10, prism: 0, star: 0 }
  },
  {
    id: "guided-recast",
    title: "Guided Recast",
    shortTitle: "Guided Recast",
    group: "Swap",
    pattern: ["star", null, "star", "echo", "magic", "echo", null, "duplicate", null],
    intent: "Reveal two different same-tier cards, then choose one.",
    poolRule: "Two reserved candidates · choose one",
    dustCost: { magic: 8, echo: 12, prism: 0, star: 4 }
  },
  {
    id: "ascension",
    title: "Ascension Seal",
    shortTitle: "Ascension",
    group: "Ascend",
    pattern: [null, "prism", null, "echo", "magic", "echo", "duplicate", "prism", "duplicate"],
    intent: "Trade two duplicates for a guaranteed pull from the next tier.",
    poolRule: "Next tier · inventory-backed random reveal",
    dustCost: { magic: 15, echo: 10, prism: 6, star: 0 }
  },
  {
    id: "guided-ascension",
    title: "Guided Ascension",
    shortTitle: "Guided Ascension",
    group: "Ascend",
    pattern: ["star", "prism", "star", "echo", "magic", "echo", "duplicate", "prism", "duplicate"],
    intent: "Reveal three next-tier cards, then choose one.",
    poolRule: "Three reserved candidates · choose one",
    dustCost: { magic: 20, echo: 12, prism: 8, star: 6 }
  },
  {
    id: "set-focused-ascension",
    title: "Set-Focused Ascension",
    shortTitle: "Set Ascension",
    group: "Ascend",
    pattern: ["duplicate", "prism", "duplicate", "star", "magic", "star", "echo", "prism", "echo"],
    intent: "Trade two same-set duplicates for a next-tier card from that set.",
    poolRule: "Verified set only · no fallback pool",
    dustCost: { magic: 24, echo: 12, prism: 10, star: 8 }
  },
  {
    id: "dust-exchange",
    title: "Dust Exchange",
    shortTitle: "Dust Exchange",
    group: "Refine",
    pattern: ["matching", null, "matching", null, "magic", null, null, "matching", null],
    intent: "Refine three matching specialty Dust into one chosen specialty Dust.",
    poolRule: "Deterministic conversion · no reveal",
    dustCost: { magic: 5, echo: 0, prism: 0, star: 0 }
  }
];

const anchorCards: VaultCard[] = [
  {
    id: "anchor-lugia",
    title: "Lugia V Alternate Art",
    set: "Silver Tempest",
    tier: "Tier III",
    descriptor: "PSA 10",
    vaultLabel: "Vault #031"
  },
  {
    id: "anchor-luffy",
    title: "Monkey.D.Luffy Parallel Art",
    set: "Romance Dawn",
    tier: "Tier II",
    descriptor: "Raw · LP",
    vaultLabel: "Vault #018"
  }
];

const eligibleTradeIns: VaultCard[] = [
  {
    id: "duplicate-charizard",
    title: "Charizard ex Double Rare",
    set: "Obsidian Flames",
    tier: "Tier II",
    descriptor: "Duplicate 2 of 2",
    vaultLabel: "Vault #044"
  },
  {
    id: "duplicate-ninetales",
    title: "Ninetales ex Ultra Rare",
    set: "Obsidian Flames",
    tier: "Tier II",
    descriptor: "Duplicate 2 of 3",
    vaultLabel: "Vault #052"
  },
  {
    id: "duplicate-zoro",
    title: "Roronoa Zoro Parallel",
    set: "Romance Dawn",
    tier: "Tier II",
    descriptor: "Duplicate 2 of 2",
    vaultLabel: "Vault #027"
  }
];

const recipeGroups: RecipeGroup[] = ["Swap", "Ascend", "Refine"];
const gridIndexes = Array.from({ length: 9 }, (_, index) => index);

function isDuplicate(item: PlacedItem): item is `duplicate:${string}` {
  return typeof item === "string" && item.startsWith("duplicate:");
}

function duplicateIdFromItem(item: `duplicate:${string}`): string {
  return item.slice("duplicate:".length);
}

function cellAccepts(requirement: RecipeCell, item: PlacedItem, exchangeFrom: SpecialtyDustId): boolean {
  if (requirement === null) return item === null;
  if (item === null) return false;
  if (requirement === "duplicate") return isDuplicate(item);
  if (requirement === "matching") return item === exchangeFrom;
  return item === requirement;
}

function requirementLabel(requirement: RecipeCell, exchangeFrom: SpecialtyDustId): string {
  if (requirement === null) return "Open slot";
  if (requirement === "duplicate") return "Trade-in card";
  if (requirement === "matching") return dustById.get(exchangeFrom)?.label ?? "Matching Dust";
  return dustById.get(requirement)?.label ?? requirement;
}

function patternTokenLabel(requirement: RecipeCell): string {
  if (requirement === null) return "";
  if (requirement === "duplicate") return "D";
  if (requirement === "matching") return "X";
  return requirement.charAt(0).toUpperCase();
}

function nextSpecialtyDust(current: SpecialtyDustId): SpecialtyDustId {
  if (current === "echo") return "prism";
  if (current === "prism") return "star";
  return "echo";
}

function tradeInIdsFromGrid(grid: PlacedItem[]): string[] {
  return grid.filter(isDuplicate).map(duplicateIdFromItem);
}

function recipeDustCost(recipe: Blueprint, exchangeFrom: SpecialtyDustId): Record<DustId, number> {
  const cost = { ...recipe.dustCost };
  if (recipe.id === "dust-exchange") cost[exchangeFrom] = 3;
  return cost;
}

function dustUnitsForCell(recipe: Blueprint, requirement: RecipeCell, exchangeFrom: SpecialtyDustId): number {
  if (requirement === null || requirement === "duplicate") return 0;
  const kind = requirement === "matching" ? exchangeFrom : requirement;
  const matchingCells = recipe.pattern.filter((cell) =>
    cell === kind || (cell === "matching" && kind === exchangeFrom)
  ).length;
  return matchingCells === 0 ? 0 : recipeDustCost(recipe, exchangeFrom)[kind] / matchingCells;
}

function calculateDustSpend(
  grid: PlacedItem[],
  recipe: Blueprint,
  exchangeFrom: SpecialtyDustId
): Record<DustId, number> {
  const spend: Record<DustId, number> = { magic: 0, echo: 0, prism: 0, star: 0 };
  grid.forEach((item, index) => {
    const requirement = recipe.pattern[index] ?? null;
    if (item !== null && !isDuplicate(item) && cellAccepts(requirement, item, exchangeFrom)) {
      spend[item] += dustUnitsForCell(recipe, requirement, exchangeFrom);
    }
  });
  return spend;
}

export function VaultAscensionWorkbench() {
  const chainContext = useMemo(() => loadChainContextFromEnv({
    NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY: process.env.NEXT_PUBLIC_GACHA_DEPLOYMENT_REGISTRY
  }), []);
  const [selectedRecipeId, setSelectedRecipeId] = useState(blueprints[0]!.id);
  const [anchorId, setAnchorId] = useState(anchorCards[0]!.id);
  const [grid, setGrid] = useState<PlacedItem[]>(Array(9).fill(null));
  const [selectedTradeInIds, setSelectedTradeInIds] = useState<string[]>([]);
  const [exchangeFrom, setExchangeFrom] = useState<SpecialtyDustId>("echo");
  const [exchangeTo, setExchangeTo] = useState<SpecialtyDustId>("prism");
  const [labMessage, setLabMessage] = useState("Choose a blueprint or place materials to begin.");

  const selectedRecipe = blueprints.find((recipe) => recipe.id === selectedRecipeId) ?? blueprints[0]!;
  const selectedAnchor = anchorCards.find((card) => card.id === anchorId) ?? anchorCards[0]!;
  const selectedTradeIns = selectedTradeInIds
    .map((id) => eligibleTradeIns.find((card) => card.id === id))
    .filter((card): card is VaultCard => card !== undefined);
  const requiredTradeInCount = selectedRecipe.pattern.filter((cell) => cell === "duplicate").length;
  const requiredMarkCount = selectedRecipe.pattern.filter((cell) => cell !== null).length;
  const matchingMarkCount = selectedRecipe.pattern.reduce(
    (total, requirement, index) => total + (requirement !== null && cellAccepts(requirement, grid[index] ?? null, exchangeFrom) ? 1 : 0),
    0
  );
  const blueprintMatched = selectedRecipe.pattern.every((requirement, index) =>
    cellAccepts(requirement, grid[index] ?? null, exchangeFrom)
  );

  const dustSpend = useMemo(
    () => calculateDustSpend(grid, selectedRecipe, exchangeFrom),
    [exchangeFrom, grid, selectedRecipe]
  );
  const exactDustCost = recipeDustCost(selectedRecipe, exchangeFrom);

  const outcome = getOutcome(selectedRecipe, selectedTradeIns, exchangeTo);

  function selectRecipe(recipe: Blueprint) {
    setSelectedRecipeId(recipe.id);
    setGrid(Array(9).fill(null));
    setSelectedTradeInIds([]);
    setLabMessage(`${recipe.title} loaded. Pattern is ready to fill.`);
  }

  function placeDust(dustId: DustId, preferredSlot?: number) {
    const matchingSlot = selectedRecipe.pattern.findIndex(
      (requirement, index) => grid[index] === null && cellAccepts(requirement, dustId, exchangeFrom)
    );
    const openSlot = grid.findIndex((item) => item === null);
    const targetSlot = preferredSlot ?? (matchingSlot >= 0 ? matchingSlot : openSlot);
    if (targetSlot < 0 || targetSlot > 8) {
      setLabMessage("The grid is full. Remove a mark or clear the blueprint.");
      return;
    }

    const nextGrid = [...grid];
    nextGrid[targetSlot] = dustId;
    const nextSpend = calculateDustSpend(nextGrid, selectedRecipe, exchangeFrom);
    const balance = dustById.get(dustId)?.balance ?? 0;
    if (nextSpend[dustId] > balance) {
      setLabMessage(`${dustById.get(dustId)?.label ?? "Dust"} balance is short by ${nextSpend[dustId] - balance}.`);
      return;
    }
    setGrid(nextGrid);
    setSelectedTradeInIds(tradeInIdsFromGrid(nextGrid));
    setLabMessage(`${dustById.get(dustId)?.label ?? "Dust"} placed in cell ${targetSlot + 1}.`);
  }

  function canAddTradeIn(card: VaultCard, replacedCardId?: string): { allowed: boolean; reason?: string } {
    const remainingTradeIns = selectedTradeIns.filter((tradeIn) => tradeIn.id !== replacedCardId);
    if (requiredTradeInCount === 0) return { allowed: false, reason: "This blueprint does not accept card trade-ins." };
    if (selectedTradeInIds.includes(card.id)) return { allowed: true };
    if (remainingTradeIns.length >= requiredTradeInCount) {
      return { allowed: false, reason: `This blueprint accepts ${requiredTradeInCount} trade-in${requiredTradeInCount === 1 ? "" : "s"}.` };
    }
    if (
      selectedRecipe.id === "set-focused-ascension" &&
      remainingTradeIns.length > 0 &&
      remainingTradeIns[0]!.set !== card.set
    ) {
      return { allowed: false, reason: `Set Ascension requires cards from ${remainingTradeIns[0]!.set}.` };
    }
    return { allowed: true };
  }

  function addTradeInToGrid(card: VaultCard, preferredSlot?: number) {
    const replacedItem = preferredSlot === undefined ? null : grid[preferredSlot] ?? null;
    const replacedCardId = isDuplicate(replacedItem) ? duplicateIdFromItem(replacedItem) : undefined;
    const validation = canAddTradeIn(card, replacedCardId);
    if (!validation.allowed) {
      setLabMessage(validation.reason ?? "That card is not eligible for this blueprint.");
      return;
    }

    const item: `duplicate:${string}` = `duplicate:${card.id}`;
    const matchingSlot = selectedRecipe.pattern.findIndex(
      (requirement, index) => grid[index] === null && requirement === "duplicate"
    );
    const targetSlot = preferredSlot ?? matchingSlot;
    if (targetSlot < 0 || targetSlot > 8) {
      setLabMessage("No open trade-in cell remains in this blueprint.");
      return;
    }

    const nextGrid = grid.map((current) => current === item ? null : current);
    nextGrid[targetSlot] = item;
    setGrid(nextGrid);
    setSelectedTradeInIds(tradeInIdsFromGrid(nextGrid));
    setLabMessage(`${card.title} marked as a custody transfer.`);
  }

  function toggleTradeIn(card: VaultCard) {
    if (selectedTradeInIds.includes(card.id)) {
      const item: `duplicate:${string}` = `duplicate:${card.id}`;
      setSelectedTradeInIds((current) => current.filter((id) => id !== card.id));
      setGrid((current) => current.map((cell) => cell === item ? null : cell));
      setLabMessage(`${card.title} removed from the trade-in.`);
      return;
    }
    addTradeInToGrid(card);
  }

  function removeGridItem(index: number) {
    const item = grid[index];
    if (item === null || item === undefined) return;
    const nextGrid = [...grid];
    nextGrid[index] = null;
    setGrid(nextGrid);
    if (isDuplicate(item)) {
      const duplicateId = duplicateIdFromItem(item);
      setSelectedTradeInIds((current) => current.filter((id) => id !== duplicateId));
    }
    setLabMessage(`Cell ${index + 1} cleared.`);
  }

  function autoFill() {
    let duplicateIndex = 0;
    const nextGrid = selectedRecipe.pattern.map((requirement): PlacedItem => {
      if (requirement === null) return null;
      if (requirement === "duplicate") {
        const duplicateId = selectedTradeInIds[duplicateIndex++];
        return duplicateId ? `duplicate:${duplicateId}` : null;
      }
      if (requirement === "matching") return exchangeFrom;
      return requirement;
    });
    const nextSpend = calculateDustSpend(nextGrid, selectedRecipe, exchangeFrom);
    const insufficientDust = dustDefinitions.find((dust) => nextSpend[dust.id] > dust.balance);
    if (insufficientDust) {
      setLabMessage(`${insufficientDust.label} balance is short by ${nextSpend[insufficientDust.id] - insufficientDust.balance}.`);
      return;
    }
    setGrid(nextGrid);
    setLabMessage(
      selectedTradeInIds.length < requiredTradeInCount
        ? `Dust placed. Select ${requiredTradeInCount - selectedTradeInIds.length} more eligible trade-in${requiredTradeInCount - selectedTradeInIds.length === 1 ? "" : "s"}.`
        : `${selectedRecipe.title} pattern auto-filled.`
    );
  }

  function clearGrid() {
    setGrid(Array(9).fill(null));
    setSelectedTradeInIds([]);
    setLabMessage("Grid cleared. No assets are marked for use.");
  }

  function handleDustDragStart(dustId: DustId, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("application/x-vault-dust", dustId);
  }

  function handleTradeInDragStart(cardId: string, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData("application/x-vault-trade-in", cardId);
  }

  function handleDrop(index: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    const dustId = event.dataTransfer.getData("application/x-vault-dust") as DustId;
    if (dustById.has(dustId)) {
      placeDust(dustId, index);
      return;
    }
    const cardId = event.dataTransfer.getData("application/x-vault-trade-in");
    const card = eligibleTradeIns.find((candidate) => candidate.id === cardId);
    if (card) addTradeInToGrid(card, index);
  }

  function updateExchangeFrom(nextFrom: SpecialtyDustId) {
    const previousFrom = exchangeFrom;
    setExchangeFrom(nextFrom);
    setGrid((current) => current.map((item, index) =>
      selectedRecipe.pattern[index] === "matching" && item === previousFrom ? nextFrom : item
    ));
    if (exchangeTo === nextFrom) setExchangeTo(nextSpecialtyDust(nextFrom));
    setLabMessage(`${dustById.get(nextFrom)?.label} selected as the source material.`);
  }

  return (
    <section className="vault-ascension-workbench" aria-label="Vault Ascension workbench">
      <header className="va-command-bar">
        <div>
          <span className="eyebrow">Practice Forge / Ascension</span>
          <h2>Vault Ascension</h2>
          <p>Practice with illustrative balances, then review the live settlement separately. Nothing moves from this lab.</p>
        </div>
        <div className="va-mode-control" role="group" aria-label="Forge environment">
          <button aria-pressed="true" className="active" type="button">
            <Beaker size={15} aria-hidden="true" />
            Lab
          </button>
          <button
            aria-pressed="false"
            onClick={() => document.getElementById("vault-forge-live")?.scrollIntoView({ block: "start" })}
            type="button"
          >
            <Hammer size={15} aria-hidden="true" />
            Live
          </button>
          <span>{chainContext.environmentLabel} settlement below</span>
        </div>
      </header>

      <ol className="va-flow-steps" aria-label="Forge recipe steps">
        <li><span>1</span><strong>Choose a recipe</strong><small>Read its exact result and pool rule.</small></li>
        <li><span>2</span><strong>Match the seal</strong><small>Click or drag Dust and eligible duplicates.</small></li>
        <li><span>3</span><strong>Review settlement</strong><small>Confirm every spent, transferred, and retained input.</small></li>
      </ol>

      <section className="va-dust-bank" aria-labelledby="va-dust-bank-title">
        <div className="va-section-label">
          <span className="eyebrow" id="va-dust-bank-title">Practice balances</span>
          <strong>Dust satchel</strong>
        </div>
        <div className="va-dust-balances">
          {dustDefinitions.map((dust) => {
            const Icon = dust.icon;
            return (
              <button
                aria-label={`Add ${dust.label}`}
                className={`va-dust-control dust-${dust.id}`}
                draggable
                key={dust.id}
                onClick={() => placeDust(dust.id)}
                onDragStart={(event) => handleDustDragStart(dust.id, event)}
                title={`Add ${dust.label} to the next matching cell`}
                type="button"
              >
                <span className="va-dust-icon"><Icon size={17} aria-hidden="true" /></span>
                <span>
                  <strong>{dust.label}</strong>
                  <small>{dust.role}</small>
                </span>
                <b>{dust.balance - dustSpend[dust.id]}</b>
              </button>
            );
          })}
        </div>
      </section>

      <div className="va-workspace">
        <aside className="va-recipe-book" aria-labelledby="va-recipe-book-title">
          <div className="va-column-heading">
            <BookOpenCheck size={18} aria-hidden="true" />
            <div>
              <span className="eyebrow">All blueprints</span>
              <h3 id="va-recipe-book-title">Recipe book</h3>
            </div>
          </div>
          {recipeGroups.map((group) => (
            <section className="va-recipe-group" aria-labelledby={`va-group-${group.toLowerCase()}`} key={group}>
              <h4 id={`va-group-${group.toLowerCase()}`}>{group}</h4>
              <div className="va-recipe-list">
                {blueprints.filter((recipe) => recipe.group === group).map((recipe) => (
                  <button
                    aria-label={`Load ${recipe.title}`}
                    aria-pressed={selectedRecipe.id === recipe.id}
                    className={selectedRecipe.id === recipe.id ? "va-recipe-row selected" : "va-recipe-row"}
                    key={recipe.id}
                    onClick={() => selectRecipe(recipe)}
                    type="button"
                  >
                    <span className="va-recipe-copy">
                      <strong>{recipe.title}</strong>
                      <small>{recipe.intent}</small>
                    </span>
                    <span className="va-pattern-mini" aria-hidden="true">
                      {recipe.pattern.map((cell, index) => (
                        <i className={cell === null ? "empty" : `token-${cell}`} key={`${recipe.id}-${index}`}>
                          {patternTokenLabel(cell)}
                        </i>
                      ))}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </aside>

        <main className="va-lab" aria-labelledby="va-active-blueprint-title">
          <section className="va-anchor-control" aria-label="Protected Anchor">
            <div className="va-anchor-heading">
              <span className="va-anchor-icon"><ShieldCheck size={19} aria-hidden="true" /></span>
              <div>
                <span className="eyebrow">Protected Anchor</span>
                <strong>Retained in vault</strong>
              </div>
            </div>
            <label>
              <span>Select Anchor</span>
              <select aria-label="Select protected Anchor" onChange={(event) => setAnchorId(event.target.value)} value={anchorId}>
                {anchorCards.map((card) => (
                  <option key={card.id} value={card.id}>{card.title} · {card.tier}</option>
                ))}
              </select>
            </label>
            <div className="va-anchor-readout">
              <span>{selectedAnchor.vaultLabel}</span>
              <strong>{selectedAnchor.title}</strong>
              <small>{selectedAnchor.set} · {selectedAnchor.descriptor} · never transferred</small>
            </div>
          </section>

          <section className="va-grid-stage">
            <div className="va-grid-heading">
              <div>
                <span className="eyebrow">Active blueprint</span>
                <h3 id="va-active-blueprint-title">{selectedRecipe.title}</h3>
                <p>{selectedRecipe.intent}</p>
              </div>
              <div className="va-grid-actions">
                <button className="secondary-action" onClick={autoFill} type="button">
                  <Sparkles size={15} aria-hidden="true" />
                  Auto-fill {selectedRecipe.shortTitle}
                </button>
                <button aria-label="Clear grid" className="va-icon-button" onClick={clearGrid} title="Clear grid" type="button">
                  <X size={17} aria-hidden="true" />
                </button>
              </div>
            </div>

            {selectedRecipe.id === "dust-exchange" ? (
              <div className="va-exchange-controls" aria-label="Dust Exchange settings">
                <label>
                  <span>Spend</span>
                  <select aria-label="Spend Dust" onChange={(event) => updateExchangeFrom(event.target.value as SpecialtyDustId)} value={exchangeFrom}>
                    {dustDefinitions.filter((dust) => dust.id !== "magic").map((dust) => (
                      <option key={dust.id} value={dust.id}>{dust.label}</option>
                    ))}
                  </select>
                </label>
                <ArrowRight size={17} aria-hidden="true" />
                <label>
                  <span>Receive</span>
                  <select aria-label="Receive Dust" onChange={(event) => setExchangeTo(event.target.value as SpecialtyDustId)} value={exchangeTo}>
                    {dustDefinitions.filter((dust) => dust.id !== "magic").map((dust) => (
                      <option disabled={dust.id === exchangeFrom} key={dust.id} value={dust.id}>{dust.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

            <div className="va-grid" aria-label={`${selectedRecipe.title} 3 by 3 crafting grid`}>
              {gridIndexes.map((index) => {
                const requirement = selectedRecipe.pattern[index] ?? null;
                const item = grid[index] ?? null;
                const matched = requirement !== null && cellAccepts(requirement, item, exchangeFrom);
                const misplaced = item !== null && !matched;
                const duplicate = isDuplicate(item) ? eligibleTradeIns.find((card) => card.id === duplicateIdFromItem(item)) : null;
                const dust = item !== null && !isDuplicate(item) ? dustById.get(item) : null;
                const Icon = dust?.icon;
                const cellDustUnits = dustUnitsForCell(selectedRecipe, requirement, exchangeFrom);
                return (
                  <button
                    aria-label={item === null ? `Crafting cell ${index + 1}, needs ${requirementLabel(requirement, exchangeFrom)}` : `Remove ${duplicate?.title ?? dust?.label ?? "item"} from cell ${index + 1}`}
                    className={`va-grid-cell${index === 4 ? " center" : ""}${matched ? " matched" : ""}${misplaced ? " misplaced" : ""}${isDuplicate(item) ? " trade-in" : ""}`}
                    key={index}
                    onClick={() => removeGridItem(index)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(index, event)}
                    type="button"
                  >
                    {item === null ? (
                      <>
                        <span className={`va-cell-rune token-${requirement ?? "empty"}`}>{patternTokenLabel(requirement)}</span>
                        <strong>{requirementLabel(requirement, exchangeFrom)}</strong>
                        <small>Cell {index + 1}{cellDustUnits > 0 ? ` · ${cellDustUnits} units` : ""}</small>
                      </>
                    ) : isDuplicate(item) ? (
                      <>
                        <span className="va-cell-rune token-duplicate"><Copy size={17} aria-hidden="true" /></span>
                        <strong>{duplicate?.title ?? "Selected duplicate"}</strong>
                        <small>Transfers to custody</small>
                      </>
                    ) : (
                      <>
                        <span className={`va-cell-rune token-${item}`}>{Icon ? <Icon size={17} aria-hidden="true" /> : null}</span>
                        <strong>{dust?.label}</strong>
                        <small>{matched ? `${cellDustUnits} units · matched` : "Wrong position"}</small>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="va-grid-status" role="status">
              <span className={blueprintMatched ? "complete" : ""}>
                {blueprintMatched ? <Check size={15} aria-hidden="true" /> : <Beaker size={15} aria-hidden="true" />}
                {blueprintMatched ? "Blueprint matched" : `${matchingMarkCount} of ${requiredMarkCount} marks matched`}
              </span>
              <small>{labMessage}</small>
            </div>
          </section>

          <section className="va-trade-ins" aria-labelledby="va-trade-ins-title">
            <div className="va-trade-in-heading">
              <div>
                <span className="eyebrow">Physical inputs</span>
                <h3 id="va-trade-ins-title">Eligible duplicates</h3>
              </div>
              <span>{selectedTradeInIds.length} / {requiredTradeInCount} selected</span>
            </div>
            {requiredTradeInCount === 0 ? (
              <p className="va-no-trade-ins"><LockKeyhole size={15} aria-hidden="true" /> This blueprint spends Dust only. Vault cards stay locked.</p>
            ) : (
              <div className="va-trade-in-list">
                {eligibleTradeIns.map((card) => {
                  const selected = selectedTradeInIds.includes(card.id);
                  const validation = canAddTradeIn(card);
                  return (
                    <button
                      aria-label={`${selected ? "Remove" : "Select"} trade-in ${card.title}`}
                      aria-pressed={selected}
                      className={selected ? "va-trade-in-row selected" : "va-trade-in-row"}
                      disabled={!selected && !validation.allowed}
                      draggable={!selected && validation.allowed}
                      key={card.id}
                      onClick={() => toggleTradeIn(card)}
                      onDragStart={(event) => handleTradeInDragStart(card.id, event)}
                      title={!selected && !validation.allowed ? validation.reason : "Select as a custody trade-in"}
                      type="button"
                    >
                      <span className="va-check-box">{selected ? <Check size={14} aria-hidden="true" /> : null}</span>
                      <span>
                        <strong>{card.title}</strong>
                        <small>{card.set} · {card.tier} · {card.descriptor}</small>
                      </span>
                      <b>{selected ? "Transfers" : card.vaultLabel}</b>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedTradeInIds.length > 0 ? (
              <div className="va-custody-warning" role="alert">
                <CircleAlert size={17} aria-hidden="true" />
                <p><strong>Trade-in warning</strong> Selected duplicates transfer into claim-specific protocol custody when the live craft is submitted. They return if randomness expires. Your protected Anchor is retained.</p>
              </div>
            ) : null}
          </section>
        </main>

        <aside className="va-outcome" aria-labelledby="va-outcome-title">
          <div className="va-column-heading">
            <PackageCheck size={18} aria-hidden="true" />
            <div>
              <span className="eyebrow">Exact preview</span>
              <h3 id="va-outcome-title">Craft result</h3>
            </div>
          </div>

          <section className="va-result-block" aria-live="polite">
            <span className="va-result-type">{selectedRecipe.group}</span>
            <strong>{outcome.title}</strong>
            <p>{outcome.description}</p>
            <small>{selectedRecipe.poolRule}</small>
          </section>

          <section className="va-disposition" aria-labelledby="va-disposition-title">
            <h4 id="va-disposition-title">Input disposition</h4>
            <dl>
              <div>
                <dt><ShieldCheck size={15} aria-hidden="true" /> Anchor</dt>
                <dd>Retained</dd>
              </div>
              <div>
                <dt><Sparkles size={15} aria-hidden="true" /> Dust</dt>
                <dd>Spent</dd>
              </div>
              <div>
                <dt><Copy size={15} aria-hidden="true" /> Duplicates</dt>
                <dd>{requiredTradeInCount === 0 ? "Not used" : "Transferred"}</dd>
              </div>
            </dl>
          </section>

          <section className="va-cost-summary" aria-labelledby="va-cost-title">
            <h4 id="va-cost-title">Grid cost</h4>
            <ul>
              {dustDefinitions.filter((dust) => exactDustCost[dust.id] > 0).map((dust) => (
                <li key={dust.id}><span>{dust.label}</span><strong>{exactDustCost[dust.id]}</strong></li>
              ))}
              {requiredTradeInCount > 0 ? <li><span>Eligible duplicate{requiredTradeInCount > 1 ? "s" : ""}</span><strong>{requiredTradeInCount}</strong></li> : null}
            </ul>
          </section>

          <div className={blueprintMatched ? "va-settlement-state ready" : "va-settlement-state"}>
            {blueprintMatched ? <Check size={17} aria-hidden="true" /> : <CircleAlert size={17} aria-hidden="true" />}
            <p>
              <strong>{blueprintMatched ? "Lab recipe complete" : "Recipe incomplete"}</strong>
              {blueprintMatched ? "Preview is exact. No wallet action is available in Lab." : "Match every marked cell to finish the preview."}
            </p>
          </div>
          <button
            className="primary-action va-live-action"
            onClick={() => document.getElementById("vault-forge-live")?.scrollIntoView({ block: "start" })}
            type="button"
          >
            <Hammer size={16} aria-hidden="true" />
            Open live settlement
          </button>
        </aside>
      </div>
    </section>
  );
}

function getOutcome(recipe: Blueprint, selectedTradeIns: VaultCard[], exchangeTo: SpecialtyDustId) {
  const setName = selectedTradeIns[0]?.set ?? "the selected set";
  if (recipe.id === "recast") {
    return { title: "1 different Tier II card", description: "A random same-tier card, excluding the surrendered collectible identity." };
  }
  if (recipe.id === "guided-recast") {
    return { title: "Choose 1 of 2 Tier II cards", description: "Two distinct same-tier candidates are reserved. Keep one; the other returns to its pool." };
  }
  if (recipe.id === "ascension") {
    return { title: "1 random Tier III card", description: "A guaranteed next-tier claim from the disclosed, inventory-backed pool." };
  }
  if (recipe.id === "guided-ascension") {
    return { title: "Choose 1 of 3 Tier III cards", description: "Three distinct next-tier candidates are reserved for a guided reveal." };
  }
  if (recipe.id === "set-focused-ascension") {
    return { title: `1 random Tier III ${setName} card`, description: "The claim stays inside the verified set pool. It never falls back to another set." };
  }
  const outputDust = dustById.get(exchangeTo)?.label ?? "specialty Dust";
  return { title: `1 ${outputDust}`, description: "A deterministic refinement. The selected output is credited when the craft settles." };
}
