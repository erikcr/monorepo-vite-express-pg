// Browser: use VITE_API_URL if set (production), else "" (dev proxy handles routing)
// Node (tests/SSR): use API_URL env var
const viteApiUrl = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL;
const API_BASE =
  typeof window !== "undefined"
    ? (viteApiUrl ?? "")
    : (process.env.API_URL ?? "http://localhost:3000");

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}
