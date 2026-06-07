// Browser: use VITE_API_URL if set (production), else "" (dev proxy handles routing)
// Node (tests/SSR): use API_URL env var
const viteApiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
const API_BASE =
  typeof window !== "undefined"
    ? (viteApiUrl ?? "")
    : (process.env.API_URL ?? "http://localhost:3000");

// Orval mutator interface — generated hooks call apiFetch with this shape.
export interface RequestConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  data?: unknown;
  signal?: AbortSignal;
}

export async function apiFetch<T>(
  { url, method, headers, params, data, signal }: RequestConfig,
  _options?: unknown,
): Promise<T> {
  const queryString =
    params && Object.keys(params).length > 0
      ? "?" + new URLSearchParams(params as Record<string, string>).toString()
      : "";

  const res = await fetch(`${API_BASE}${url}${queryString}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: data !== undefined ? JSON.stringify(data) : undefined,
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}
