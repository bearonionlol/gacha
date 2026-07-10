import { getAdminConfiguration, getAdminPublicConfiguration } from "../config";

const keys = [
  "DATABASE_URL",
  "ADMIN_SESSION_SECRET",
  "ADMIN_ALLOWED_ORIGINS",
  "ADMIN_WALLET_ROLES",
  "ADMIN_PRODUCTION_OPERATIONS_ENABLED",
  "ADMIN_MULTISIG_ADDRESS"
] as const;

const originalValues = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

describe("admin configuration", () => {
  afterEach(() => {
    for (const key of keys) {
      const value = originalValues[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("stays in read-only demo mode when any secure server requirement is absent", () => {
    for (const key of keys) delete process.env[key];
    expect(getAdminConfiguration().configured).toBe(false);
    expect(getAdminPublicConfiguration()).toEqual(expect.objectContaining({
      configured: false,
      mode: "demo_readonly",
      onchainQueueConfigured: false
    }));
  });

  it("configures off-chain operations without implicitly enabling the mainnet queue", () => {
    process.env.DATABASE_URL = "postgresql://admin:secret@db.example.com/gacha";
    process.env.ADMIN_SESSION_SECRET = "a-production-secret-with-at-least-thirty-two-characters";
    process.env.ADMIN_ALLOWED_ORIGINS = "https://ops.example.com";
    process.env.ADMIN_WALLET_ROLES = JSON.stringify({
      "0x1111111111111111111111111111111111111111": "inventory_manager"
    });
    delete process.env.ADMIN_PRODUCTION_OPERATIONS_ENABLED;
    delete process.env.ADMIN_MULTISIG_ADDRESS;

    const state = getAdminConfiguration();
    expect(state.configured).toBe(true);
    if (state.configured) expect(state.config.onchainQueue).toBeNull();
    expect(getAdminPublicConfiguration().onchainQueueConfigured).toBe(false);
  });

  it("enables only a non-signing multisig queue after explicit opt-in", () => {
    process.env.DATABASE_URL = "postgresql://admin:secret@db.example.com/gacha";
    process.env.ADMIN_SESSION_SECRET = "a-production-secret-with-at-least-thirty-two-characters";
    process.env.ADMIN_ALLOWED_ORIGINS = "https://ops.example.com";
    process.env.ADMIN_WALLET_ROLES = JSON.stringify({
      "0x1111111111111111111111111111111111111111": "admin"
    });
    process.env.ADMIN_PRODUCTION_OPERATIONS_ENABLED = "true";
    process.env.ADMIN_MULTISIG_ADDRESS = "0x2222222222222222222222222222222222222222";

    const state = getAdminConfiguration();
    expect(state.configured).toBe(true);
    if (state.configured) {
      expect(state.config.onchainQueue?.multisigAddress).toBe("0x2222222222222222222222222222222222222222");
    }
    expect(getAdminPublicConfiguration().onchainQueueConfigured).toBe(true);
  });
});
