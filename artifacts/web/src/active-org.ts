import { useGetMe } from "@repo/api-client-react";
import { useEffect } from "react";
import { selectOrg, useSelectedOrgId } from "./org.ts";

/**
 * The signed-in person (/me) and the org they're working in: the remembered one if they still
 * belong to it, else their first (which becomes the remembered one). `ready` is true once the
 * selection matches `active`, so requests made from then on carry its X-Org-Id: mount org data
 * only when it's true.
 */
export function useActiveOrg() {
  const me = useGetMe();
  const selectedId = useSelectedOrgId();
  const orgs = me.data?.orgs ?? [];
  const active = orgs.find((o) => o.id === selectedId) ?? orgs[0];
  useEffect(() => {
    if (active && active.id !== selectedId) selectOrg(active.id);
  }, [active, selectedId]);
  return { me, orgs, active, ready: active !== undefined && active.id === selectedId };
}
