import { keccak256, stringToHex, type Hex } from "viem";

export type ForgeSlot = string | null;
export type ForgeFrame = "signal" | "prism" | "mono";

export type ForgePatternResult = {
  complete: boolean;
  matchedSlots: number;
  requiredSlots: number;
  misplacedSlots: number;
};

export type PlaceForgeMaterialInput = {
  balance: number;
  materialId: string;
  pattern: readonly ForgeSlot[];
  slots: readonly ForgeSlot[];
  preferredSlot?: number;
};

export type PlaceForgeMaterialResult = {
  slots: ForgeSlot[];
  placedAt: number | null;
  reason: "placed" | "balance-exhausted" | "grid-full" | "invalid-slot";
};

export function evaluateForgePattern(
  pattern: readonly ForgeSlot[],
  slots: readonly ForgeSlot[]
): ForgePatternResult {
  const requiredSlots = pattern.filter((materialId) => materialId !== null).length;
  let matchedSlots = 0;
  let misplacedSlots = 0;

  for (let index = 0; index < 9; index += 1) {
    const expected = pattern[index] ?? null;
    const actual = slots[index] ?? null;
    if (expected !== null && expected === actual) {
      matchedSlots += 1;
    } else if (actual !== null) {
      misplacedSlots += 1;
    }
  }

  return {
    complete: matchedSlots === requiredSlots && misplacedSlots === 0,
    matchedSlots,
    requiredSlots,
    misplacedSlots
  };
}

export function placeForgeMaterial(input: PlaceForgeMaterialInput): PlaceForgeMaterialResult {
  const slots = normalizeSlots(input.slots);
  const placedCount = slots.filter((materialId) => materialId === input.materialId).length;
  if (placedCount >= Math.max(0, input.balance)) {
    return { slots, placedAt: null, reason: "balance-exhausted" };
  }

  if (input.preferredSlot !== undefined) {
    const slot = input.preferredSlot;
    if (!Number.isInteger(slot) || slot < 0 || slot >= 9 || slots[slot] !== null) {
      return { slots, placedAt: null, reason: "invalid-slot" };
    }

    slots[slot] = input.materialId;
    return { slots, placedAt: slot, reason: "placed" };
  }

  const matchingSlot = input.pattern.findIndex(
    (materialId, index) => materialId === input.materialId && slots[index] === null
  );
  const openSlot = matchingSlot >= 0 ? matchingSlot : slots.findIndex((materialId) => materialId === null);
  if (openSlot < 0) {
    return { slots, placedAt: null, reason: "grid-full" };
  }

  slots[openSlot] = input.materialId;
  return { slots, placedAt: openSlot, reason: "placed" };
}

export function buildForgeImprint(input: {
  recipeId: bigint;
  frame: ForgeFrame;
  inscription: string;
  slots: readonly ForgeSlot[];
}): Hex {
  const normalized = JSON.stringify({
    version: 1,
    recipeId: input.recipeId.toString(),
    frame: input.frame,
    inscription: input.inscription.trim().slice(0, 24),
    slots: normalizeSlots(input.slots)
  });

  return keccak256(stringToHex(normalized));
}

export function getForgeRevenueProjection(input: {
  feeWei: bigint;
  maxTotalCrafts: number;
  totalCrafts: number;
}): { remainingCrafts: number; remainingFeeWei: bigint } {
  const remainingCrafts = Math.max(0, Math.floor(input.maxTotalCrafts) - Math.max(0, Math.floor(input.totalCrafts)));
  const feeWei = input.feeWei > 0n ? input.feeWei : 0n;

  return {
    remainingCrafts,
    remainingFeeWei: feeWei * BigInt(remainingCrafts)
  };
}

function normalizeSlots(slots: readonly ForgeSlot[]): ForgeSlot[] {
  return Array.from({ length: 9 }, (_, index) => slots[index] ?? null);
}
