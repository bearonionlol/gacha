import { privateKeyToAccount } from "viem/accounts";

vi.mock("server-only", () => ({}));

import { AdminAuthenticationError, AdminAuthService, AdminRateLimitError } from "../auth-service";
import { InMemoryAdminAuthStore } from "../auth-store";
import type { AdminRuntimeConfig } from "../types";

const account = privateKeyToAccount("0x1111111111111111111111111111111111111111111111111111111111111111");
const secondAccount = privateKeyToAccount("0x2222222222222222222222222222222222222222222222222222222222222222");
const origin = "https://ops.example.com";

const createConfig = (overrides: Partial<AdminRuntimeConfig["authRateLimits"]> = {}): AdminRuntimeConfig => ({
  allowedOrigins: [origin],
  authRateLimits: {
    challengeClient: 30,
    challengeWallet: 10,
    verifyClient: 60,
    verifyWallet: 20,
    windowSeconds: 900,
    ...overrides
  },
  databaseUrl: "postgresql://unused",
  onchainQueue: null,
  sessionSecret: "test-session-secret-that-is-longer-than-32-characters",
  sessionTtlSeconds: 3600,
  ssl: false,
  trustProxy: false,
  walletRoles: new Map([
    [account.address, "admin"],
    [secondAccount.address, "inventory_operator"]
  ])
});

describe("AdminAuthService", () => {
  it("keeps independent pending nonces valid for the same authorized wallet", async () => {
    const store = new InMemoryAdminAuthStore();
    const service = new AdminAuthService(store, createConfig(), () => new Date("2026-07-10T12:00:00.000Z"));
    const first = await service.issueChallenge(account.address, origin, "203.0.113.5");
    const second = await service.issueChallenge(account.address, origin, "203.0.113.5");

    expect(second.nonce).not.toBe(first.nonce);
    const signature = await account.signMessage({ message: first.message });
    const issued = await service.verifyChallenge({
      nonce: first.nonce,
      origin,
      signature,
      walletAddress: account.address
    }, "203.0.113.5");

    expect(issued.session.role).toBe("admin");
    expect(await service.validateCsrf(issued.session, issued.csrfToken)).toBe(true);
  });

  it("enforces wallet and trusted-client challenge limits independently", async () => {
    const walletService = new AdminAuthService(
      new InMemoryAdminAuthStore(),
      createConfig({ challengeClient: 20, challengeWallet: 2 }),
      () => new Date("2026-07-10T12:00:00.000Z")
    );
    await walletService.issueChallenge(account.address, origin, "203.0.113.5");
    await walletService.issueChallenge(account.address, origin, "203.0.113.6");
    await expect(walletService.issueChallenge(account.address, origin, "203.0.113.7")).rejects.toBeInstanceOf(AdminRateLimitError);

    const clientService = new AdminAuthService(
      new InMemoryAdminAuthStore(),
      createConfig({ challengeClient: 1, challengeWallet: 20 }),
      () => new Date("2026-07-10T12:00:00.000Z")
    );
    await clientService.issueChallenge(account.address, origin, "198.51.100.9");
    await expect(clientService.issueChallenge(secondAccount.address, origin, "198.51.100.9")).rejects.toBeInstanceOf(AdminRateLimitError);
  });

  it("counts malformed verification attempts and rejects them as authentication failures", async () => {
    const service = new AdminAuthService(
      new InMemoryAdminAuthStore(),
      createConfig({ verifyWallet: 2 }),
      () => new Date("2026-07-10T12:00:00.000Z")
    );
    const challenge = await service.issueChallenge(account.address, origin, null);
    await expect(service.verifyChallenge({
      nonce: challenge.nonce,
      origin,
      signature: "not-hex",
      walletAddress: account.address
    }, null)).rejects.toBeInstanceOf(AdminAuthenticationError);

    const next = await service.issueChallenge(account.address, origin, null);
    await expect(service.verifyChallenge({
      nonce: next.nonce,
      origin,
      signature: "0x1234",
      walletAddress: account.address
    }, null)).rejects.toBeInstanceOf(AdminAuthenticationError);
    const last = await service.issueChallenge(account.address, origin, null);
    await expect(service.verifyChallenge({
      nonce: last.nonce,
      origin,
      signature: "0x1234",
      walletAddress: account.address
    }, null)).rejects.toBeInstanceOf(AdminRateLimitError);
  });

  it("rejects replayed and expired challenges", async () => {
    let now = new Date("2026-07-10T12:00:00.000Z");
    const service = new AdminAuthService(new InMemoryAdminAuthStore(), createConfig(), () => now);
    const challenge = await service.issueChallenge(account.address, origin, null);
    const signature = await account.signMessage({ message: challenge.message });
    await service.verifyChallenge({ nonce: challenge.nonce, origin, signature, walletAddress: account.address }, null);
    await expect(service.verifyChallenge({ nonce: challenge.nonce, origin, signature, walletAddress: account.address }, null))
      .rejects.toBeInstanceOf(AdminAuthenticationError);

    const expiring = await service.issueChallenge(account.address, origin, null);
    now = new Date("2026-07-10T12:06:00.000Z");
    const expiredSignature = await account.signMessage({ message: expiring.message });
    await expect(service.verifyChallenge({ nonce: expiring.nonce, origin, signature: expiredSignature, walletAddress: account.address }, null))
      .rejects.toBeInstanceOf(AdminAuthenticationError);
  });

  it("rejects invalid and unknown wallets before writing rate-limit events", async () => {
    const service = new AdminAuthService(
      new InMemoryAdminAuthStore(),
      createConfig({ challengeClient: 1, challengeWallet: 1, verifyClient: 1, verifyWallet: 1 }),
      () => new Date("2026-07-10T12:00:00.000Z")
    );
    const unknown = privateKeyToAccount("0x3333333333333333333333333333333333333333333333333333333333333333");

    await expect(service.issueChallenge("not-an-address", origin, "203.0.113.10")).rejects.toBeInstanceOf(
      AdminAuthenticationError
    );
    await expect(service.issueChallenge(unknown.address, origin, "203.0.113.10")).rejects.toBeInstanceOf(
      AdminAuthenticationError
    );
    await expect(service.verifyChallenge({
      nonce: "random",
      origin,
      signature: "0x1234",
      walletAddress: unknown.address
    }, "203.0.113.10")).rejects.toBeInstanceOf(AdminAuthenticationError);

    await expect(service.issueChallenge(account.address, origin, "203.0.113.10")).resolves.toEqual(
      expect.objectContaining({ walletAddress: account.address })
    );
  });
});
