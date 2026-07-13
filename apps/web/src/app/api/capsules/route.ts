import { getAddress, isAddress } from "viem";
import { NextRequest, NextResponse } from "next/server";

import { getAdminRuntime } from "../../../lib/admin/runtime";
import { PostgresProtocolEventStore } from "../../../lib/indexer/postgres-event-store";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim() ?? "";
  if (!isAddress(wallet)) return publicJson({ error: { code: "INVALID_WALLET", message: "wallet must be an EVM address" } }, 400);
  const chainId = Number(request.nextUrl.searchParams.get("chainId"));
  if (!Number.isSafeInteger(chainId) || chainId < 1) {
    return publicJson({ error: { code: "INVALID_CHAIN", message: "chainId must be a positive integer" } }, 400);
  }

  const runtime = getAdminRuntime();
  if (runtime === null) return publicJson({ capsules: [], configured: false });

  try {
    const store = new PostgresProtocolEventStore(runtime.database);
    const capsules = await store.listCapsules(getAddress(wallet), chainId);
    return publicJson({ capsules, configured: true });
  } catch (error) {
    console.error("Capsule history query failed", error);
    return publicJson({ error: { code: "CAPSULE_QUERY_FAILED", message: "Capsule history is temporarily unavailable" } }, 500);
  }
}

function publicJson(body: unknown, status = 200): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
