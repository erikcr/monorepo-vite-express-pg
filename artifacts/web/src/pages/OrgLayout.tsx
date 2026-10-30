import { RedirectToSignIn, Show } from "@clerk/react";
import { Link, Outlet } from "@tanstack/react-router";
import { useEnterOrg, useOrgOnScreen } from "../active-org.ts";
import { Loading, Page, PageTitle } from "../components/ui.tsx";

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

  if (me.isLoading) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (me.error) {
    return (
      <Page>
        <p className="text-destructive text-sm">Couldn't load your account: {me.error.message}</p>
      </Page>
    );
  }
  if (!org) return <NoSuchOrg />;
  if (!ready) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  return <Outlet />;
}

// One answer for a handle that doesn't exist and one the person can't reach, so it doesn't say
// which. Never a silent switch to another org.
function NoSuchOrg() {
  return (
    <Page>
      <PageTitle description="There's no organization here that you belong to. If you were sent this link, ask for an invitation.">
        Not found, or you don't have access
      </PageTitle>
      <Link to="/app" className="text-brand text-sm underline">
        Go to your organizations
      </Link>
    </Page>
  );
}
