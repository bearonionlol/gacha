export type BrowserSeededInventoryItem = {
  inventoryId: string;
  cardName: string;
  setName: string;
  cardNumber: string;
  variant: string;
  rawConditionEstimate: string;
  gradingCompany: string | null;
  grade: string | null;
  redeemable: boolean;
  grailTier: "none" | "minor" | "major" | "grail";
};

export const browserSeededInventory: BrowserSeededInventoryItem[] = [
  {
    inventoryId: "inv-sample-pkm-raw-001",
    cardName: "Pokemon TCG Charizard ex",
    setName: "Obsidian Flames",
    cardNumber: "125/197",
    variant: "Double Rare",
    rawConditionEstimate: "Near Mint",
    gradingCompany: null,
    grade: null,
    redeemable: true,
    grailTier: "major"
  },
  {
    inventoryId: "inv-sample-op-raw-001",
    cardName: "One Piece Card Game Monkey.D.Luffy",
    setName: "Romance Dawn",
    cardNumber: "OP01-024",
    variant: "Parallel Art",
    rawConditionEstimate: "Lightly Played",
    gradingCompany: null,
    grade: null,
    redeemable: true,
    grailTier: "major"
  },
  {
    inventoryId: "inv-sample-graded-001",
    cardName: "Pokemon TCG Lugia V Alternate Art",
    setName: "Silver Tempest",
    cardNumber: "186/195",
    variant: "Alternate Art",
    rawConditionEstimate: "",
    gradingCompany: "PSA",
    grade: "10",
    redeemable: true,
    grailTier: "grail"
  }
];
