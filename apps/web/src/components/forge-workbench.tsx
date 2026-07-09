import { collectibleCards } from "../lib/inventory";
import { forgeRecipes } from "../lib/game-state";
import {
  ForgeWorkbenchClient,
  type ForgeIngredientView,
  type ForgeMaterialView,
  type ForgeRecipeView
} from "./forge-workbench-client";

type BaseForgeRecipe = (typeof forgeRecipes)[number];

const fallbackFireRecipe: BaseForgeRecipe = {
  id: "recipe-fire-signal",
  title: "Fire Signal Upgrade",
  progressPercent: 0,
  ingredients: ["fire", "charizard", "pokemon_raw"],
  output: "Animated vault badge",
  cap: 25,
  feeCents: 150,
  warning: "Crafting preview does not burn items or guarantee secondary market value."
};

const fallbackGrailRecipe: BaseForgeRecipe = {
  id: "recipe-grail-path",
  title: "Grail Path",
  progressPercent: 0,
  ingredients: ["alternate_art", "pokemon_graded"],
  output: "Priority redemption review",
  cap: 10,
  feeCents: 250,
  warning: "Grail recipes require explicit confirmation in later protocol phases."
};

const [fireSignalRecipe = fallbackFireRecipe, grailPathRecipe = fallbackGrailRecipe] = forgeRecipes;

const forgeMaterials: ForgeMaterialView[] = [
  {
    id: "fire-shard",
    label: "Fire shard",
    balance: 12,
    source: "Duplicate fire-tag pulls",
    tone: "volatile",
    recipeTags: ["fire", "charizard"]
  },
  {
    id: "vault-seal",
    label: "Vault seal",
    balance: 4,
    source: "Verified custody bonus",
    tone: "custody",
    recipeTags: ["vault", "verified"]
  },
  {
    id: "parallel-ink",
    label: "Parallel ink",
    balance: 7,
    source: "One Piece duplicate foil",
    tone: "foil",
    recipeTags: ["parallel", "straw_hat"]
  },
  {
    id: "slab-prism",
    label: "Slab prism",
    balance: 2,
    source: "Graded-card recycling",
    tone: "graded",
    recipeTags: ["graded", "alternate_art"]
  },
  {
    id: "forge-dust",
    label: "Forge dust",
    balance: 18,
    source: "Universal material recycler",
    tone: "base",
    recipeTags: ["dust", "wildcard"]
  }
];

const forgeRecipeViews: ForgeRecipeView[] = [
  {
    ...fireSignalRecipe,
    tier: "rare",
    status: "known",
    description: "Turns duplicate fire materials into a vault badge users can flex on their profile.",
    requiredMaterialIds: ["fire-shard", "vault-seal", "forge-dust"],
    expectedProtocolRevenueCents: 150
  },
  {
    id: "recipe-parallel-captain",
    title: "Parallel Captain Sigil",
    tier: "elite",
    status: "discovery",
    description: "A hidden One Piece path. Users see the hint, then test combinations in the sandbox.",
    progressPercent: 12,
    ingredients: ["parallel", "straw_hat", "vault"],
    requiredMaterialIds: ["parallel-ink", "vault-seal", "forge-dust"],
    output: "Animated captain sigil",
    cap: 50,
    feeCents: 225,
    expectedProtocolRevenueCents: 225,
    warning: "Discovery recipes reveal the path only after a valid lab match."
  },
  {
    ...grailPathRecipe,
    tier: "grail",
    status: "locked",
    description: "A premium grail path held behind explicit unlock rules and operator review.",
    requiredMaterialIds: ["slab-prism", "vault-seal", "forge-dust"],
    expectedProtocolRevenueCents: 250
  }
];

const protectedInputs: ForgeIngredientView[] = collectibleCards.map((card) => ({
  id: card.id,
  title: card.title,
  subtitle: card.subtitle,
  tags: card.tags,
  grailTier: card.grailTier,
  protected: card.grailTier === "grail" || card.grailTier === "major"
}));

export function ForgeWorkbench() {
  return (
    <ForgeWorkbenchClient
      ingredients={protectedInputs}
      materials={forgeMaterials}
      recipes={forgeRecipeViews}
    />
  );
}
