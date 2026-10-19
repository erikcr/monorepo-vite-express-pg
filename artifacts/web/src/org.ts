import { useSyncExternalStore } from "react";

// The org the person is working in. Sent to the API as X-Org-Id (lib/api-client-react's
// configureApiClient), which checks it against their memberships. Remembered per browser.
const KEY = "selectedOrgId";
const listeners = new Set<() => void>();

function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked (private mode, tests): fall back to no selection
  }
}

let selected = stored();

export const getSelectedOrgId = (): string | null => selected;

export function selectOrg(orgId: string | null): void {
  selected = orgId;
  try {
    if (orgId) localStorage.setItem(KEY, orgId);
    else localStorage.removeItem(KEY);
  } catch {
    // not persisted; still selected for this page load
  }
  for (const listener of listeners) listener();
}

export function useSelectedOrgId(): string | null {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, getSelectedOrgId);
}
