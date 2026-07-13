import { NextRequest } from "next/server";

import { getAdminPublicConfiguration } from "../../../../../lib/admin/config";
import {
  getOptionalAdminSession,
  handleAdminApiError,
  noStoreJson,
  publicSession,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function GET(request: NextRequest) {
  const configuration = getAdminPublicConfiguration();
  if (!configuration.configured) return noStoreJson({ configuration, session: null });
  try {
    const runtime = requireAdminRuntime();
    const session = await getOptionalAdminSession(request, runtime);
    return noStoreJson({ configuration, session: session === null ? null : publicSession(session) });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
