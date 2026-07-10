import "server-only";

import { randomUUID } from "node:crypto";
import { isIP } from "node:net";

import {
  InventoryConflictError,
  InventoryMutationForbiddenError,
  InventoryNotFoundError,
  type InventoryActor
} from "@gacha/inventory";
import { NextRequest, NextResponse } from "next/server";

import { AdminAuthenticationError, AdminRateLimitError } from "./auth-service";
import { getAdminRuntime, type AdminRuntime } from "./runtime";
import { hasAdminPermission } from "./security";
import type { AdminPermission, AdminSession } from "./types";

export const adminSessionCookieName = process.env.NODE_ENV === "production"
  ? "__Host-gacha_admin_session"
  : "gacha_admin_session";

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

export const noStoreJson = (body: unknown, init?: ResponseInit): NextResponse => {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, private");
  response.headers.set("Vary", "Cookie");
  return response;
};

export const requireAdminRuntime = (): AdminRuntime => {
  const runtime = getAdminRuntime();
  if (runtime === null) {
    throw new AdminApiError(503, "ADMIN_UNCONFIGURED", "Secure admin operations are not configured on this server");
  }
  return runtime;
};

export const assertAdminOrigin = (request: NextRequest, runtime: AdminRuntime): string => {
  const rawOrigin = request.headers.get("origin");
  if (rawOrigin === null) throw new AdminApiError(403, "ORIGIN_REQUIRED", "A same-origin request is required");
  let origin: string;
  try {
    origin = new URL(rawOrigin).origin;
  } catch {
    throw new AdminApiError(403, "ORIGIN_REJECTED", "The request origin is invalid");
  }
  if (!runtime.config.allowedOrigins.includes(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AdminApiError(403, "ORIGIN_REJECTED", "The request origin is not allowed");
  }
  return origin;
};

export const getTrustedAdminClientKey = (request: NextRequest, runtime: AdminRuntime): string | null => {
  if (!runtime.config.trustProxy) return null;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded !== undefined && isIP(forwarded) !== 0 ? forwarded : null;
};

export const assertJsonRequest = (request: NextRequest): void => {
  const contentType = request.headers.get("content-type")?.toLocaleLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new AdminApiError(415, "JSON_REQUIRED", "Content-Type must be application/json");
  }
};

export const readJsonObject = async (request: NextRequest): Promise<Record<string, unknown>> => {
  assertJsonRequest(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new AdminApiError(400, "INVALID_JSON", "The request body is not valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new AdminApiError(400, "INVALID_BODY", "The request body must be a JSON object");
  }
  return body as Record<string, unknown>;
};

export const getSessionToken = (request: NextRequest): string | null => {
  return request.cookies.get(adminSessionCookieName)?.value ?? null;
};

export const getOptionalAdminSession = async (
  request: NextRequest,
  runtime: AdminRuntime
): Promise<AdminSession | null> => {
  const sessionToken = getSessionToken(request);
  return sessionToken === null ? null : runtime.auth.getSession(sessionToken);
};

export const requireAdminSession = async (
  request: NextRequest,
  runtime: AdminRuntime,
  permission: AdminPermission
): Promise<AdminSession> => {
  const session = await getOptionalAdminSession(request, runtime);
  if (session === null) throw new AdminApiError(401, "AUTH_REQUIRED", "An active admin session is required");
  if (!hasAdminPermission(session.role, permission)) {
    throw new AdminApiError(403, "PERMISSION_DENIED", `The ${session.role} role cannot perform this operation`);
  }
  return session;
};

export const requireAdminMutation = async (
  request: NextRequest,
  runtime: AdminRuntime,
  permission: AdminPermission
): Promise<AdminSession> => {
  assertAdminOrigin(request, runtime);
  assertJsonRequest(request);
  const session = await requireAdminSession(request, runtime, permission);
  const csrfToken = request.headers.get("x-admin-csrf");
  if (csrfToken === null || !(await runtime.auth.validateCsrf(session, csrfToken))) {
    throw new AdminApiError(403, "CSRF_REJECTED", "The CSRF token is missing, expired, or invalid");
  }
  return session;
};

export const createInventoryActor = (session: AdminSession): InventoryActor => ({
  requestId: randomUUID(),
  role: session.role,
  walletAddress: session.walletAddress
});

export const parseExpectedRevision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new AdminApiError(400, "INVALID_REVISION", "expectedRevision must be a positive integer");
  }
  return value as number;
};

export const parseRequiredString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AdminApiError(400, "INVALID_INPUT", `${field} is required`);
  }
  return value;
};

export const parseInventoryId = (value: unknown): string => {
  const inventoryId = parseRequiredString(value, "inventoryId");
  if (inventoryId.length > 160) throw new AdminApiError(400, "INVALID_INPUT", "inventoryId is too long");
  return inventoryId;
};

export const publicSession = (session: AdminSession) => ({
  expiresAt: session.expiresAt,
  role: session.role,
  walletAddress: session.walletAddress
});

export const handleAdminApiError = (error: unknown): NextResponse => {
  if (error instanceof AdminApiError) {
    return noStoreJson({ error: { code: error.code, message: error.message } }, { status: error.status });
  }
  if (error instanceof AdminAuthenticationError) {
    return noStoreJson({ error: { code: "AUTH_REJECTED", message: error.message } }, { status: 401 });
  }
  if (error instanceof AdminRateLimitError) {
    const response = noStoreJson({ error: { code: "RATE_LIMITED", message: error.message } }, { status: 429 });
    response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof InventoryNotFoundError) {
    return noStoreJson({ error: { code: "NOT_FOUND", message: error.message } }, { status: 404 });
  }
  if (error instanceof InventoryConflictError) {
    return noStoreJson(
      { error: { code: "REVISION_CONFLICT", currentRevision: error.currentRevision, message: error.message } },
      { status: 409 }
    );
  }
  if (error instanceof InventoryMutationForbiddenError) {
    return noStoreJson({ error: { code: "MUTATION_FORBIDDEN", message: error.message } }, { status: 422 });
  }
  if (error instanceof Error && error.name === "ZodError") {
    return noStoreJson({ error: { code: "VALIDATION_FAILED", message: "Inventory data failed schema validation" } }, { status: 422 });
  }
  if (error instanceof Error && /Invalid inventory lifecycle transition|admin review/.test(error.message)) {
    return noStoreJson({ error: { code: "INVALID_TRANSITION", message: error.message } }, { status: 422 });
  }
  console.error("Admin API request failed", error);
  return noStoreJson(
    { error: { code: "INTERNAL_ERROR", message: "The admin operation could not be completed" } },
    { status: 500 }
  );
};
