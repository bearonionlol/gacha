export class AdminClientError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly currentRevision: number | null = null
  ) {
    super(message);
    this.name = "AdminClientError";
  }
}

type AdminRequestOptions = {
  body?: unknown;
  csrfToken?: string | null;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
};

export async function adminRequest<T>(path: string, options: AdminRequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers = new Headers({ Accept: "application/json" });
  if (method !== "GET") headers.set("Content-Type", "application/json");
  if (options.csrfToken !== undefined && options.csrfToken !== null) {
    headers.set("X-Admin-CSRF", options.csrfToken);
  }
  const response = await fetch(path, {
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
    credentials: "same-origin",
    headers,
    method
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: { code?: unknown; currentRevision?: unknown; message?: unknown } }).error
      : undefined;
    throw new AdminClientError(
      typeof error?.message === "string" ? error.message : `Admin request failed (${response.status})`,
      typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
      response.status,
      typeof error?.currentRevision === "number" ? error.currentRevision : null
    );
  }
  return payload as T;
}
