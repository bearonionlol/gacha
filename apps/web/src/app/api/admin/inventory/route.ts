import {
  inventoryStatuses,
  sampleInventory,
  supportedBrands,
  type InventoryListQuery
} from "@gacha/inventory";
import { NextRequest } from "next/server";

import { getAdminPublicConfiguration } from "../../../../lib/admin/config";
import {
  createInventoryActor,
  handleAdminApiError,
  noStoreJson,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime,
  requireAdminSession
} from "../../../../lib/admin/api";

const parseListQuery = (request: NextRequest): InventoryListQuery => {
  const search = request.nextUrl.searchParams.get("search")?.trim();
  const brand = request.nextUrl.searchParams.get("brand");
  const status = request.nextUrl.searchParams.get("status");
  const limitValue = request.nextUrl.searchParams.get("limit");
  const offsetValue = request.nextUrl.searchParams.get("offset");
  const limit = limitValue === null ? undefined : Number(limitValue);
  const offset = offsetValue === null ? undefined : Number(offsetValue);
  return {
    ...(search === undefined || search === "" ? {} : { search: search.slice(0, 160) }),
    ...(brand !== null && (supportedBrands as readonly string[]).includes(brand)
      ? { brand: brand as InventoryListQuery["brand"] }
      : {}),
    ...(status !== null && (inventoryStatuses as readonly string[]).includes(status)
      ? { status: status as InventoryListQuery["status"] }
      : {}),
    ...(limit === undefined || !Number.isSafeInteger(limit) ? {} : { limit })
    ,...(offset === undefined || !Number.isSafeInteger(offset) ? {} : { offset })
  };
};

export async function GET(request: NextRequest) {
  const configuration = getAdminPublicConfiguration();
  if (!configuration.configured) {
    return noStoreJson({
      configuration,
      items: sampleInventory.map((item) => ({ item, revision: 0 }))
    });
  }
  try {
    const runtime = requireAdminRuntime();
    await requireAdminSession(request, runtime, "inventory:read");
    const query = parseListQuery(request);
    const [items, total] = await Promise.all([runtime.inventory.list(query), runtime.inventory.count(query)]);
    return noStoreJson({ configuration, items, total });
  } catch (error) {
    return handleAdminApiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    const session = await requireAdminMutation(request, runtime, "inventory:create");
    const body = await readJsonObject(request);
    const record = await runtime.inventory.create(body.item, createInventoryActor(session));
    return noStoreJson({ record }, { status: 201 });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
