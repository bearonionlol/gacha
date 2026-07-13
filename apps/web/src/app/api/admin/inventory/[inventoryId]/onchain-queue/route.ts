import { type InventoryOnchainAction } from "@gacha/inventory";
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
  requireAdminRuntime,
  requireAdminSession
} from "../../../../../../lib/admin/api";

const supportedActions: readonly InventoryOnchainAction[] = ["anchor_metadata", "publish_drop"];
type RouteContext = { params: Promise<{ inventoryId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId } = await context.params;
    const runtime = requireAdminRuntime();
    await requireAdminSession(request, runtime, "audit:read");
    const operations = await runtime.inventory.listOnchainOperations(parseInventoryId(inventoryId), 100);
    return noStoreJson({ operations });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { inventoryId } = await context.params;
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "onchain:queue");
    const body = await readJsonObject(request);
    if (runtime.config.onchainQueue === null) {
      throw new AdminApiError(503, "MAINNET_QUEUE_DISABLED", "The multisig production operation queue is not configured");
    }
    if (typeof body.action !== "string" || !supportedActions.includes(body.action as InventoryOnchainAction)) {
      throw new AdminApiError(400, "INVALID_ACTION", "action must be anchor_metadata or publish_drop");
    }
    const operation = await runtime.inventory.queueOnchainOperation(
      parseInventoryId(inventoryId),
      body.action as InventoryOnchainAction,
      parseExpectedRevision(body.expectedRevision),
      createInventoryActor(session),
      runtime.config.onchainQueue.multisigAddress
    );
    return noStoreJson({ operation }, { status: 202 });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
