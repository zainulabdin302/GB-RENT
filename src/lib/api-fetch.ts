/**
 * Client-side fetch helpers for the GB Rent SPA.
 * All API calls go through here so we can centralize JSON parsing, error
 * handling, and credentials forwarding (NextAuth cookie).
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Called when any API returns 401. Implemented in stale-session.ts (client
 * only) — clears the cached session and pops the sign-in dialog so the user
 * can re-authenticate instead of seeing a confusing error. Indirected
 * through a window-level handler so api-fetch.ts stays usable from server
 * code (the handler is only registered on the client).
 */
function triggerStaleSession(): void {
  if (typeof window !== "undefined") {
    const handler = (window as unknown as { __gbStaleSession?: () => void }).__gbStaleSession;
    if (handler) handler();
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include", // send next-auth.session-token cookie
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // On 401, the session is stale (e.g. DB re-seeded while the user was
    // signed in). Trigger the stale-session handler so the user is shown a
    // sign-in prompt instead of an error toast.
    if (res.status === 401) triggerStaleSession();
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : typeof data === "string"
          ? data
          : `Request failed (${res.status})`) || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export function buildQuery(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      sp.append(k, v.join(","));
    } else {
      sp.append(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
