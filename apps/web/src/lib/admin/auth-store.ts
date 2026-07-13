import type { Address } from "viem";

import type { AdminRole } from "./types";

export type StoredAdminChallenge = {
  expiresAt: string;
  issuedAt: string;
  message: string;
  nonceHash: string;
  origin: string;
  role: AdminRole;
  walletAddress: Address;
};

export type StoredAdminSession = {
  createdAt: string;
  csrfHash: string;
  expiresAt: string;
  role: AdminRole;
  sessionHash: string;
  walletAddress: Address;
};

export type AdminRateLimitClaim = {
  clientKeyHash: string | null;
  clientLimit: number;
  kind: "challenge" | "verify";
  now: string;
  walletAddress: Address;
  walletLimit: number;
  windowStart: string;
};

export interface AdminAuthStore {
  consumeChallenge(nonceHash: string, walletAddress: Address, now: string): Promise<StoredAdminChallenge | null>;
  claimRateLimit(claim: AdminRateLimitClaim): Promise<boolean>;
  createSession(session: StoredAdminSession): Promise<void>;
  getSession(sessionHash: string, now: string): Promise<StoredAdminSession | null>;
  issueChallenge(challenge: StoredAdminChallenge): Promise<void>;
  revokeSession(sessionHash: string, now: string): Promise<void>;
  rotateCsrf(sessionHash: string, csrfHash: string, now: string): Promise<boolean>;
}

export class InMemoryAdminAuthStore implements AdminAuthStore {
  readonly #challenges = new Map<string, StoredAdminChallenge & { usedAt: string | null }>();
  readonly #sessions = new Map<string, StoredAdminSession & { revokedAt: string | null }>();
  readonly #rateEvents: Array<{
    clientKeyHash: string | null;
    kind: "challenge" | "verify";
    occurredAt: string;
    walletAddress: Address;
  }> = [];

  async issueChallenge(challenge: StoredAdminChallenge): Promise<void> {
    this.#challenges.set(challenge.nonceHash, { ...structuredClone(challenge), usedAt: null });
  }

  async claimRateLimit(claim: AdminRateLimitClaim): Promise<boolean> {
    const recent = this.#rateEvents.filter((event) => event.kind === claim.kind && event.occurredAt >= claim.windowStart);
    const walletCount = recent.filter((event) => event.walletAddress === claim.walletAddress).length;
    const clientCount = claim.clientKeyHash === null
      ? 0
      : recent.filter((event) => event.clientKeyHash === claim.clientKeyHash).length;
    if (walletCount >= claim.walletLimit || (claim.clientKeyHash !== null && clientCount >= claim.clientLimit)) return false;
    this.#rateEvents.push({
      clientKeyHash: claim.clientKeyHash,
      kind: claim.kind,
      occurredAt: claim.now,
      walletAddress: claim.walletAddress
    });
    return true;
  }

  async consumeChallenge(nonceHash: string, walletAddress: Address, now: string): Promise<StoredAdminChallenge | null> {
    const challenge = this.#challenges.get(nonceHash);
    if (
      challenge === undefined
      || challenge.usedAt !== null
      || challenge.walletAddress !== walletAddress
      || challenge.expiresAt <= now
    ) return null;
    challenge.usedAt = now;
    const { usedAt: _usedAt, ...stored } = challenge;
    return structuredClone(stored);
  }

  async createSession(session: StoredAdminSession): Promise<void> {
    for (const stored of this.#sessions.values()) {
      if (stored.walletAddress === session.walletAddress && stored.revokedAt === null) stored.revokedAt = session.createdAt;
    }
    this.#sessions.set(session.sessionHash, { ...structuredClone(session), revokedAt: null });
  }

  async getSession(sessionHash: string, now: string): Promise<StoredAdminSession | null> {
    const session = this.#sessions.get(sessionHash);
    if (session === undefined || session.revokedAt !== null || session.expiresAt <= now) return null;
    const { revokedAt: _revokedAt, ...stored } = session;
    return structuredClone(stored);
  }

  async revokeSession(sessionHash: string, now: string): Promise<void> {
    const session = this.#sessions.get(sessionHash);
    if (session !== undefined) session.revokedAt = now;
  }

  async rotateCsrf(sessionHash: string, csrfHash: string, now: string): Promise<boolean> {
    const session = this.#sessions.get(sessionHash);
    if (session === undefined || session.revokedAt !== null || session.expiresAt <= now) return false;
    session.csrfHash = csrfHash;
    return true;
  }
}
