import {
  InventoryItemSchema,
  InventoryItemsSchema,
  InventoryNotFoundError,
  InventoryMutationForbiddenError,
  createPhotoHash,
  type InventoryActor,
  type InventoryChainEvidence,
  type InventoryItem,
  type InventoryListQuery,
  type InventoryOnchainAction,
  type InventoryOnchainOperation,
  type InventoryRepository,
  type InventoryStatus,
  type VersionedInventoryItem
} from "@gacha/inventory";

const MAXIMUM_BULK_IMPORT = 200;
const TESTNET_SINGLE_PHOTO_EXCEPTION = {
  environment: "robinhood_testnet",
  reason: "Explicit local Robinhood Chain testnet rehearsal using one sanitized custody photo."
} as const;
const ONCHAIN_MANAGED_STATUSES = new Set<InventoryStatus>([
  "tokenized",
  "user_owned",
  "listed",
  "buyback_held",
  "redemption_pending",
  "redeemed"
]);

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Inventory input must be an object");
  }
  return value as Record<string, unknown>;
};

const photoUrlsFrom = (value: unknown): string[] => {
  if (!Array.isArray(value) || value.some((url) => typeof url !== "string")) {
    throw new Error("photoUrls must be an array of URLs");
  }
  return value as string[];
};

const assertSafeInventoryPolicy = (item: InventoryItem): void => {
  const eligibilityCustody = new Set<InventoryStatus>(["verified", "vaulted", "drop_ready"]);
  if ((item.dropEligibility || item.tierPoolEligible) && !eligibilityCustody.has(item.custodyStatus)) {
    throw new InventoryMutationForbiddenError(
      "Drop and tier-pool eligibility require verified, vaulted, or drop-ready custody"
    );
  }
  if (item.grailTier === "grail" && item.tradeInEligible) {
    throw new InventoryMutationForbiddenError("Grail inventory cannot be enabled for trade-in without a separate policy review");
  }
  if (item.buybackQuoteCents > item.marketEstimateCents) {
    throw new InventoryMutationForbiddenError("Buyback quote cannot exceed the market estimate");
  }
};

type AdminInventoryTransitionOptions = {
  adminReviewed?: boolean;
  allowSingleCustodyPhotoOnTestnet?: boolean;
};

const onchainTransitionPaths: Readonly<Partial<Record<InventoryStatus, Partial<Record<InventoryStatus, InventoryStatus[]>>>>> = {
  drop_ready: {
    tokenized: ["tokenized"],
    user_owned: ["tokenized", "user_owned"]
  },
  tokenized: {
    user_owned: ["user_owned"]
  },
  user_owned: {
    listed: ["listed"],
    redemption_pending: ["redemption_pending"]
  },
  listed: {
    user_owned: ["user_owned"]
  },
  redemption_pending: {
    user_owned: ["user_owned"],
    redeemed: ["redeemed"]
  }
};

export const getOnchainReconciliationPath = (
  from: InventoryStatus,
  to: InventoryStatus
): InventoryStatus[] => {
  if (from === to) return [];
  const path = onchainTransitionPaths[from]?.[to];
  if (path === undefined) {
    throw new InventoryMutationForbiddenError(`Unsafe on-chain inventory reconciliation: ${from} -> ${to}`);
  }
  return [...path];
};

const assertTransitionReadiness = (
  item: InventoryItem,
  to: InventoryStatus,
  allowSingleCustodyPhotoOnTestnet: boolean
): boolean => {
  const hasRequiredPhotoPair = item.photoUrls.length >= 2;
  const usesSinglePhotoException = !hasRequiredPhotoPair
    && item.photoUrls.length === 1
    && allowSingleCustodyPhotoOnTestnet
    && (to === "photographed" || to === "verified");

  if (to === "photographed" && !hasRequiredPhotoPair && !usesSinglePhotoException) {
    throw new InventoryMutationForbiddenError("Front and back custody photos are required before photographed status");
  }
  if (to === "verified") {
    if ((!hasRequiredPhotoPair && !usesSinglePhotoException)
      || item.vaultLocationLabel.trim() === ""
      || item.marketEstimateCents <= 0) {
      throw new InventoryMutationForbiddenError(
        "Verification requires front and back photos, a vault location, and a positive market estimate"
      );
    }
    assertSafeInventoryPolicy(item);
  }
  if (to === "vaulted" && item.vaultLocationLabel.trim() === "") {
    throw new InventoryMutationForbiddenError("A vault location is required before vaulted status");
  }
  if (to === "drop_ready" && !item.dropEligibility) {
    throw new InventoryMutationForbiddenError("Drop eligibility must be reviewed before drop-ready status");
  }
  return usesSinglePhotoException;
};

export class AdminInventoryService {
  constructor(
    private readonly repository: InventoryRepository,
    private readonly now: () => Date = () => new Date()
  ) {}

  list(query?: InventoryListQuery): Promise<VersionedInventoryItem[]> {
    return this.repository.list(query);
  }

  count(query?: Omit<InventoryListQuery, "limit" | "offset">): Promise<number> {
    return this.repository.count(query);
  }

  get(inventoryId: string): Promise<VersionedInventoryItem | null> {
    return this.repository.get(inventoryId);
  }

  audit(inventoryId?: string, limit?: number) {
    return this.repository.listAudit({ inventoryId, limit });
  }

  async create(rawItem: unknown, actor: InventoryActor): Promise<VersionedInventoryItem> {
    const now = this.now().toISOString();
    const item = this.#prepare(rawItem, { createdAt: now, updatedAt: now }, true);
    assertSafeInventoryPolicy(item);
    return this.repository.create(item, actor);
  }

  async bulkCreate(rawItems: unknown, actor: InventoryActor): Promise<VersionedInventoryItem[]> {
    if (!Array.isArray(rawItems)) throw new Error("Bulk import items must be an array");
    if (rawItems.length < 1 || rawItems.length > MAXIMUM_BULK_IMPORT) {
      throw new Error(`Bulk imports must contain between 1 and ${MAXIMUM_BULK_IMPORT} records`);
    }
    const now = this.now().toISOString();
    const items = InventoryItemsSchema.parse(
      rawItems.map((item) => this.#prepare(item, { createdAt: now, updatedAt: now }, true))
    );
    items.forEach(assertSafeInventoryPolicy);
    return this.repository.bulkCreate(items, actor);
  }

  async update(
    inventoryId: string,
    rawItem: unknown,
    expectedRevision: number,
    actor: InventoryActor
  ): Promise<VersionedInventoryItem> {
    const existing = await this.repository.get(inventoryId);
    if (existing === null) throw new InventoryNotFoundError(inventoryId);
    const input = asObject(rawItem);
    if (input.inventoryId !== inventoryId) throw new Error("inventoryId cannot be changed");
    if (input.custodyStatus !== existing.item.custodyStatus) {
      throw new InventoryMutationForbiddenError("custodyStatus can only change through a lifecycle transition");
    }
    if (ONCHAIN_MANAGED_STATUSES.has(existing.item.custodyStatus)) {
      throw new InventoryMutationForbiddenError(
        "Indexed on-chain inventory is read-only in the admin API; reconcile changes from contract events"
      );
    }
    const item = this.#prepare(input, {
      createdAt: existing.item.createdAt,
      updatedAt: this.now().toISOString()
    });
    assertSafeInventoryPolicy(item);
    return this.repository.update(item, expectedRevision, actor);
  }

  async transition(
    inventoryId: string,
    to: InventoryStatus,
    expectedRevision: number,
    actor: InventoryActor,
    options: AdminInventoryTransitionOptions = {}
  ): Promise<VersionedInventoryItem> {
    const existing = await this.repository.get(inventoryId);
    if (existing === null) throw new InventoryNotFoundError(inventoryId);
    if (ONCHAIN_MANAGED_STATUSES.has(existing.item.custodyStatus) || ONCHAIN_MANAGED_STATUSES.has(to)) {
      throw new InventoryMutationForbiddenError(
        "On-chain custody states cannot be set manually; they must be reconciled from indexed contract events"
      );
    }
    const usesSinglePhotoException = assertTransitionReadiness(
      existing.item,
      to,
      options.allowSingleCustodyPhotoOnTestnet === true
    );
    assertSafeInventoryPolicy({ ...existing.item, custodyStatus: to });
    return this.repository.transition(inventoryId, to, expectedRevision, actor, {
      adminReviewed: options.adminReviewed,
      ...(usesSinglePhotoException ? { custodyPhotoException: TESTNET_SINGLE_PHOTO_EXCEPTION } : {})
    });
  }

  async reconcileOnchainStatus(
    inventoryId: string,
    target: InventoryStatus,
    actor: InventoryActor,
    chainEvidence: InventoryChainEvidence
  ): Promise<VersionedInventoryItem> {
    let record = await this.repository.get(inventoryId);
    if (record === null) throw new InventoryNotFoundError(inventoryId);

    const path = getOnchainReconciliationPath(record.item.custodyStatus, target);
    for (const nextStatus of path) {
      record = await this.repository.transition(
        inventoryId,
        nextStatus,
        record.revision,
        actor,
        { adminReviewed: true, chainEvidence }
      );
    }
    if (
      !["verified", "vaulted", "drop_ready"].includes(record.item.custodyStatus)
      && (record.item.dropEligibility || record.item.tierPoolEligible)
    ) {
      const normalizedItem = {
        ...record.item,
        dropEligibility: false,
        tierPoolEligible: false,
        updatedAt: this.now().toISOString()
      };
      assertSafeInventoryPolicy(normalizedItem);
      record = await this.repository.update(normalizedItem, record.revision, actor, {
        chainEvidence,
        reconciliation: "onchain_custody_normalization"
      });
    }
    return record;
  }

  queueOnchainOperation(
    inventoryId: string,
    action: InventoryOnchainAction,
    expectedRevision: number,
    actor: InventoryActor,
    multisigAddress: string
  ): Promise<InventoryOnchainOperation> {
    return this.repository.queueOnchainOperation(inventoryId, action, expectedRevision, actor, multisigAddress);
  }

  listOnchainOperations(inventoryId?: string, limit?: number): Promise<InventoryOnchainOperation[]> {
    return this.repository.listOnchainOperations(inventoryId, limit);
  }

  delete(inventoryId: string, expectedRevision: number, actor: InventoryActor): Promise<void> {
    return this.repository.delete(inventoryId, expectedRevision, actor);
  }

  #prepare(
    rawItem: unknown,
    timestamps: { createdAt: string; updatedAt: string },
    forceDraft = false
  ): InventoryItem {
    const input = asObject(rawItem);
    const photoUrls = photoUrlsFrom(input.photoUrls);
    return InventoryItemSchema.parse({
      ...input,
      createdAt: timestamps.createdAt,
      ...(forceDraft
        ? { custodyStatus: "draft", dropEligibility: false, tierPoolEligible: false, tradeInEligible: false }
        : {}),
      photoHash: createPhotoHash(photoUrls),
      updatedAt: timestamps.updatedAt
    });
  }
}
