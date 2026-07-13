import { inventoryStatuses, type InventoryStatus } from "@gacha/inventory";
import { NextRequest } from "next/server";

import {
  AdminApiError,
  createInventoryActor,
  handleAdminApiError,
  noStoreJson,
  parseExpectedRevision,
  parseInventoryId,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime
} from "../../../../../../lib/admin/api";

type RouteContext = { params: Promise<{ inventoryId: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId } = await context.params;
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "inventory:transition");
    const body = await readJsonObject(request);
    if (typeof body.to !== "string" || !(inventoryStatuses as readonly string[]).includes(body.to)) {
      throw new AdminApiError(400, "INVALID_STATUS", "to must be a supported inventory lifecycle status");
    }
    const record = await runtime.inventory.transition(
      parseInventoryId(inventoryId),
      body.to as InventoryStatus,
      parseExpectedRevision(body.expectedRevision),
      createInventoryActor(session),
      {
        adminReviewed: body.adminReviewed === true,
        allowSingleCustodyPhotoOnTestnet: runtime.config.allowSingleCustodyPhotoOnTestnet
      }
    );
    return noStoreJson({ record });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
