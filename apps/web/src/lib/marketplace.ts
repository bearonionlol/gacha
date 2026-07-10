const BASIS_POINTS = 10_000;

export type MarketplaceListingInput = {
  askCents: number;
  buybackCents: number;
  cardId: string;
  escrowDisclosure?: string;
  feeBps: number;
  forgeSetKey?: string;
  forgeTier?: number;
  grailTier?: string;
  id: string;
  seller: string;
  title: string;
  tradeInEligible?: boolean;
};

export type SellerProceeds = {
  askCents: number;
  feeBps: number;
  protocolFeeCents: number;
  sellerReceivesCents: number;
};

export type ListingRisk = {
  message: "Below floor" | "Fair value" | "Well above floor";
  severity: "high" | "low" | "medium";
};

export type MarketSortMode = "best-value" | "highest-ask" | "lowest-ask";

export type EnrichedMarketListing = MarketplaceListingInput &
  SellerProceeds & {
    buybackDeltaCents: number;
    floorCents: number;
    floorDeltaCents: number;
    risk: ListingRisk;
  };

function normalizeCents(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function normalizeBps(value: number): number {
  return Number.isFinite(value) ? Math.min(BASIS_POINTS, Math.max(0, Math.round(value))) : 0;
}

export function calculateSellerProceeds({
  askCents,
  feeBps
}: {
  askCents: number;
  feeBps: number;
}): SellerProceeds {
  const normalizedAskCents = normalizeCents(askCents);
  const normalizedFeeBps = normalizeBps(feeBps);
  const protocolFeeCents = Math.ceil((normalizedAskCents * normalizedFeeBps) / BASIS_POINTS);

  return {
    askCents: normalizedAskCents,
    feeBps: normalizedFeeBps,
    protocolFeeCents,
    sellerReceivesCents: Math.max(0, normalizedAskCents - protocolFeeCents)
  };
}

export function flagListingRisk({ askCents, floorCents }: { askCents: number; floorCents: number }): ListingRisk {
  const ask = normalizeCents(askCents);
  const floor = normalizeCents(floorCents);

  if (floor > 0 && ask < floor) {
    return {
      message: "Below floor",
      severity: "low"
    };
  }

  if (floor > 0 && ask >= floor * 2) {
    return {
      message: "Well above floor",
      severity: "high"
    };
  }

  if (floor > 0 && ask > Math.ceil(floor * 1.25)) {
    return {
      message: "Well above floor",
      severity: "medium"
    };
  }

  return {
    message: "Fair value",
    severity: "low"
  };
}

export function sortListings<TListing extends MarketplaceListingInput>(
  listings: TListing[],
  mode: MarketSortMode
): TListing[] {
  return [...listings].sort((first, second) => {
    if (mode === "highest-ask") {
      return second.askCents - first.askCents;
    }

    if (mode === "lowest-ask") {
      return first.askCents - second.askCents;
    }

    const firstValueSpread = first.askCents - first.buybackCents;
    const secondValueSpread = second.askCents - second.buybackCents;

    return firstValueSpread - secondValueSpread || first.askCents - second.askCents;
  });
}

export function enrichMarketListings(listings: MarketplaceListingInput[]): EnrichedMarketListing[] {
  const floorCents = listings.reduce(
    (floor, listing) => Math.min(floor, normalizeCents(listing.askCents)),
    Number.POSITIVE_INFINITY
  );
  const normalizedFloorCents = Number.isFinite(floorCents) ? floorCents : 0;

  return sortListings(listings, "best-value").map((listing) => {
    const sellerProceeds = calculateSellerProceeds(listing);
    const askCents = normalizeCents(listing.askCents);

    return {
      ...listing,
      ...sellerProceeds,
      buybackDeltaCents: askCents - normalizeCents(listing.buybackCents),
      floorCents: normalizedFloorCents,
      floorDeltaCents: askCents - normalizedFloorCents,
      risk: flagListingRisk({ askCents, floorCents: normalizedFloorCents })
    };
  });
}
