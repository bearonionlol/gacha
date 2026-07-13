import { NextRequest } from "next/server";

import {
  adminSessionCookieName,
  getSessionToken,
  handleAdminApiError,
  noStoreJson,
  readJsonObject,
  requireAdminMutation,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    await requireAdminMutation(request, runtime, "inventory:read");
    await readJsonObject(request);
    const sessionToken = getSessionToken(request);
    if (sessionToken !== null) await runtime.auth.revokeSession(sessionToken);
    const response = noStoreJson({ ok: true });
    response.cookies.set(adminSessionCookieName, "", {
      httpOnly: true,
      maxAge: 0,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    return handleAdminApiError(error);
  }
}
