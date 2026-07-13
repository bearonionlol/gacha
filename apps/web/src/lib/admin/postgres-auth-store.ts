import { randomUUID } from "node:crypto";

import {
  type PostgresPoolLike,
  type PostgresQueryable,
  type PostgresTransactionClient
} from "@gacha/inventory";
import { getAddress, type Address } from "viem";

import type { AdminAuthStore, AdminRateLimitClaim, StoredAdminChallenge, StoredAdminSession } from "./auth-store";
import { isAdminRole, type AdminRole } from "./types";

type ChallengeRow = {
  expires_at: Date | string;
  issued_at: Date | string;
  message: string;
  nonce_hash: string;
  origin: string;
  role: string;
  wallet_address: string;
};

type SessionRow = {
  created_at: Date | string;
  csrf_hash: string;
  expires_at: Date | string;
  role: string;
  session_hash: string;
  wallet_address: string;
};

const toIsoString = (value: Date | string): string => {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const parseRole = (value: string): AdminRole => {
  if (!isAdminRole(value)) throw new Error("Database returned an invalid admin role");
  return value;
};

const parseWallet = (value: string): Address => getAddress(value);

const mapChallenge = (row: ChallengeRow): StoredAdminChallenge => ({
  expiresAt: toIsoString(row.expires_at),
  issuedAt: toIsoString(row.issued_at),
  message: row.message,
  nonceHash: row.nonce_hash,
  origin: row.origin,
  role: parseRole(row.role),
  walletAddress: parseWallet(row.wallet_address)
});

const mapSession = (row: SessionRow): StoredAdminSession => ({
  createdAt: toIsoString(row.created_at),
  csrfHash: row.csrf_hash,
  expiresAt: toIsoString(row.expires_at),
  role: parseRole(row.role),
  sessionHash: row.session_hash,
  walletAddress: parseWallet(row.wallet_address)
});

export class PostgresAdminAuthStore implements AdminAuthStore {
  constructor(private readonly pool: PostgresPoolLike) {}

  async issueChallenge(challenge: StoredAdminChallenge): Promise<void> {
    await this.#transaction(async (client) => {
      await client.query(
        `INSERT INTO admin_auth_challenges (
           nonce_hash, wallet_address, role, origin, message, issued_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz)`,
        [
          challenge.nonceHash,
          challenge.walletAddress,
          challenge.role,
          challenge.origin,
          challenge.message,
          challenge.issuedAt,
          challenge.expiresAt
        ]
      );
      await client.query(
        "DELETE FROM admin_auth_challenges WHERE expires_at < $1::timestamptz - INTERVAL '1 day'",
        [challenge.issuedAt]
      );
    });
  }

  async claimRateLimit(claim: AdminRateLimitClaim): Promise<boolean> {
    return this.#transaction(async (client) => {
      const lockKeys = [
        `${claim.kind}:wallet:${claim.walletAddress}`,
        ...(claim.clientKeyHash === null ? [] : [`${claim.kind}:client:${claim.clientKeyHash}`])
      ].sort();
      for (const lockKey of lockKeys) {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [lockKey]);
      }
      const result = await client.query<{ client_count: string | number; wallet_count: string | number }>(
        `SELECT
           COUNT(*) FILTER (WHERE wallet_address = $3) AS wallet_count,
           COUNT(*) FILTER (WHERE $4::text IS NOT NULL AND client_key_hash = $4) AS client_count
         FROM admin_auth_rate_events
         WHERE event_kind = $1 AND occurred_at >= $2::timestamptz`,
        [claim.kind, claim.windowStart, claim.walletAddress, claim.clientKeyHash]
      );
      const walletCount = Number(result.rows[0]?.wallet_count ?? 0);
      const clientCount = Number(result.rows[0]?.client_count ?? 0);
      if (walletCount >= claim.walletLimit || (claim.clientKeyHash !== null && clientCount >= claim.clientLimit)) {
        return false;
      }
      await client.query(
        `INSERT INTO admin_auth_rate_events (
           event_id, event_kind, wallet_address, client_key_hash, occurred_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
        [randomUUID(), claim.kind, claim.walletAddress, claim.clientKeyHash, claim.now]
      );
      await client.query(
        "DELETE FROM admin_auth_rate_events WHERE occurred_at < $1::timestamptz - INTERVAL '1 day'",
        [claim.windowStart]
      );
      return true;
    });
  }

  async consumeChallenge(nonceHash: string, walletAddress: Address, now: string): Promise<StoredAdminChallenge | null> {
    const result = await this.pool.query<ChallengeRow>(
      `UPDATE admin_auth_challenges
          SET used_at = $1::timestamptz
        WHERE nonce_hash = $2
          AND wallet_address = $3
          AND used_at IS NULL
          AND expires_at > $1::timestamptz
      RETURNING nonce_hash, wallet_address, role, origin, message, issued_at, expires_at`,
      [now, nonceHash, walletAddress]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapChallenge(row);
  }

  async createSession(session: StoredAdminSession): Promise<void> {
    await this.#transaction(async (client) => {
      await client.query(
        "UPDATE admin_sessions SET revoked_at = $1::timestamptz WHERE wallet_address = $2 AND revoked_at IS NULL",
        [session.createdAt, session.walletAddress]
      );
      await client.query(
        `INSERT INTO admin_sessions (
           session_hash, wallet_address, role, csrf_hash, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz)`,
        [session.sessionHash, session.walletAddress, session.role, session.csrfHash, session.createdAt, session.expiresAt]
      );
      await client.query("DELETE FROM admin_sessions WHERE expires_at < $1::timestamptz - INTERVAL '7 days'", [session.createdAt]);
    });
  }

  async getSession(sessionHash: string, now: string): Promise<StoredAdminSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT session_hash, wallet_address, role, csrf_hash, created_at, expires_at
         FROM admin_sessions
        WHERE session_hash = $1 AND revoked_at IS NULL AND expires_at > $2::timestamptz`,
      [sessionHash, now]
    );
    const row = result.rows[0];
    return row === undefined ? null : mapSession(row);
  }

  async revokeSession(sessionHash: string, now: string): Promise<void> {
    await this.pool.query(
      "UPDATE admin_sessions SET revoked_at = $1::timestamptz WHERE session_hash = $2 AND revoked_at IS NULL",
      [now, sessionHash]
    );
  }

  async rotateCsrf(sessionHash: string, csrfHash: string, now: string): Promise<boolean> {
    const result = await this.pool.query<Record<string, never>>(
      `UPDATE admin_sessions
          SET csrf_hash = $1
        WHERE session_hash = $2 AND revoked_at IS NULL AND expires_at > $3::timestamptz
      RETURNING session_hash`,
      [csrfHash, sessionHash, now]
    );
    return result.rowCount === 1;
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
