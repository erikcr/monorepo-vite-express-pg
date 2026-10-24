import { getGetMeQueryKey, type OrgMembership, useGetMe } from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { getCurrentOrgId, rememberLastOrg, setCurrentOrgId, useCurrentOrgId } from "./org.ts";

/**
 * The signed-in person (/me) and the org the address names (/o/<handle>), if they belong to it:
 * `org` is undefined off the org scope, and for a handle that doesn't exist or isn't theirs
 * (which look the same). `ready` is true once requests carry its X-Org-Id: mount org data only
 * when it's true.
 */
export function useOrgOnScreen() {
  const me = useGetMe();
  const handle = useParams({ strict: false, select: (p) => p.org });
  const currentId = useCurrentOrgId();
  const orgs = me.data?.orgs ?? [];
  const org =
    handle === undefined ? undefined : orgs.find((o) => o.handle === handle.toLowerCase());
  return { me, orgs, handle, org, ready: org !== undefined && org.id === currentId };
}

/**
 * Makes `org` the one requests are for, and the one /app returns to. Coming from another org, it
 * drops every cached response except /me, so nothing from the previous org can show.
 */
export function useEnterOrg(org: OrgMembership | undefined) {
  const queryClient = useQueryClient();
  const orgId = org?.id;
  useEffect(() => {
    if (!orgId || orgId === getCurrentOrgId()) return;
    const previous = getCurrentOrgId();
    setCurrentOrgId(orgId);
    rememberLastOrg(orgId);
    if (previous) {
      const meKey = getGetMeQueryKey()[0];
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey });
    }
  }, [orgId, queryClient]);
}
