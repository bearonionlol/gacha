import { sampleInventory } from "@gacha/inventory";
import { NextRequest } from "next/server";

import { getAdminPublicConfiguration } from "../../../../../lib/admin/config";
import {
  createInventoryActor,
  handleAdminApiError,
  noStoreJson,
  parseExpectedRevision,
  parseInventoryId,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime,
  requireAdminSession
} from "../../../../../lib/admin/api";

type RouteContext = { params: Promise<{ inventoryId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId: rawInventoryId } = await context.params;
    const inventoryId = parseInventoryId(rawInventoryId);
    const configuration = getAdminPublicConfiguration();
    if (!configuration.configured) {
      const item = sampleInventory.find((candidate) => candidate.inventoryId === inventoryId);
      return item === undefined
        ? noStoreJson({ error: { code: "NOT_FOUND", message: "Sample inventory item not found" } }, { status: 404 })
        : noStoreJson({ configuration, record: { item, revision: 0 } });
    }
    const runtime = requireAdminRuntime();
    await requireAdminSession(request, runtime, "inventory:read");
    const record = await runtime.inventory.get(inventoryId);
    return record === null
      ? noStoreJson({ error: { code: "NOT_FOUND", message: "Inventory item not found" } }, { status: 404 })
      : noStoreJson({ configuration, record });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId } = await context.params;
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "inventory:update");
    const body = await readJsonObject(request);
    const record = await runtime.inventory.update(
      parseInventoryId(inventoryId),
      body.item,
      parseExpectedRevision(body.expectedRevision),
      createInventoryActor(session)
    );
    return noStoreJson({ record });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId } = await context.params;
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "inventory:delete");
    const body = await readJsonObject(request);
    await runtime.inventory.delete(
      parseInventoryId(inventoryId),
      parseExpectedRevision(body.expectedRevision),
      createInventoryActor(session)
    );
    return noStoreJson({ ok: true });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
