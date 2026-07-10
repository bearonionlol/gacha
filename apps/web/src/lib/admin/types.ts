import type { Address } from "viem";

export const adminRoles = ["viewer", "inventory_operator", "inventory_manager", "admin"] as const;
export type AdminRole = (typeof adminRoles)[number];

export const isAdminRole = (value: unknown): value is AdminRole => {
  return typeof value === "string" && (adminRoles as readonly string[]).includes(value);
};

export type AdminPermission =
  | "inventory:read"
  | "inventory:create"
  | "inventory:update"
  | "inventory:transition"
  | "inventory:delete"
  | "inventory:import"
  | "audit:read"
  | "onchain:queue";

export type AdminSession = {
  expiresAt: string;
  role: AdminRole;
  sessionHash: string;
  walletAddress: Address;
};

export type AdminRuntimeConfig = {
  allowedOrigins: readonly string[];
  authRateLimits: {
    challengeClient: number;
    challengeWallet: number;
    verifyClient: number;
    verifyWallet: number;
    windowSeconds: number;
  };
  databaseUrl: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  onchainQueue: null | { multisigAddress: Address };
  ssl: false | { ca?: string; rejectUnauthorized: true };
  trustProxy: boolean;
  walletRoles: ReadonlyMap<Address, AdminRole>;
};

export type AdminConfigurationState =
  | { configured: true; config: AdminRuntimeConfig }
  | { configured: false; missing: readonly string[] };

export type AdminPublicConfiguration = {
  configured: boolean;
  mode: "production" | "demo_readonly";
  onchainQueueConfigured: boolean;
  reason: string;
};
