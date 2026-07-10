import { NextRequest } from "next/server";

import {
  handleAdminApiError,
  noStoreJson,
  requireAdminRuntime,
  requireAdminSession
} from "../../../../lib/admin/api";

export async function GET(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    await requireAdminSession(request, runtime, "audit:read");
    const inventoryId = request.nextUrl.searchParams.get("inventoryId")?.slice(0, 160) || undefined;
    const rawLimit = request.nextUrl.searchParams.get("limit");
    const limit = rawLimit === null ? undefined : Number(rawLimit);
    const events = await runtime.inventory.audit(
      inventoryId,
      limit !== undefined && Number.isSafeInteger(limit) ? limit : undefined
    );
    return noStoreJson({ events });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
