import { RedirectToSignIn, Show } from "@clerk/react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useOrgOnScreen } from "../active-org.ts";
import { Loading, Page, PageTitle } from "../components/ui.tsx";
import { getLastOrgId } from "../org.ts";
import { CreateOrgForm } from "./CreateOrgForm.tsx";

/**
 * /app: home for someone signed in. Opens the org they used last, if they still belong to it,
 * else their first; someone in none is asked to create one.
 */
export function AppPage() {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <Home />
    </Show>
  );
}

function Home() {
  const navigate = useNavigate();
  const {
    me: { isLoading, error },
    orgs,
  } = useOrgOnScreen();

  if (isLoading) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }
  if (error) {
    return (
      <Page>
        <p className="text-destructive text-sm">Couldn't load your account: {error.message}</p>
      </Page>
    );
  }

  const lastId = getLastOrgId();
  const org = orgs.find((o) => o.id === lastId) ?? orgs[0];
  if (org) return <Navigate to="/o/$org" params={{ org: org.handle }} replace />;

  return (
    <Page>
      <PageTitle>Create your organization</PageTitle>
      <CreateOrgForm
        onCreated={(created) => navigate({ to: "/o/$org", params: { org: created.handle } })}
      />
    </Page>
  );
}
