import { randomUUID } from "node:crypto";

import { transitionInventoryItem } from "./lifecycle";
import {
  InventoryConflictError,
  InventoryMutationForbiddenError,
  InventoryNotFoundError,
  assertExpectedRevision,
  normalizeInventoryAuditLimit,
  normalizeInventoryListLimit,
  normalizeInventoryListOffset,
  type InventoryActor,
  type InventoryAuditAction,
  type InventoryAuditEvent,
  type InventoryAuditQuery,
  type InventoryListQuery,
  type InventoryOnchainAction,
  type InventoryOnchainOperation,
  type InventoryRepository,
  type InventoryRepositoryTransitionOptions,
  type VersionedInventoryItem,
  assertOnchainQueueEligibility
} from "./repository";
import { InventoryItemSchema, InventoryItemsSchema, type InventoryItem, type InventoryStatus } from "./schema";

export type PostgresQueryResult<Row extends Record<string, unknown>> = {
  rowCount: number | null;
  rows: Row[];
};

export interface PostgresQueryable {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>>;
}

export interface PostgresTransactionClient extends PostgresQueryable {
  release(): void;
}

export interface PostgresPoolLike extends PostgresQueryable {
  connect(): Promise<PostgresTransactionClient>;
}

type InventoryRow = {
  inventory_id: string;
  payload: unknown;
  revision: string | number;
};

type AuditRow = {
  action: InventoryAuditAction;
  actor_request_id: string;
  actor_role: string;
  actor_wallet_address: string;
  event_id: string;
  inventory_id: string;
  metadata: unknown;
  occurred_at: Date | string;
  revision: string | number;
};

type OnchainOperationRow = {
  action: InventoryOnchainAction;
  actor_request_id: string;
  actor_role: string;
  actor_wallet_address: string;
  created_at: Date | string;
  expected_revision: string | number;
  inventory_id: string;
  multisig_address: string;
  operation_id: string;
  status: "queued";
};

const isUniqueViolation = (error: unknown): boolean => {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
};

const parseRevision = (revision: string | number): number => {
  const parsed = typeof revision === "number" ? revision : Number(revision);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error("Database returned an invalid inventory revision");
  return parsed;
};

const mapInventoryRow = (row: InventoryRow): VersionedInventoryItem => ({
  item: InventoryItemSchema.parse(row.payload),
  revision: parseRevision(row.revision)
});

const mapAuditRow = (row: AuditRow): InventoryAuditEvent => ({
  action: row.action,
  actor: {
    requestId: row.actor_request_id,
    role: row.actor_role,
    walletAddress: row.actor_wallet_address
  },
  eventId: row.event_id,
  inventoryId: row.inventory_id,
  metadata:
    typeof row.metadata === "object" && row.metadata !== null && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {},
  occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : new Date(row.occurred_at).toISOString(),
  revision: parseRevision(row.revision)
});

const mapOnchainOperationRow = (row: OnchainOperationRow): InventoryOnchainOperation => ({
  action: row.action,
  actor: {
    requestId: row.actor_request_id,
    role: row.actor_role,
    walletAddress: row.actor_wallet_address
  },
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  expectedRevision: parseRevision(row.expected_revision),
  inventoryId: row.inventory_id,
  multisigAddress: row.multisig_address,
  operationId: row.operation_id,
  status: row.status
});

export class PostgresInventoryRepository implements InventoryRepository {
  constructor(private readonly pool: PostgresPoolLike) {}

  async list(query: InventoryListQuery = {}): Promise<VersionedInventoryItem[]> {
    const result = await this.pool.query<InventoryRow>(
      `SELECT inventory_id, payload, revision
         FROM inventory_items
        WHERE ($1::text IS NULL OR payload->>'brand' = $1)
          AND ($2::text IS NULL OR payload->>'custodyStatus' = $2)
          AND ($3::text IS NULL OR (
            inventory_id ILIKE '%' || $3 || '%'
            OR payload->>'cardName' ILIKE '%' || $3 || '%'
            OR payload->>'setName' ILIKE '%' || $3 || '%'
            OR payload->>'cardNumber' ILIKE '%' || $3 || '%'
            OR COALESCE(payload->>'certNumber', '') ILIKE '%' || $3 || '%'
          ))
        ORDER BY updated_at DESC, inventory_id ASC
        LIMIT $4 OFFSET $5`,
      [
        query.brand ?? null,
        query.status ?? null,
        query.search?.trim() || null,
        normalizeInventoryListLimit(query.limit),
        normalizeInventoryListOffset(query.offset)
      ]
    );
    return result.rows.map(mapInventoryRow);
  }

  async count(query: Omit<InventoryListQuery, "limit" | "offset"> = {}): Promise<number> {
    const result = await this.pool.query<{ total: string | number }>(
      `SELECT COUNT(*) AS total
         FROM inventory_items
        WHERE ($1::text IS NULL OR payload->>'brand' = $1)
          AND ($2::text IS NULL OR payload->>'custodyStatus' = $2)
          AND ($3::text IS NULL OR (
            inventory_id ILIKE '%' || $3 || '%'
            OR payload->>'cardName' ILIKE '%' || $3 || '%'
            OR payload->>'setName' ILIKE '%' || $3 || '%'
            OR payload->>'cardNumber' ILIKE '%' || $3 || '%'
            OR COALESCE(payload->>'certNumber', '') ILIKE '%' || $3 || '%'
          ))`,
      [query.brand ?? null, query.status ?? null, query.search?.trim() || null]
    );
    const total = Number(result.rows[0]?.total ?? 0);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("Database returned an invalid inventory count");
    return total;
  }

  async get(inventoryId: string): Promise<VersionedInventoryItem | null> {
    const result = await this.pool.query<InventoryRow>(
      "SELECT inventory_id, payload, revision FROM inventory_items WHERE inventory_id = $1",
      [inventoryId]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapInventoryRow(row);
  }

  async create(item: InventoryItem, actor: InventoryActor): Promise<VersionedInventoryItem> {
    const parsed = InventoryItemSchema.parse(item);
    return this.#transaction(async (client) => this.#insert(client, parsed, actor, {}));
  }

  async bulkCreate(items: readonly InventoryItem[], actor: InventoryActor): Promise<VersionedInventoryItem[]> {
    const parsed = InventoryItemsSchema.parse(items);
    return this.#transaction(async (client) => {
      const created: VersionedInventoryItem[] = [];
      for (const item of parsed) {
        created.push(await this.#insert(client, item, actor, { bulk: true, bulkCount: parsed.length }));
      }
      return created;
    });
  }

  async update(item: InventoryItem, expectedRevision: number, actor: InventoryActor): Promise<VersionedInventoryItem> {
    assertExpectedRevision(expectedRevision);
    const parsed = InventoryItemSchema.parse(item);
    return this.#transaction(async (client) => {
      const existing = await this.#getForUpdate(client, parsed.inventoryId);
      this.#assertRevision(existing, expectedRevision);
      const nextRevision = existing.revision + 1;
      const result = await client.query<InventoryRow>(
        `UPDATE inventory_items
            SET payload = $1::jsonb, revision = $2, updated_at = $3::timestamptz
          WHERE inventory_id = $4 AND revision = $5
          RETURNING inventory_id, payload, revision`,
        [JSON.stringify(parsed), nextRevision, parsed.updatedAt, parsed.inventoryId, expectedRevision]
      );
      const row = result.rows[0];
      if (row === undefined) throw new InventoryConflictError("Inventory changed during update", existing.revision);
      const record = mapInventoryRow(row);
      await this.#appendAudit(client, "inventory.updated", record, actor, { previousRevision: existing.revision });
      return record;
    });
  }

  async transition(
    inventoryId: string,
    to: InventoryStatus,
    expectedRevision: number,
    actor: InventoryActor,
    options: InventoryRepositoryTransitionOptions = {}
  ): Promise<VersionedInventoryItem> {
    assertExpectedRevision(expectedRevision);
    return this.#transaction(async (client) => {
      const existing = await this.#getForUpdate(client, inventoryId);
      this.#assertRevision(existing, expectedRevision);
      const nextItem = InventoryItemSchema.parse(
        transitionInventoryItem(existing.item, to, {
          adminReviewed: options.adminReviewed,
          updatedAt: new Date().toISOString()
        })
      );
      const record = await this.#updateLocked(client, nextItem, existing.revision);
      await this.#appendAudit(client, "inventory.transitioned", record, actor, {
        from: existing.item.custodyStatus,
        previousRevision: existing.revision,
        to,
        ...(options.custodyPhotoException === undefined
          ? {}
          : { custodyPhotoException: options.custodyPhotoException })
      });
      return record;
    });
  }

  async delete(inventoryId: string, expectedRevision: number, actor: InventoryActor): Promise<void> {
    assertExpectedRevision(expectedRevision);
    await this.#transaction(async (client) => {
      const existing = await this.#getForUpdate(client, inventoryId);
      this.#assertRevision(existing, expectedRevision);
      if (existing.item.custodyStatus !== "draft") {
        throw new InventoryMutationForbiddenError("Only draft inventory records can be deleted");
      }
      const deleted = await client.query<InventoryRow>(
        "DELETE FROM inventory_items WHERE inventory_id = $1 AND revision = $2 RETURNING inventory_id, payload, revision",
        [inventoryId, expectedRevision]
      );
      if (deleted.rows[0] === undefined) throw new InventoryConflictError("Inventory changed during delete", existing.revision);
      await this.#appendAudit(client, "inventory.deleted", existing, actor, { deletedRevision: existing.revision });
    });
  }

  async listAudit(query: InventoryAuditQuery = {}): Promise<InventoryAuditEvent[]> {
    const result = await this.pool.query<AuditRow>(
      `SELECT event_id, inventory_id, action, revision, actor_wallet_address, actor_role,
              actor_request_id, occurred_at, metadata
         FROM inventory_audit_events
        WHERE ($1::text IS NULL OR inventory_id = $1)
        ORDER BY occurred_at DESC, event_id DESC
        LIMIT $2`,
      [query.inventoryId ?? null, normalizeInventoryAuditLimit(query.limit)]
    );
    return result.rows.map(mapAuditRow);
  }

  async queueOnchainOperation(
    inventoryId: string,
    action: InventoryOnchainAction,
    expectedRevision: number,
    actor: InventoryActor,
    multisigAddress: string
  ): Promise<InventoryOnchainOperation> {
    assertExpectedRevision(expectedRevision);
    return this.#transaction(async (client) => {
      const record = await this.#getForUpdate(client, inventoryId);
      this.#assertRevision(record, expectedRevision);
      assertOnchainQueueEligibility(record.item, action);
      const operationId = randomUUID();
      const result = await client.query<OnchainOperationRow>(
        `INSERT INTO inventory_onchain_operations (
           operation_id, inventory_id, action, expected_revision, status, multisig_address,
           actor_wallet_address, actor_role, actor_request_id, created_at
         ) VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, NOW())
         ON CONFLICT (inventory_id, action, expected_revision) DO NOTHING
         RETURNING operation_id, inventory_id, action, expected_revision, status, multisig_address,
                   actor_wallet_address, actor_role, actor_request_id, created_at`,
        [
          operationId,
          inventoryId,
          action,
          expectedRevision,
          multisigAddress,
          actor.walletAddress,
          actor.role,
          actor.requestId
        ]
      );
      let row = result.rows[0];
      if (row === undefined) {
        const existing = await client.query<OnchainOperationRow>(
          `SELECT operation_id, inventory_id, action, expected_revision, status, multisig_address,
                  actor_wallet_address, actor_role, actor_request_id, created_at
             FROM inventory_onchain_operations
            WHERE inventory_id = $1 AND action = $2 AND expected_revision = $3`,
          [inventoryId, action, expectedRevision]
        );
        row = existing.rows[0];
        if (row === undefined) throw new Error("Idempotent on-chain operation lookup returned no row");
        return mapOnchainOperationRow(row);
      }
      const operation = mapOnchainOperationRow(row);
      await this.#appendAudit(client, "inventory.onchain_queued", record, actor, {
        action,
        multisigAddress,
        operationId
      });
      return operation;
    });
  }

  async listOnchainOperations(inventoryId?: string, limit = 100): Promise<InventoryOnchainOperation[]> {
    const result = await this.pool.query<OnchainOperationRow>(
      `SELECT operation_id, inventory_id, action, expected_revision, status, multisig_address,
              actor_wallet_address, actor_role, actor_request_id, created_at
         FROM inventory_onchain_operations
        WHERE ($1::text IS NULL OR inventory_id = $1)
        ORDER BY created_at DESC, operation_id DESC
        LIMIT $2`,
      [inventoryId ?? null, normalizeInventoryAuditLimit(limit)]
    );
    return result.rows.map(mapOnchainOperationRow);
  }

  async #insert(
    client: PostgresQueryable,
    item: InventoryItem,
    actor: InventoryActor,
    metadata: Record<string, unknown>
  ): Promise<VersionedInventoryItem> {
    try {
      const result = await client.query<InventoryRow>(
        `INSERT INTO inventory_items (inventory_id, payload, revision, created_at, updated_at)
         VALUES ($1, $2::jsonb, 1, $3::timestamptz, $4::timestamptz)
         RETURNING inventory_id, payload, revision`,
        [item.inventoryId, JSON.stringify(item), item.createdAt, item.updatedAt]
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("Inventory insert returned no row");
      const record = mapInventoryRow(row);
      await this.#appendAudit(client, "inventory.created", record, actor, metadata);
      return record;
    } catch (error) {
      if (isUniqueViolation(error)) throw new InventoryConflictError(`Inventory item already exists: ${item.inventoryId}`);
      throw error;
    }
  }

  async #getForUpdate(client: PostgresQueryable, inventoryId: string): Promise<VersionedInventoryItem> {
    const result = await client.query<InventoryRow>(
      "SELECT inventory_id, payload, revision FROM inventory_items WHERE inventory_id = $1 FOR UPDATE",
      [inventoryId]
    );
    const row = result.rows[0];
    if (row === undefined) throw new InventoryNotFoundError(inventoryId);
    return mapInventoryRow(row);
  }

  async #updateLocked(
    client: PostgresQueryable,
    item: InventoryItem,
    currentRevision: number
  ): Promise<VersionedInventoryItem> {
    const nextRevision = currentRevision + 1;
    const result = await client.query<InventoryRow>(
      `UPDATE inventory_items
          SET payload = $1::jsonb, revision = $2, updated_at = $3::timestamptz
        WHERE inventory_id = $4 AND revision = $5
        RETURNING inventory_id, payload, revision`,
      [JSON.stringify(item), nextRevision, item.updatedAt, item.inventoryId, currentRevision]
    );
    const row = result.rows[0];
    if (row === undefined) throw new InventoryConflictError("Inventory changed during update", currentRevision);
    return mapInventoryRow(row);
  }

  async #appendAudit(
    client: PostgresQueryable,
    action: InventoryAuditAction,
    record: VersionedInventoryItem,
    actor: InventoryActor,
    metadata: Record<string, unknown>
  ): Promise<void> {
    await client.query(
      `INSERT INTO inventory_audit_events (
         event_id, inventory_id, action, revision, actor_wallet_address, actor_role,
         actor_request_id, occurred_at, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8::jsonb)`,
      [
        randomUUID(),
        record.item.inventoryId,
        action,
        record.revision,
        actor.walletAddress,
        actor.role,
        actor.requestId,
        JSON.stringify(metadata)
      ]
    );
  }

  #assertRevision(record: VersionedInventoryItem, expectedRevision: number): void {
    if (record.revision !== expectedRevision) {
      throw new InventoryConflictError(
        `Inventory revision conflict: expected ${expectedRevision}, current ${record.revision}`,
        record.revision
      );
    }
  }

  async #transaction<T>(operation: (client: PostgresTransactionClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
