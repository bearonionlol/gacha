import { NextRequest } from "next/server";

import {
  handleAdminApiError,
  noStoreJson,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime
} from "../../../../../lib/admin/api";
import { runConfiguredProtocolIndexer } from "../../../../../lib/indexer/run-configured-indexer";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    await requireAdminMutation(request, runtime, "chain:reconcile");
    await readJsonObject(request);
    const result = await runConfiguredProtocolIndexer(runtime);
    return noStoreJson({ checkedAt: new Date().toISOString(), result });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
