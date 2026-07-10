import { NextRequest } from "next/server";

import {
  handleAdminApiError,
  noStoreJson,
  requireAdminRuntime,
  requireAdminSession
} from "../../../../lib/admin/api";

type ReadinessRow = {
  audit_events: string | null;
  auth_challenges: string | null;
  auth_rate_events: string | null;
  inventory_items: string | null;
  onchain_operations: string | null;
  sessions: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    await requireAdminSession(request, runtime, "inventory:read");
    const result = await runtime.database.query<ReadinessRow>(`SELECT
      to_regclass('public.inventory_items')::text AS inventory_items,
      to_regclass('public.inventory_audit_events')::text AS audit_events,
      to_regclass('public.admin_auth_challenges')::text AS auth_challenges,
      to_regclass('public.admin_sessions')::text AS sessions,
      to_regclass('public.admin_auth_rate_events')::text AS auth_rate_events,
      to_regclass('public.inventory_onchain_operations')::text AS onchain_operations`);
    const row = result.rows[0];
    const schemaReady = row !== undefined && Object.values(row).every((value) => value !== null);
    return noStoreJson({
      checkedAt: new Date().toISOString(),
      configuration: "ready",
      database: { connected: true, schemaReady },
      onchain: {
        execution: "external_multisig_only",
        queueEnabled: runtime.config.onchainQueue !== null,
        signingAvailable: false
      }
    }, { status: schemaReady ? 200 : 503 });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
