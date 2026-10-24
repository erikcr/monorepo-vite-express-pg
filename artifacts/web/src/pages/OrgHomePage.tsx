import {
  getListExamplesInfiniteQueryKey,
  useCreateExample,
  useListExamplesInfinite,
} from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useOrgOnScreen } from "../active-org.ts";
import { CreateOrgForm } from "./CreateOrgForm.tsx";

const input = "bg-surface border border-border rounded-input px-3 py-2 text-sm";
const button = "bg-brand text-brand-fg rounded-button px-4 py-2 text-sm disabled:opacity-50";

/** /o/<handle>: the org's home. Its layout (OrgLayout) has already resolved the org. */
export function OrgHomePage() {
  const navigate = useNavigate();
  const { orgs, org } = useOrgOnScreen();
  const [creating, setCreating] = useState(false);
  if (!org) return null;

  if (creating) {
    return (
      <main className="px-page-x py-page-y max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">New organization</h1>
        <CreateOrgForm
          onCreated={(created) => navigate({ to: "/o/$org", params: { org: created.handle } })}
        />
        <button
          type="button"
          className="text-sm text-text-muted mt-3"
          onClick={() => setCreating(false)}
        >
          Cancel
        </button>
      </main>
    );
  }

  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-6">
        {orgs.length > 1 ? (
          <select
            aria-label="Organization"
            className={input}
            value={org.handle}
            onChange={(e) => navigate({ to: "/o/$org", params: { org: e.target.value } })}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.handle}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <h1 className="text-2xl font-bold">{org.name}</h1>
        )}
        <span className="flex items-center gap-4 text-sm">
          <Link
            to="/o/$org"
            params={{ org: org.handle }}
            search={{ settings: "members" }}
            className="text-text-muted hover:text-text"
          >
            Members
          </Link>
          <button type="button" className="text-text-muted" onClick={() => setCreating(true)}>
            New organization
          </button>
        </span>
      </div>
      <ExamplesPanel key={org.id} />
    </main>
  );
}

const examplesPaging = {
  getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
};

function ExamplesPanel() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const list = useListExamplesInfinite({}, { query: examplesPaging });
  const create = useCreateExample({
    mutation: {
      onSuccess: () => {
        setName("");
        return queryClient.invalidateQueries({ queryKey: getListExamplesInfiniteQueryKey() });
      },
    },
  });
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="bg-surface-raised border border-border rounded-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted mb-4">
        Records
      </h2>
      <form
        className="flex gap-2 mb-4"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate({ data: { name } });
        }}
      >
        <input
          aria-label="Record name"
          placeholder="Record name"
          className={`${input} flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={100}
        />
        <button type="submit" className={button} disabled={create.isPending}>
          Add
        </button>
      </form>
      {list.isLoading && <p className="text-text-muted text-sm">Loading…</p>}
      {list.error && <p className="text-destructive text-sm">{list.error.message}</p>}
      {!list.isLoading && items.length === 0 && (
        <p className="text-text-muted text-sm">No records yet.</p>
      )}
      <ul className="divide-y divide-border-subtle">
        {items.map((item) => (
          <li key={item.id} className="py-2 text-sm flex justify-between">
            <span>{item.name}</span>
            <span className="text-text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <button
          type="button"
          className={`${button} mt-3`}
          onClick={() => list.fetchNextPage()}
          disabled={list.isFetchingNextPage}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </section>
  );
}
