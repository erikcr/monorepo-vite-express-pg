import { useSyncExternalStore } from "react";

// The org on screen: the one the address names (/o/<handle>), set by the org scope's layout.
// Sent to the API as X-Org-Id (lib/api-client-react's configureApiClient), which checks it
// against the person's memberships. Kept in memory only, so each tab has its own.
let current: string | null = null;
const listeners = new Set<() => void>();

export const getCurrentOrgId = (): string | null => current;

export function setCurrentOrgId(orgId: string | null): void {
  current = orgId;
  for (const listener of listeners) listener();
}

export function useCurrentOrgId(): string | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getCurrentOrgId);
}

// The last org opened, remembered per browser so /app can return to it. Never sent to the API.
const LAST_KEY = "lastOrgId";

export function getLastOrgId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY);
  } catch {
    return null; // storage blocked (private mode): /app opens the first org
  }
}

export function rememberLastOrg(orgId: string | null): void {
  try {
    if (orgId) localStorage.setItem(LAST_KEY, orgId);
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // not remembered; /app opens the first org
  }
}
