// Browser: use VITE_API_URL if set (production), else "" (dev proxy handles routing)
// Node (tests/SSR): use API_URL env var
const viteApiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
const nodeApiUrl = (globalThis as { process?: { env: { API_URL?: string } } }).process?.env.API_URL;
const API_BASE =
  typeof window !== "undefined" ? (viteApiUrl ?? "") : (nodeApiUrl ?? "http://localhost:3000");

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
