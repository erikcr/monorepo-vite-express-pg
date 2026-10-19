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

// Orval mutator — generated hooks build the URL (path + query string) and RequestInit
// (method, headers, JSON body, signal), and expect the parsed response body back.
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
