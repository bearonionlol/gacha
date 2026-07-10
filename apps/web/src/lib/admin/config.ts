import { getAddress, isAddress, type Address } from "viem";

import { isAdminRole, type AdminConfigurationState, type AdminPublicConfiguration, type AdminRole } from "./types";

const MINIMUM_SESSION_SECRET_LENGTH = 32;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

const parseWalletRoles = (rawValue: string | undefined): ReadonlyMap<Address, AdminRole> | null => {
  if (rawValue === undefined || rawValue.trim() === "") return null;
  try {
    const parsed: unknown = JSON.parse(rawValue);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed);
    if (entries.length === 0) return null;

    const roles = new Map<Address, AdminRole>();
    for (const [walletAddress, role] of entries) {
      if (!isAddress(walletAddress) || !isAdminRole(role)) return null;
      roles.set(getAddress(walletAddress), role);
    }
    return roles;
  } catch {
    return null;
  }
};

const parseAllowedOrigins = (rawValue: string | undefined): readonly string[] | null => {
  if (rawValue === undefined || rawValue.trim() === "") return null;
  const origins = rawValue.split(",").map((value) => value.trim()).filter(Boolean);
  if (origins.length === 0) return null;
  try {
    const parsed = origins.map((value) => new URL(value));
    if (parsed.some((url) => !["http:", "https:"].includes(url.protocol) || url.origin === "null")) return null;
    return [...new Set(parsed.map((url) => url.origin))];
  } catch {
    return null;
  }
};

const parseSessionTtl = (rawValue: string | undefined): number => {
  if (rawValue === undefined) return DEFAULT_SESSION_TTL_SECONDS;
  const parsed = Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed >= 900 && parsed <= 24 * 60 * 60
    ? parsed
    : DEFAULT_SESSION_TTL_SECONDS;
};

const parseBoundedInteger = (rawValue: string | undefined, fallback: number, minimum: number, maximum: number): number => {
  const parsed = rawValue === undefined ? Number.NaN : Number(rawValue);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

export const getAdminConfiguration = (): AdminConfigurationState => {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim();
  const allowedOrigins = parseAllowedOrigins(process.env.ADMIN_ALLOWED_ORIGINS);
  const walletRoles = parseWalletRoles(process.env.ADMIN_WALLET_ROLES);
  const productionOriginsValid = process.env.NODE_ENV !== "production"
    || allowedOrigins === null
    || allowedOrigins.every((origin) => new URL(origin).protocol === "https:");
  const missing: string[] = [];

  if (databaseUrl === undefined || databaseUrl === "") missing.push("DATABASE_URL");
  if (sessionSecret === undefined || sessionSecret.length < MINIMUM_SESSION_SECRET_LENGTH) {
    missing.push("ADMIN_SESSION_SECRET (minimum 32 characters)");
  }
  if (allowedOrigins === null) missing.push("ADMIN_ALLOWED_ORIGINS");
  if (!productionOriginsValid) missing.push("ADMIN_ALLOWED_ORIGINS (HTTPS required in production)");
  if (walletRoles === null) missing.push("ADMIN_WALLET_ROLES");

  if (
    missing.length > 0
    || databaseUrl === undefined
    || sessionSecret === undefined
    || allowedOrigins === null
    || walletRoles === null
    || !productionOriginsValid
  ) {
    return { configured: false, missing };
  }

  const databaseCa = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  const configuredMultisig = process.env.ADMIN_MULTISIG_ADDRESS?.trim();
  const onchainQueue = process.env.ADMIN_PRODUCTION_OPERATIONS_ENABLED === "true"
    && configuredMultisig !== undefined
    && isAddress(configuredMultisig)
    ? { multisigAddress: getAddress(configuredMultisig) }
    : null;
  const ssl = process.env.DATABASE_SSL === "disable"
    ? false
    : { rejectUnauthorized: true as const, ...(databaseCa === undefined || databaseCa === "" ? {} : { ca: databaseCa }) };

  return {
    configured: true,
    config: {
      allowedOrigins,
      authRateLimits: {
        challengeClient: parseBoundedInteger(process.env.ADMIN_AUTH_CHALLENGE_CLIENT_LIMIT, 30, 1, 1_000),
        challengeWallet: parseBoundedInteger(process.env.ADMIN_AUTH_CHALLENGE_WALLET_LIMIT, 10, 1, 100),
        verifyClient: parseBoundedInteger(process.env.ADMIN_AUTH_VERIFY_CLIENT_LIMIT, 60, 1, 2_000),
        verifyWallet: parseBoundedInteger(process.env.ADMIN_AUTH_VERIFY_WALLET_LIMIT, 20, 1, 200),
        windowSeconds: parseBoundedInteger(process.env.ADMIN_AUTH_RATE_WINDOW_SECONDS, 900, 60, 86_400)
      },
      databaseUrl,
      sessionSecret,
      sessionTtlSeconds: parseSessionTtl(process.env.ADMIN_SESSION_TTL_SECONDS),
      onchainQueue,
      ssl,
      trustProxy: process.env.ADMIN_TRUST_PROXY === "true",
      walletRoles
    }
  };
};

export const getAdminPublicConfiguration = (): AdminPublicConfiguration => {
  const state = getAdminConfiguration();
  if (state.configured) {
    return {
      configured: true,
      mode: "production",
      onchainQueueConfigured: state.config.onchainQueue !== null,
      reason: state.config.onchainQueue === null
        ? "Secure off-chain inventory operations are configured. Mainnet requests remain disabled."
        : "Secure inventory operations and the multisig request queue are configured."
    };
  }
  return {
    configured: false,
    mode: "demo_readonly",
    onchainQueueConfigured: false,
    reason: `Read-only demo mode. Server configuration is missing: ${state.missing.join(", ")}.`
  };
};
