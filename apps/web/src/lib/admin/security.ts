import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { getAddress, isAddress, isHex, verifyMessage, type Address, type Hex } from "viem";

import type { AdminPermission, AdminRole } from "./types";

const rolePermissions: Readonly<Record<AdminRole, readonly AdminPermission[]>> = {
  viewer: ["inventory:read", "audit:read"],
  inventory_operator: ["inventory:read", "inventory:create", "inventory:update", "inventory:transition", "inventory:import", "audit:read"],
  inventory_manager: ["inventory:read", "inventory:create", "inventory:update", "inventory:transition", "inventory:delete", "inventory:import", "audit:read", "onchain:queue"],
  admin: ["inventory:read", "inventory:create", "inventory:update", "inventory:transition", "inventory:delete", "inventory:import", "audit:read", "onchain:queue"]
};

export const hasAdminPermission = (role: AdminRole, permission: AdminPermission): boolean => {
  return rolePermissions[role].includes(permission);
};

export const normalizeWalletAddress = (value: string): Address => {
  if (!isAddress(value)) throw new Error("A valid EVM wallet address is required");
  return getAddress(value);
};

export const createOpaqueToken = (): string => randomBytes(32).toString("base64url");

export const hashAdminToken = (token: string, purpose: "nonce" | "session" | "csrf" | "rate", secret: string): string => {
  return createHmac("sha256", secret).update(`${purpose}:${token}`, "utf8").digest("hex");
};

export const constantTimeHashMatches = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export type WalletChallengeInput = {
  expiresAt: string;
  issuedAt: string;
  nonce: string;
  origin: string;
  walletAddress: Address;
};

export const buildWalletChallengeMessage = (input: WalletChallengeInput): string => {
  const domain = new URL(input.origin).host;
  return [
    `${domain} requests an administrative wallet signature:`,
    input.walletAddress,
    "",
    "Sign in to the Gacha Vault inventory console. This does not submit a transaction or spend funds.",
    "",
    `URI: ${input.origin}/admin/inventory`,
    "Version: 1",
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expiration Time: ${input.expiresAt}`
  ].join("\n");
};

export const verifyWalletChallengeSignature = async (
  walletAddress: Address,
  message: string,
  signature: string
): Promise<boolean> => {
  if (!isHex(signature)) return false;
  try {
    return await verifyMessage({ address: walletAddress, message, signature: signature as Hex });
  } catch {
    return false;
  }
};
