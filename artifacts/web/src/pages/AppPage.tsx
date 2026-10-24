import { RedirectToSignIn, Show } from "@clerk/react";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useOrgOnScreen } from "../active-org.ts";
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

  if (isLoading) return <p className="px-page-x py-page-y text-text-muted text-sm">Loading…</p>;
  if (error) {
    return (
      <p className="px-page-x py-page-y text-destructive text-sm">
        Couldn't load your account: {error.message}
      </p>
    );
  }

  const lastId = getLastOrgId();
  const org = orgs.find((o) => o.id === lastId) ?? orgs[0];
  if (org) return <Navigate to="/o/$org" params={{ org: org.handle }} replace />;

  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Create your organization</h1>
      <CreateOrgForm
        onCreated={(created) => navigate({ to: "/o/$org", params: { org: created.handle } })}
      />
    </main>
  );
}
