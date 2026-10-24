import { RedirectToSignIn, Show } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEnterOrg, useOrgOnScreen } from "../active-org.ts";

/**
 * /o/<handle>/…: the org scope. Resolves the handle against the person's memberships and makes
 * that org the one requests are for; its pages render only once they are.
 */
export function OrgLayout() {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <OrgScope />
    </Show>
  );
}

function OrgScope() {
  const { me, org, ready } = useOrgOnScreen();
  useEnterOrg(org);

  if (me.isLoading) return <p className="px-page-x py-page-y text-text-muted text-sm">Loading…</p>;
  if (me.error) {
    return (
      <p className="px-page-x py-page-y text-destructive text-sm">
        Couldn't load your account: {me.error.message}
      </p>
    );
  }
  if (!org) return <NoSuchOrg />;
  return ready ? <Outlet /> : null;
}

// One answer for a handle that doesn't exist and one the person can't reach, so it doesn't say
// which. Never a silent switch to another org.
function NoSuchOrg() {
  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Not found, or you don't have access</h1>
      <p className="text-text-muted text-sm mb-4">
        There's no organization here that you belong to. If you were sent this link, ask for an
        invitation.
      </p>
      <Link to="/app" className="text-brand text-sm underline">
        Go to your organizations
      </Link>
    </main>
  );
}
