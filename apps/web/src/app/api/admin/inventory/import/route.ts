import { NextRequest } from "next/server";

import {
  createInventoryActor,
  handleAdminApiError,
  noStoreJson,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "inventory:import");
    const body = await readJsonObject(request);
    const records = await runtime.inventory.bulkCreate(body.items, createInventoryActor(session));
    return noStoreJson({ count: records.length, records }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
