import type { InventoryItem } from "./schema";
import { createPhotoHash } from "./photo-hash";

const timestamp = "2026-07-08T00:00:00.000Z";
const legalDisclaimer = "Authentic resale collectible descriptor only; no affiliation or endorsement is claimed.";

const pokemonRawPhotos = [
  "https://assets.example.com/inventory/inv-sample-pkm-raw-001-front.jpg",
  "https://assets.example.com/inventory/inv-sample-pkm-raw-001-back.jpg"
];

const onePieceRawPhotos = [
  "https://assets.example.com/inventory/inv-sample-op-raw-001-front.jpg",
  "https://assets.example.com/inventory/inv-sample-op-raw-001-back.jpg"
];

const gradedPhotos = [
  "https://assets.example.com/inventory/inv-sample-graded-001-front.jpg",
  "https://assets.example.com/inventory/inv-sample-graded-001-back.jpg"
];

export const sampleInventory: InventoryItem[] = [
  {
    inventoryId: "inv-sample-pkm-raw-001",
    brand: "pokemon",
    category: "raw_card",
    cardName: "Pokemon TCG Charizard ex",
    setName: "Obsidian Flames",
    cardNumber: "125/197",
    language: "English",
    edition: "Modern",
    variant: "Double Rare",
    rawConditionEstimate: "Near Mint",
    conditionNotes: "Raw card descriptor for resale inventory; verify surface under direct light.",
    gradingCompany: "",
    grade: "",
    certNumber: "",
    certUrl: "",
    photoUrls: pokemonRawPhotos,
    photoHash: createPhotoHash(pokemonRawPhotos),
    vaultLocationLabel: "Sample Vault / A1",
    custodyStatus: "verified",
    redeemable: true,
    marketEstimateCents: 4500,
    buybackQuoteCents: 3000,
    grailTier: "major",
    craftingTags: ["fire", "charizard", "pokemon_raw"],
    dropEligibility: true,
    legalDisclaimer,
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    inventoryId: "inv-sample-op-raw-001",
    brand: "one_piece",
    category: "raw_card",
    cardName: "One Piece Card Game Monkey.D.Luffy",
    setName: "Romance Dawn",
    cardNumber: "OP01-024",
    language: "English",
    edition: "Modern",
    variant: "Parallel Art",
    rawConditionEstimate: "Lightly Played",
    conditionNotes: "Raw card descriptor for resale inventory; front photo shows minor corner wear.",
    gradingCompany: "",
    grade: "",
    certNumber: "",
    certUrl: "",
    photoUrls: onePieceRawPhotos,
    photoHash: createPhotoHash(onePieceRawPhotos),
    vaultLocationLabel: "Sample Vault / B2",
    custodyStatus: "vaulted",
    redeemable: true,
    marketEstimateCents: 15000,
    buybackQuoteCents: 10000,
    grailTier: "major",
    craftingTags: ["straw_hat", "one_piece_raw", "parallel"],
    dropEligibility: true,
    legalDisclaimer,
    createdAt: timestamp,
    updatedAt: timestamp
  },
  {
    inventoryId: "inv-sample-graded-001",
    brand: "pokemon",
    category: "graded_card",
    cardName: "Pokemon TCG Lugia V Alternate Art",
    setName: "Silver Tempest",
    cardNumber: "186/195",
    language: "English",
    edition: "Modern",
    variant: "Alternate Art",
    rawConditionEstimate: "",
    conditionNotes: "Graded slab descriptor for resale inventory; cert details are sample intake data.",
    gradingCompany: "PSA",
    grade: "10",
    certNumber: "SAMPLE-CERT-001",
    certUrl: "",
    photoUrls: gradedPhotos,
    photoHash: createPhotoHash(gradedPhotos),
    vaultLocationLabel: "Sample Vault / Slab Case 1",
    custodyStatus: "drop_ready",
    redeemable: true,
    marketEstimateCents: 32500,
    buybackQuoteCents: 24000,
    grailTier: "grail",
    craftingTags: ["lugia", "pokemon_graded", "alternate_art"],
    dropEligibility: true,
    legalDisclaimer,
    createdAt: timestamp,
    updatedAt: timestamp
  }
];
