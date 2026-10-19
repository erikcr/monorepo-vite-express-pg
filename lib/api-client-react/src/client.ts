// Browser: use VITE_API_URL if set (production), else "" (dev proxy handles routing)
// Node (tests/SSR): use API_URL env var
const viteEnv = (import.meta as { env?: { VITE_API_URL?: string; PROD?: boolean } }).env;
const nodeApiUrl = (globalThis as { process?: { env: { API_URL?: string } } }).process?.env.API_URL;

/** Checks VITE_API_URL once, at load: a malformed value throws; a missing one in a production
 * build (e.g. a PR preview) logs, since API calls would otherwise silently hit the site's origin. */
export function resolveBrowserApiBase(value: string | undefined, production: boolean): string {
  if (value) {
    if (!/^https?:\/\/[^/]+(\/.*)?$/.test(value) || value.endsWith("/")) {
      throw new Error(
        `VITE_API_URL must be an absolute http(s) URL without a trailing slash, got "${value}"`
      );
    }
    return value;
  }
  if (production) {
    console.error(
      "VITE_API_URL is not set in this build: API calls go to this site's own origin and will fail."
    );
  }
  return "";
}

const API_BASE =
  typeof window !== "undefined"
    ? resolveBrowserApiBase(viteEnv?.VITE_API_URL, viteEnv?.PROD === true)
    : (nodeApiUrl ?? "http://localhost:3000");

/** A non-2xx API response. `code` is the API's machine-readable reason (e.g. "org_required"). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown
  ) {
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${status})`;
    super(message);
    this.name = "ApiError";
  }

  get code(): string | undefined {
    const { body } = this;
    return typeof body === "object" &&
      body !== null &&
      "code" in body &&
      typeof body.code === "string"
      ? body.code
      : undefined;
  }
}

/** Tells Orval what generated hooks' errors really are: apiFetch throws ApiError for every non-2xx. */
export type ErrorType<_Body> = ApiError;

interface ClientConfig {
  /** The session token to send as `Authorization: Bearer`, or null when signed out. */
  getToken?: () => Promise<string | null>;
  /** The org to act in, sent as `X-Org-Id` (the API checks it against your memberships). */
  getOrgId?: () => string | null;
}

let config: ClientConfig = {};

/**
 * Plugs the app's identity provider and org selection into every request. Each app calls this
 * once at startup (with Clerk's getToken); this package stays provider-agnostic.
 */
export function configureApiClient(next: ClientConfig): void {
  config = next;
}

// Orval mutator — generated hooks build the URL (path + query string) and RequestInit
// (method, headers, JSON body, signal), and expect the parsed response body back.
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  // If the identity provider can't produce a token (down, blocked, failed to load), carry on
  // signed out: public endpoints still work, and the API refuses the rest.
  const token = await config.getToken?.().catch(() => null);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const orgId = config.getOrgId?.();
  if (orgId) headers.set("X-Org-Id", orgId);

  const res = await fetch(`${API_BASE}${url}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      // not JSON: keep the text
    }
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
