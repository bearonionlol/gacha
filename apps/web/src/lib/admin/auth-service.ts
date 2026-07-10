import type { Address } from "viem";

import type { AdminAuthStore, StoredAdminSession } from "./auth-store";
import {
  buildWalletChallengeMessage,
  constantTimeHashMatches,
  createOpaqueToken,
  hashAdminToken,
  normalizeWalletAddress,
  verifyWalletChallengeSignature
} from "./security";
import type { AdminRuntimeConfig, AdminSession } from "./types";

const CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1_000;

export type IssuedAdminChallenge = {
  expiresAt: string;
  message: string;
  nonce: string;
  walletAddress: Address;
};

export type IssuedAdminSession = {
  csrfToken: string;
  session: AdminSession;
  sessionToken: string;
};

export class AdminAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthenticationError";
  }
}

export class AdminRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many authentication attempts; wait before retrying");
    this.name = "AdminRateLimitError";
  }
}

export class AdminAuthService {
  constructor(
    private readonly store: AdminAuthStore,
    private readonly config: AdminRuntimeConfig,
    private readonly now: () => Date = () => new Date()
  ) {}

  async issueChallenge(walletValue: string, originValue: string, clientKey: string | null): Promise<IssuedAdminChallenge> {
    const { role, walletAddress } = this.#authorizeWallet(walletValue);
    const origin = this.#assertOrigin(originValue);
    await this.#claimRateLimit("challenge", walletAddress, clientKey);

    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MILLISECONDS);
    const nonce = createOpaqueToken();
    const message = buildWalletChallengeMessage({
      expiresAt: expiresAt.toISOString(),
      issuedAt: issuedAt.toISOString(),
      nonce,
      origin,
      walletAddress
    });
    await this.store.issueChallenge({
      expiresAt: expiresAt.toISOString(),
      issuedAt: issuedAt.toISOString(),
      message,
      nonceHash: hashAdminToken(nonce, "nonce", this.config.sessionSecret),
      origin,
      role,
      walletAddress
    });
    return { expiresAt: expiresAt.toISOString(), message, nonce, walletAddress };
  }

  async verifyChallenge(input: {
    nonce: string;
    origin: string;
    signature: string;
    walletAddress: string;
  }, clientKey: string | null): Promise<IssuedAdminSession> {
    const { role, walletAddress } = this.#authorizeWallet(input.walletAddress);
    const origin = this.#assertOrigin(input.origin);
    const now = this.now();
    await this.#claimRateLimit("verify", walletAddress, clientKey);
    const nonceHash = hashAdminToken(input.nonce, "nonce", this.config.sessionSecret);
    const challenge = await this.store.consumeChallenge(nonceHash, walletAddress, now.toISOString());
    if (challenge === null || challenge.origin !== origin) {
      throw new AdminAuthenticationError("The wallet challenge is invalid, expired, or already used");
    }
    const valid = await verifyWalletChallengeSignature(walletAddress, challenge.message, input.signature);
    if (!valid) throw new AdminAuthenticationError("The wallet signature does not match the authorized address");

    const sessionToken = createOpaqueToken();
    const csrfToken = createOpaqueToken();
    const expiresAt = new Date(now.getTime() + this.config.sessionTtlSeconds * 1_000).toISOString();
    const storedSession: StoredAdminSession = {
      createdAt: now.toISOString(),
      csrfHash: hashAdminToken(csrfToken, "csrf", this.config.sessionSecret),
      expiresAt,
      role,
      sessionHash: hashAdminToken(sessionToken, "session", this.config.sessionSecret),
      walletAddress
    };
    await this.store.createSession(storedSession);
    return { csrfToken, session: this.#toAdminSession(storedSession), sessionToken };
  }

  async getSession(sessionToken: string): Promise<AdminSession | null> {
    const sessionHash = hashAdminToken(sessionToken, "session", this.config.sessionSecret);
    const stored = await this.store.getSession(sessionHash, this.now().toISOString());
    return stored === null ? null : this.#toAdminSession(stored);
  }

  async issueCsrfToken(sessionToken: string): Promise<{ csrfToken: string; session: AdminSession } | null> {
    const sessionHash = hashAdminToken(sessionToken, "session", this.config.sessionSecret);
    const now = this.now().toISOString();
    const stored = await this.store.getSession(sessionHash, now);
    if (stored === null) return null;
    const csrfToken = createOpaqueToken();
    const rotated = await this.store.rotateCsrf(
      sessionHash,
      hashAdminToken(csrfToken, "csrf", this.config.sessionSecret),
      now
    );
    return rotated ? { csrfToken, session: this.#toAdminSession(stored) } : null;
  }

  async validateCsrf(session: AdminSession, csrfToken: string): Promise<boolean> {
    const stored = await this.store.getSession(session.sessionHash, this.now().toISOString());
    if (stored === null) return false;
    const candidate = hashAdminToken(csrfToken, "csrf", this.config.sessionSecret);
    return constantTimeHashMatches(candidate, stored.csrfHash);
  }

  async revokeSession(sessionToken: string): Promise<void> {
    const sessionHash = hashAdminToken(sessionToken, "session", this.config.sessionSecret);
    await this.store.revokeSession(sessionHash, this.now().toISOString());
  }

  #assertOrigin(originValue: string): string {
    let origin: string;
    try {
      origin = new URL(originValue).origin;
    } catch {
      throw new AdminAuthenticationError("The request origin is invalid");
    }
    if (!this.config.allowedOrigins.includes(origin)) {
      throw new AdminAuthenticationError("The request origin is not allowed");
    }
    return origin;
  }

  async #claimRateLimit(kind: "challenge" | "verify", walletAddress: Address, clientKey: string | null): Promise<void> {
    const now = this.now();
    const limits = this.config.authRateLimits;
    const accepted = await this.store.claimRateLimit({
      clientKeyHash: clientKey === null ? null : hashAdminToken(clientKey, "rate", this.config.sessionSecret),
      clientLimit: kind === "challenge" ? limits.challengeClient : limits.verifyClient,
      kind,
      now: now.toISOString(),
      walletAddress,
      walletLimit: kind === "challenge" ? limits.challengeWallet : limits.verifyWallet,
      windowStart: new Date(now.getTime() - limits.windowSeconds * 1_000).toISOString()
    });
    if (!accepted) throw new AdminRateLimitError(limits.windowSeconds);
  }

  #authorizeWallet(walletValue: string) {
    let walletAddress: Address;
    try {
      walletAddress = normalizeWalletAddress(walletValue);
    } catch {
      throw new AdminAuthenticationError("Admin wallet authentication failed");
    }
    const role = this.config.walletRoles.get(walletAddress);
    if (role === undefined) throw new AdminAuthenticationError("Admin wallet authentication failed");
    return { role, walletAddress };
  }

  #toAdminSession(stored: StoredAdminSession): AdminSession {
    return {
      expiresAt: stored.expiresAt,
      role: stored.role,
      sessionHash: stored.sessionHash,
      walletAddress: stored.walletAddress
    };
  }
}
