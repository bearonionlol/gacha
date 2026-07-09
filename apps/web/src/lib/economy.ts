const BASIS_POINTS = 10_000;

export type ProtocolTakeInput = {
  feeBps: number;
  priceCents: number;
};

export type ProtocolTake = ProtocolTakeInput & {
  protocolFeeCents: number;
  sellerReceivesCents: number;
};

export type DropMarginInput = {
  estimatedInventoryCostCents: number;
  packPriceCents: number;
  reserveBps: number;
  targetProtocolFeeBps: number;
};

export type DropMargin = DropMarginInput & {
  grossMarginCents: number;
  protocolFeeCents: number;
  reserveCents: number;
};

export type SinkBudgetInput = {
  craftFeeCents: number;
  dustBalance: number;
  dustFloor: number;
  dustSpent: number;
};

export type SinkBudget = {
  allowed: boolean;
  craftFeeCents: number;
  dustRemaining: number;
  reason: "dust-floor-breach" | "invalid-craft-fee" | "within-sink-budget";
};

export type BuybackSpreadInput = {
  buybackCents: number;
  estimateCents: number;
};

export type BuybackSpread = BuybackSpreadInput & {
  spreadBps: number;
  spreadCents: number;
};

export type EconomyDrop = {
  packPriceCents: number;
  remainingSupply: number;
  totalSupply: number;
};

export type EconomyListing = {
  askCents: number;
  buybackCents: number;
  feeBps: number;
};

export type EconomyVaultStats = {
  buybackValueCents: number;
  marketValueCents: number;
  totalItems: number;
};

export type ProtocolEconomySnapshot = {
  buybackSpread: {
    spreadBps: number;
    spreadCents: number;
    title: "Buyback spread";
  };
  marketFees: {
    blendedFeeBps: number;
    projectedFeeCents: number;
    title: "Marketplace take";
  };
  operatorReserve: {
    reserveCents: number;
    reservePercent: number;
    title: "Operator reserve";
  };
  packMargin: {
    grossMarginCents: number;
    packPriceCents: number;
    protocolFeeCents: number;
    title: "Drop margin";
  };
};

function requireFiniteCents(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }

  return Math.max(0, Math.round(value));
}

function requireFiniteBps(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be finite`);
  }

  return Math.min(BASIS_POINTS, Math.max(0, Math.round(value)));
}

function calculateBpsCents(priceCents: number, bps: number): number {
  const normalizedPrice = requireFiniteCents(priceCents, "priceCents");
  const normalizedBps = requireFiniteBps(bps, "feeBps");

  return Math.ceil((normalizedPrice * normalizedBps) / BASIS_POINTS);
}

export function calculateProtocolTake(input: ProtocolTakeInput): ProtocolTake {
  const priceCents = requireFiniteCents(input.priceCents, "priceCents");
  const feeBps = requireFiniteBps(input.feeBps, "feeBps");
  const protocolFeeCents = calculateBpsCents(priceCents, feeBps);

  return {
    feeBps,
    priceCents,
    protocolFeeCents,
    sellerReceivesCents: Math.max(0, priceCents - protocolFeeCents)
  };
}

export function projectDropMargin(input: DropMarginInput): DropMargin {
  const packPriceCents = requireFiniteCents(input.packPriceCents, "packPriceCents");
  const estimatedInventoryCostCents = requireFiniteCents(
    input.estimatedInventoryCostCents,
    "estimatedInventoryCostCents"
  );
  const targetProtocolFeeBps = requireFiniteBps(input.targetProtocolFeeBps, "targetProtocolFeeBps");
  const reserveBps = requireFiniteBps(input.reserveBps, "reserveBps");

  return {
    estimatedInventoryCostCents,
    grossMarginCents: packPriceCents - estimatedInventoryCostCents,
    packPriceCents,
    protocolFeeCents: calculateBpsCents(packPriceCents, targetProtocolFeeBps),
    reserveBps,
    reserveCents: calculateBpsCents(packPriceCents, reserveBps),
    targetProtocolFeeBps
  };
}

export function validateSinkBudget(input: SinkBudgetInput): SinkBudget {
  const craftFeeCents = requireFiniteCents(input.craftFeeCents, "craftFeeCents");
  const dustBalance = Math.max(0, Math.round(input.dustBalance));
  const dustFloor = Math.max(0, Math.round(input.dustFloor));
  const dustSpent = Math.max(0, Math.round(input.dustSpent));
  const dustRemaining = dustBalance - dustSpent;

  if (craftFeeCents <= 0) {
    return {
      allowed: false,
      craftFeeCents,
      dustRemaining,
      reason: "invalid-craft-fee"
    };
  }

  if (dustRemaining < dustFloor) {
    return {
      allowed: false,
      craftFeeCents,
      dustRemaining,
      reason: "dust-floor-breach"
    };
  }

  return {
    allowed: true,
    craftFeeCents,
    dustRemaining,
    reason: "within-sink-budget"
  };
}

export function calculateBuybackSpread(input: BuybackSpreadInput): BuybackSpread {
  const estimateCents = requireFiniteCents(input.estimateCents, "estimateCents");
  const buybackCents = requireFiniteCents(input.buybackCents, "buybackCents");
  const spreadCents = Math.max(0, estimateCents - buybackCents);

  return {
    buybackCents,
    estimateCents,
    spreadBps: estimateCents === 0 ? 0 : Math.floor((spreadCents * BASIS_POINTS) / estimateCents),
    spreadCents
  };
}

export function buildProtocolEconomySnapshot({
  activeDrop,
  marketListings,
  vaultStats
}: {
  activeDrop: EconomyDrop;
  marketListings: EconomyListing[];
  vaultStats: EconomyVaultStats;
}): ProtocolEconomySnapshot {
  const listedAskCents = marketListings.reduce(
    (total, listing) => total + requireFiniteCents(listing.askCents, "askCents"),
    0
  );
  const projectedFeeCents = marketListings.reduce(
    (total, listing) =>
      total + calculateProtocolTake({ feeBps: listing.feeBps, priceCents: listing.askCents }).protocolFeeCents,
    0
  );
  const blendedFeeBps =
    listedAskCents === 0 ? 0 : Math.round((projectedFeeCents * BASIS_POINTS) / listedAskCents);
  const estimatedInventoryCostCents =
    activeDrop.totalSupply <= 0 ? 0 : Math.ceil(vaultStats.buybackValueCents / activeDrop.totalSupply);
  const packMargin = projectDropMargin({
    estimatedInventoryCostCents,
    packPriceCents: activeDrop.packPriceCents,
    reserveBps: 1_500,
    targetProtocolFeeBps: 250
  });
  const buybackSpread = calculateBuybackSpread({
    buybackCents: vaultStats.buybackValueCents,
    estimateCents: vaultStats.marketValueCents
  });

  return {
    buybackSpread: {
      spreadBps: buybackSpread.spreadBps,
      spreadCents: buybackSpread.spreadCents,
      title: "Buyback spread"
    },
    marketFees: {
      blendedFeeBps,
      projectedFeeCents,
      title: "Marketplace take"
    },
    operatorReserve: {
      reserveCents: packMargin.reserveCents * activeDrop.remainingSupply,
      reservePercent: 15,
      title: "Operator reserve"
    },
    packMargin: {
      grossMarginCents: packMargin.grossMarginCents,
      packPriceCents: packMargin.packPriceCents,
      protocolFeeCents: packMargin.protocolFeeCents,
      title: "Drop margin"
    }
  };
}
