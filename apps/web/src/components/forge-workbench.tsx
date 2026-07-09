import { collectibleCards } from "../lib/inventory";
import { encodePacked, keccak256 } from "viem";
import {
  ForgeWorkbenchClient,
  type ForgeIngredientView,
  type ForgeMaterialView,
  type ForgeRecipeView
} from "./forge-workbench-client";

const forgeMaterials: ForgeMaterialView[] = [
  {
    id: "fire-shard",
    tokenId: "7001",
    label: "Fire shard",
    labBalance: 3,
    source: "Guaranteed starter bundle",
    tone: "volatile"
  },
  {
    id: "vault-seal",
    tokenId: "7002",
    label: "Vault seal",
    labBalance: 1,
    source: "Guaranteed starter bundle",
    tone: "custody"
  },
  {
    id: "forge-dust",
    tokenId: "7003",
    label: "Forge dust",
    labBalance: 1,
    source: "Duplicate Recycler output",
    tone: "recycled"
  },
  {
    id: "signal-badge",
    tokenId: "9001",
    label: "Signal badge",
    labBalance: 1,
    source: "Choice reagent for Aura or refinement",
    tone: "crafted"
  },
  {
    id: "resonance-dust",
    tokenId: "7004",
    label: "Resonance dust",
    labBalance: 1,
    source: "Resonant Refinery output",
    tone: "refined"
  },
  {
    id: "resonance-aura",
    tokenId: "9002",
    label: "Resonance aura",
    labBalance: 1,
    source: "Persistent catalyst retained in wallet",
    tone: "catalyst",
    catalystOnly: true
  }
];

const emptyPattern = Array<string | null>(9).fill(null);
const seededCatalystCard = collectibleCards.find((card) => card.id === "inv-sample-graded-001");

const forgeRecipeViews: ForgeRecipeView[] = [
  {
    id: "recipe-duplicate-recycler",
    chainRecipeId: "1",
    title: "Duplicate Recycler",
    tier: "utility",
    status: "known",
    category: "recycle",
    description: "2 Fire shards become 1 Forge dust.",
    pattern: [null, null, null, "fire-shard", "fire-shard", null, null, null, null],
    catalystCardIds: [],
    catalystMaterialIds: [],
    output: "Forge dust x1",
    outputTokenId: "7003",
    outputSupplyCap: 1_000,
    totalCrafts: 0,
    maxCraftsPerWallet: 100,
    feeWei: "0",
    displayFee: "Free",
    metadataHashLabel: "recycler:v3"
  },
  {
    id: "recipe-fire-signal",
    chainRecipeId: "2",
    title: "Fire Signal",
    tier: "rare",
    status: "known",
    category: "craft",
    description: "Fire, custody, and recycled dust form a Signal badge used in the Aura and refinement paths.",
    pattern: ["fire-shard", null, "vault-seal", null, "forge-dust", null, null, null, null],
    catalystCardIds: [],
    catalystMaterialIds: [],
    output: "Signal badge x1",
    outputTokenId: "9001",
    outputSupplyCap: 100,
    totalCrafts: 0,
    maxCraftsPerWallet: 5,
    feeWei: "1000000000000000",
    displayFee: "0.001 ETH",
    metadataHashLabel: "fire-signal:v3"
  },
  {
    id: "recipe-vault-resonance",
    chainRecipeId: "3",
    title: "Vault Resonance",
    tier: "grail",
    status: "discovery",
    category: "catalyst",
    description: "Evolve a Signal badge while the linked physical pull stays intact.",
    pattern: [null, null, null, null, "signal-badge", null, null, null, null],
    catalystCardIds: seededCatalystCard ? [seededCatalystCard.id] : [],
    catalystMaterialIds: [],
    output: "Resonance aura x1",
    outputTokenId: "9002",
    outputSupplyCap: 25,
    totalCrafts: 0,
    maxCraftsPerWallet: 1,
    feeWei: "2000000000000000",
    displayFee: "0.002 ETH",
    metadataHashLabel: "vault-resonance:v3"
  },
  {
    id: "recipe-resonant-refinery",
    chainRecipeId: "4",
    title: "Resonant Refinery",
    tier: "rare",
    status: "known",
    category: "refine",
    description: "A held Resonance aura refines a later Signal badge into Resonance dust.",
    pattern: [null, null, null, null, "signal-badge", null, null, null, null],
    catalystCardIds: [],
    catalystMaterialIds: ["resonance-aura"],
    output: "Resonance dust x1",
    outputTokenId: "7004",
    outputSupplyCap: 250,
    totalCrafts: 0,
    maxCraftsPerWallet: 5,
    feeWei: "0",
    displayFee: "Free",
    metadataHashLabel: "resonant-refinery:v3"
  },
  {
    id: "recipe-curator-sigil",
    chainRecipeId: "5",
    title: "Curator Sigil",
    tier: "grail",
    status: "discovery",
    category: "catalyst",
    description: "Spend Resonance dust while your Aura and linked physical card remain held.",
    pattern: [null, null, null, null, "resonance-dust", null, null, null, null],
    catalystCardIds: seededCatalystCard ? [seededCatalystCard.id] : [],
    catalystMaterialIds: ["resonance-aura"],
    output: "Curator Sigil x1",
    outputTokenId: "9003",
    outputSupplyCap: 50,
    totalCrafts: 0,
    maxCraftsPerWallet: 1,
    feeWei: "1000000000000000",
    displayFee: "0.001 ETH",
    metadataHashLabel: "curator-sigil:v3"
  }
];

const protectedInputs: ForgeIngredientView[] = collectibleCards.map((card) => ({
  id: card.id,
  tokenId: BigInt(keccak256(encodePacked(["string", "string"], ["inventory:", card.id]))).toString(),
  title: card.title,
  subtitle: card.subtitle,
  tags: card.tags,
  grailTier: card.grailTier,
  protected: true
}));

export function ForgeWorkbench() {
  return (
    <ForgeWorkbenchClient
      ingredients={protectedInputs}
      materials={forgeMaterials}
      recipes={forgeRecipeViews.length > 0 ? forgeRecipeViews : [{
        id: "recipe-unavailable",
        chainRecipeId: "0",
        title: "Unavailable",
        tier: "utility",
        status: "locked",
        category: "craft",
        description: "No Forge blueprints are configured.",
        pattern: emptyPattern,
        catalystCardIds: [],
        catalystMaterialIds: [],
        output: "None",
        outputTokenId: "0",
        outputSupplyCap: 0,
        totalCrafts: 0,
        maxCraftsPerWallet: 0,
        feeWei: "0",
        displayFee: "Free",
        metadataHashLabel: "unavailable"
      }]}
    />
  );
}
