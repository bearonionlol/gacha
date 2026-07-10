import { NextRequest } from "next/server";

import {
  adminSessionCookieName,
  assertAdminOrigin,
  handleAdminApiError,
  getTrustedAdminClientKey,
  noStoreJson,
  parseRequiredString,
  publicSession,
  readJsonObject,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    const origin = assertAdminOrigin(request, runtime);
    const body = await readJsonObject(request);
    const signature = parseRequiredString(body.signature, "signature");
    const issued = await runtime.auth.verifyChallenge({
      nonce: parseRequiredString(body.nonce, "nonce"),
      origin,
      signature,
      walletAddress: parseRequiredString(body.walletAddress, "walletAddress")
    }, getTrustedAdminClientKey(request, runtime));
    const response = noStoreJson({ csrfToken: issued.csrfToken, session: publicSession(issued.session) });
    response.cookies.set(adminSessionCookieName, issued.sessionToken, {
      httpOnly: true,
      maxAge: runtime.config.sessionTtlSeconds,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production"
    });
    return response;
  } catch (error) {
    return handleAdminApiError(error);
  }
}
