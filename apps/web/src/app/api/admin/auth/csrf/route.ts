import { NextRequest } from "next/server";

import {
  assertAdminOrigin,
  getSessionToken,
  handleAdminApiError,
  noStoreJson,
  publicSession,
  readJsonObject,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    assertAdminOrigin(request, runtime);
    await readJsonObject(request);
    const sessionToken = getSessionToken(request);
    if (sessionToken === null) return noStoreJson({ error: { code: "AUTH_REQUIRED", message: "An active admin session is required" } }, { status: 401 });
    const issued = await runtime.auth.issueCsrfToken(sessionToken);
    if (issued === null) return noStoreJson({ error: { code: "AUTH_REQUIRED", message: "The admin session has expired" } }, { status: 401 });
    return noStoreJson({ csrfToken: issued.csrfToken, session: publicSession(issued.session) });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
