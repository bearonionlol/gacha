import { randomUUID } from "node:crypto";

import { InventoryItemSchema, InventoryItemsSchema, type InventoryItem, type InventoryStatus } from "./schema";
import { transitionInventoryItem } from "./lifecycle";

export type InventoryActor = {
  requestId: string;
  role: string;
  walletAddress: string;
};

export type VersionedInventoryItem = {
  item: InventoryItem;
  revision: number;
};

export type InventoryAuditAction =
  | "inventory.created"
  | "inventory.updated"
  | "inventory.transitioned"
  | "inventory.deleted"
  | "inventory.onchain_queued";

export type InventoryOnchainAction = "anchor_metadata" | "publish_drop";

export type InventoryOnchainOperation = {
  action: InventoryOnchainAction;
  actor: InventoryActor;
  createdAt: string;
  expectedRevision: number;
  inventoryId: string;
  multisigAddress: string;
  operationId: string;
  status: "queued";
};

export type InventoryAuditEvent = {
  action: InventoryAuditAction;
  actor: InventoryActor;
  eventId: string;
  inventoryId: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
  revision: number;
};

export type InventoryCustodyPhotoException = {
  environment: "robinhood_testnet";
  reason: string;
};

export type InventoryRepositoryTransitionOptions = {
  adminReviewed?: boolean;
  custodyPhotoException?: InventoryCustodyPhotoException;
};

export type InventoryListQuery = {
  brand?: InventoryItem["brand"];
  limit?: number;
  offset?: number;
  search?: string;
  status?: InventoryStatus;
};

export type InventoryAuditQuery = {
  inventoryId?: string;
  limit?: number;
};

export interface InventoryRepository {
  bulkCreate(items: readonly InventoryItem[], actor: InventoryActor): Promise<VersionedInventoryItem[]>;
  create(item: InventoryItem, actor: InventoryActor): Promise<VersionedInventoryItem>;
  count(query?: Omit<InventoryListQuery, "limit" | "offset">): Promise<number>;
  delete(inventoryId: string, expectedRevision: number, actor: InventoryActor): Promise<void>;
  get(inventoryId: string): Promise<VersionedInventoryItem | null>;
  list(query?: InventoryListQuery): Promise<VersionedInventoryItem[]>;
  listAudit(query?: InventoryAuditQuery): Promise<InventoryAuditEvent[]>;
  listOnchainOperations(inventoryId?: string, limit?: number): Promise<InventoryOnchainOperation[]>;
  queueOnchainOperation(
    inventoryId: string,
    action: InventoryOnchainAction,
    expectedRevision: number,
    actor: InventoryActor,
    multisigAddress: string
  ): Promise<InventoryOnchainOperation>;
  transition(
    inventoryId: string,
    to: InventoryStatus,
    expectedRevision: number,
    actor: InventoryActor,
    options?: InventoryRepositoryTransitionOptions
  ): Promise<VersionedInventoryItem>;
  update(item: InventoryItem, expectedRevision: number, actor: InventoryActor): Promise<VersionedInventoryItem>;
}

export class InventoryNotFoundError extends Error {
  constructor(inventoryId: string) {
    super(`Inventory item not found: ${inventoryId}`);
    this.name = "InventoryNotFoundError";
  }
}

export class InventoryConflictError extends Error {
  readonly currentRevision: number | null;

  constructor(message: string, currentRevision: number | null = null) {
    super(message);
    this.name = "InventoryConflictError";
    this.currentRevision = currentRevision;
  }
}

export class InventoryMutationForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryMutationForbiddenError";
  }
}

export const assertExpectedRevision = (expectedRevision: number): void => {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new InventoryConflictError("expectedRevision must be a positive integer");
  }
};

export const normalizeInventoryListLimit = (limit = 100): number => {
  if (!Number.isSafeInteger(limit) || limit < 1) return 100;
  return Math.min(limit, 200);
};

export const normalizeInventoryListOffset = (offset = 0): number => {
  if (!Number.isSafeInteger(offset) || offset < 0) return 0;
  return Math.min(offset, 1_000_000);
};

export const normalizeInventoryAuditLimit = (limit = 100): number => {
  if (!Number.isSafeInteger(limit) || limit < 1) return 100;
  return Math.min(limit, 500);
};

const cloneItem = (item: InventoryItem): InventoryItem => structuredClone(item);

const cloneRecord = (record: VersionedInventoryItem): VersionedInventoryItem => ({
  item: cloneItem(record.item),
  revision: record.revision
});

const cloneAuditEvent = (event: InventoryAuditEvent): InventoryAuditEvent => structuredClone(event);

export class InMemoryInventoryRepository implements InventoryRepository {
  readonly #auditEvents: InventoryAuditEvent[] = [];
  readonly #onchainOperations: InventoryOnchainOperation[] = [];
  readonly #records = new Map<string, VersionedInventoryItem>();

  constructor(seed: readonly InventoryItem[] = []) {
    for (const item of InventoryItemsSchema.parse(seed)) {
      this.#records.set(item.inventoryId, { item: cloneItem(item), revision: 1 });
    }
  }

  async list(query: InventoryListQuery = {}): Promise<VersionedInventoryItem[]> {
    const search = query.search?.trim().toLocaleLowerCase() ?? "";
    return [...this.#records.values()]
      .filter(({ item }) => {
        if (query.brand !== undefined && item.brand !== query.brand) return false;
        if (query.status !== undefined && item.custodyStatus !== query.status) return false;
        if (search === "") return true;
        return [item.inventoryId, item.cardName, item.setName, item.cardNumber, item.certNumber ?? ""]
          .some((value) => value.toLocaleLowerCase().includes(search));
      })
      .sort((left, right) => right.item.updatedAt.localeCompare(left.item.updatedAt) || left.item.inventoryId.localeCompare(right.item.inventoryId))
      .slice(
        normalizeInventoryListOffset(query.offset),
        normalizeInventoryListOffset(query.offset) + normalizeInventoryListLimit(query.limit)
      )
      .map(cloneRecord);
  }

  async count(query: Omit<InventoryListQuery, "limit" | "offset"> = {}): Promise<number> {
    return (await this.list({ ...query, limit: 200, offset: 0 })).length === 200
      ? [...this.#records.values()].filter(({ item }) => {
          const search = query.search?.trim().toLocaleLowerCase() ?? "";
          if (query.brand !== undefined && item.brand !== query.brand) return false;
          if (query.status !== undefined && item.custodyStatus !== query.status) return false;
          return search === "" || [item.inventoryId, item.cardName, item.setName, item.cardNumber, item.certNumber ?? ""]
            .some((value) => value.toLocaleLowerCase().includes(search));
        }).length
      : (await this.list({ ...query, limit: 200, offset: 0 })).length;
  }

  async get(inventoryId: string): Promise<VersionedInventoryItem | null> {
    const record = this.#records.get(inventoryId);
    return record === undefined ? null : cloneRecord(record);
  }

  async create(item: InventoryItem, actor: InventoryActor): Promise<VersionedInventoryItem> {
    const parsed = InventoryItemSchema.parse(item);
    if (this.#records.has(parsed.inventoryId)) {
      throw new InventoryConflictError(`Inventory item already exists: ${parsed.inventoryId}`, this.#records.get(parsed.inventoryId)?.revision ?? null);
    }

    const record = { item: cloneItem(parsed), revision: 1 };
    this.#records.set(parsed.inventoryId, record);
    this.#appendAudit("inventory.created", record, actor, {});
    return cloneRecord(record);
  }

  async bulkCreate(items: readonly InventoryItem[], actor: InventoryActor): Promise<VersionedInventoryItem[]> {
    const parsed = InventoryItemsSchema.parse(items);
    const conflict = parsed.find((item) => this.#records.has(item.inventoryId));
    if (conflict !== undefined) {
      throw new InventoryConflictError(`Inventory item already exists: ${conflict.inventoryId}`, this.#records.get(conflict.inventoryId)?.revision ?? null);
    }

    const created = parsed.map((item) => {
      const record = { item: cloneItem(item), revision: 1 };
      this.#records.set(item.inventoryId, record);
      this.#appendAudit("inventory.created", record, actor, { bulk: true, bulkCount: parsed.length });
      return cloneRecord(record);
    });
    return created;
  }

  async update(item: InventoryItem, expectedRevision: number, actor: InventoryActor): Promise<VersionedInventoryItem> {
    assertExpectedRevision(expectedRevision);
    const parsed = InventoryItemSchema.parse(item);
    const existing = this.#requireRecord(parsed.inventoryId);
    this.#assertRevision(existing, expectedRevision);

    const record = { item: cloneItem(parsed), revision: existing.revision + 1 };
    this.#records.set(parsed.inventoryId, record);
    this.#appendAudit("inventory.updated", record, actor, { previousRevision: existing.revision });
    return cloneRecord(record);
  }

  async transition(
    inventoryId: string,
    to: InventoryStatus,
    expectedRevision: number,
    actor: InventoryActor,
    options: InventoryRepositoryTransitionOptions = {}
  ): Promise<VersionedInventoryItem> {
    assertExpectedRevision(expectedRevision);
    const existing = this.#requireRecord(inventoryId);
    this.#assertRevision(existing, expectedRevision);
    const nextItem = InventoryItemSchema.parse(
      transitionInventoryItem(existing.item, to, { adminReviewed: options.adminReviewed, updatedAt: new Date().toISOString() })
    );
    const record = { item: nextItem, revision: existing.revision + 1 };
    this.#records.set(inventoryId, record);
    this.#appendAudit("inventory.transitioned", record, actor, {
      from: existing.item.custodyStatus,
      previousRevision: existing.revision,
      to,
      ...(options.custodyPhotoException === undefined
        ? {}
        : { custodyPhotoException: options.custodyPhotoException })
    });
    return cloneRecord(record);
  }

  async delete(inventoryId: string, expectedRevision: number, actor: InventoryActor): Promise<void> {
    assertExpectedRevision(expectedRevision);
    const existing = this.#requireRecord(inventoryId);
    this.#assertRevision(existing, expectedRevision);
    if (existing.item.custodyStatus !== "draft") {
      throw new InventoryMutationForbiddenError("Only draft inventory records can be deleted");
    }
    this.#records.delete(inventoryId);
    this.#appendAudit("inventory.deleted", existing, actor, { deletedRevision: existing.revision });
  }

  async listAudit(query: InventoryAuditQuery = {}): Promise<InventoryAuditEvent[]> {
    return this.#auditEvents
      .filter((event) => query.inventoryId === undefined || event.inventoryId === query.inventoryId)
      .slice()
      .reverse()
      .slice(0, normalizeInventoryAuditLimit(query.limit))
      .map(cloneAuditEvent);
  }

  async queueOnchainOperation(
    inventoryId: string,
    action: InventoryOnchainAction,
    expectedRevision: number,
    actor: InventoryActor,
    multisigAddress: string
  ): Promise<InventoryOnchainOperation> {
    assertExpectedRevision(expectedRevision);
    const record = this.#requireRecord(inventoryId);
    this.#assertRevision(record, expectedRevision);
    assertOnchainQueueEligibility(record.item, action);
    const existing = this.#onchainOperations.find((operation) =>
      operation.inventoryId === inventoryId
      && operation.action === action
      && operation.expectedRevision === expectedRevision
    );
    if (existing !== undefined) return structuredClone(existing);
    const operation: InventoryOnchainOperation = {
      action,
      actor: structuredClone(actor),
      createdAt: new Date().toISOString(),
      expectedRevision,
      inventoryId,
      multisigAddress,
      operationId: randomUUID(),
      status: "queued"
    };
    this.#onchainOperations.push(operation);
    this.#appendAudit("inventory.onchain_queued", record, actor, {
      action,
      multisigAddress,
      operationId: operation.operationId
    });
    return structuredClone(operation);
  }

  async listOnchainOperations(inventoryId?: string, limit = 100): Promise<InventoryOnchainOperation[]> {
    return this.#onchainOperations
      .filter((operation) => inventoryId === undefined || operation.inventoryId === inventoryId)
      .slice()
      .reverse()
      .slice(0, normalizeInventoryAuditLimit(limit))
      .map((operation) => structuredClone(operation));
  }

  #appendAudit(
    action: InventoryAuditAction,
    record: VersionedInventoryItem,
    actor: InventoryActor,
    metadata: Record<string, unknown>
  ): void {
    this.#auditEvents.push({
      action,
      actor: structuredClone(actor),
      eventId: randomUUID(),
      inventoryId: record.item.inventoryId,
      metadata: structuredClone(metadata),
      occurredAt: new Date().toISOString(),
      revision: record.revision
    });
  }

  #requireRecord(inventoryId: string): VersionedInventoryItem {
    const record = this.#records.get(inventoryId);
    if (record === undefined) throw new InventoryNotFoundError(inventoryId);
    return record;
  }

  #assertRevision(record: VersionedInventoryItem, expectedRevision: number): void {
    if (record.revision !== expectedRevision) {
      throw new InventoryConflictError(
        `Inventory revision conflict: expected ${expectedRevision}, current ${record.revision}`,
        record.revision
      );
    }
  }
}

export const assertOnchainQueueEligibility = (item: InventoryItem, action: InventoryOnchainAction): void => {
  if (action === "anchor_metadata") {
    if (!["verified", "vaulted", "drop_ready"].includes(item.custodyStatus)) {
      throw new InventoryMutationForbiddenError("Metadata anchoring requires verified, vaulted, or drop-ready custody");
    }
    return;
  }
  if (item.custodyStatus !== "drop_ready" || !item.dropEligibility) {
    throw new InventoryMutationForbiddenError("Drop publication requires a drop-ready and eligible inventory record");
  }
};
