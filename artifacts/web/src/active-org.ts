import { getGetMeQueryKey, useGetMe } from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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

/**
 * Moves to another org (or to none): drops every cached response except /me, so nothing from
 * the previous org can show.
 */
export function useSwitchOrg() {
  const queryClient = useQueryClient();
  return (orgId: string | null) => {
    selectOrg(orgId);
    const meKey = getGetMeQueryKey()[0];
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey });
  };
}
