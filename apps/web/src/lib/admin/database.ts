import "server-only";

import type {
  PostgresPoolLike,
  PostgresQueryResult,
  PostgresTransactionClient
} from "@gacha/inventory";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

import type { AdminRuntimeConfig } from "./types";

class PgTransactionAdapter implements PostgresTransactionClient {
  constructor(private readonly client: PoolClient) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<PostgresQueryResult<Row>> {
    const result = await this.client.query<Row & QueryResultRow>(text, [...values]);
    return { rowCount: result.rowCount, rows: result.rows };
  }

  release(): void {
    this.client.release();
  }
}

class PgPoolAdapter implements PostgresPoolLike {
  constructor(private readonly pool: Pool) {}

  async query<Row extends Record<string, unknown>>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<PostgresQueryResult<Row>> {
    const result = await this.pool.query<Row & QueryResultRow>(text, [...values]);
    return { rowCount: result.rowCount, rows: result.rows };
  }

  async connect(): Promise<PostgresTransactionClient> {
    return new PgTransactionAdapter(await this.pool.connect());
  }
}

const globalPools = globalThis as typeof globalThis & { __gachaAdminPool?: PgPoolAdapter };

export const getAdminDatabase = (config: AdminRuntimeConfig): PostgresPoolLike => {
  if (globalPools.__gachaAdminPool !== undefined) return globalPools.__gachaAdminPool;

  const pool = new Pool({
    application_name: "gacha-admin",
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
    ssl: config.ssl
  });
  pool.on("error", (error) => {
    console.error("Unexpected admin database pool error", error);
  });
  const adapter = new PgPoolAdapter(pool);
  if (process.env.NODE_ENV !== "production") globalPools.__gachaAdminPool = adapter;
  return adapter;
};
