import { NextRequest } from "next/server";

import {
  assertAdminOrigin,
  handleAdminApiError,
  getTrustedAdminClientKey,
  noStoreJson,
  parseRequiredString,
  readJsonObject,
  requireAdminRuntime
} from "../../../../../lib/admin/api";

export async function POST(request: NextRequest) {
  try {
    const runtime = requireAdminRuntime();
    const origin = assertAdminOrigin(request, runtime);
    const body = await readJsonObject(request);
    const challenge = await runtime.auth.issueChallenge(
      parseRequiredString(body.walletAddress, "walletAddress"),
      origin,
      getTrustedAdminClientKey(request, runtime)
    );
    return noStoreJson({ challenge });
  } catch (error) {
    return handleAdminApiError(error);
  }
}
