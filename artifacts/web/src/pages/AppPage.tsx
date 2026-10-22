import { RedirectToSignIn, Show } from "@clerk/react";
import {
  getGetMeQueryKey,
  getListExamplesInfiniteQueryKey,
  type OrgMembership,
  useCreateExample,
  useCreateOrg,
  useGetMe,
  useListExamplesInfinite,
} from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useState } from "react";
import { selectOrg, useSelectedOrgId } from "../org.ts";

export function AppPage() {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <Workspace />
    </Show>
  );
}

const input = "bg-surface border border-border rounded-input px-3 py-2 text-sm";
const button = "bg-brand text-brand-fg rounded-button px-4 py-2 text-sm disabled:opacity-50";

function Workspace() {
  const queryClient = useQueryClient();
  const { data: me, isLoading, error } = useGetMe();
  const selectedId = useSelectedOrgId();
  const [creating, setCreating] = useState(false);

  const orgs = me?.orgs ?? [];
  // The remembered org if the person still belongs to it, else their first.
  const active = orgs.find((o) => o.id === selectedId) ?? orgs[0];
  useEffect(() => {
    if (active && active.id !== selectedId) selectOrg(active.id);
  }, [active, selectedId]);

  const switchTo = (orgId: string) => {
    selectOrg(orgId);
    // Drop every cached response except /me, so nothing from the previous org can show.
    const meKey = getGetMeQueryKey()[0];
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey });
  };

  if (isLoading) return <p className="px-page-x py-page-y text-text-muted text-sm">Loading…</p>;
  if (error) {
    return (
      <p className="px-page-x py-page-y text-destructive text-sm">
        Couldn't load your account: {error.message}
      </p>
    );
  }

  if (!active || creating) {
    return (
      <main className="px-page-x py-page-y max-w-xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">
          {active ? "New organization" : "Create your organization"}
        </h1>
        <CreateOrgForm
          onCreated={(org) => {
            setCreating(false);
            switchTo(org.id);
          }}
        />
        {active && (
          <button
            type="button"
            className="text-sm text-text-muted mt-3"
            onClick={() => setCreating(false)}
          >
            Cancel
          </button>
        )}
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
            value={active.id}
            onChange={(e) => switchTo(e.target.value)}
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <h1 className="text-2xl font-bold">{active.name}</h1>
        )}
        <button type="button" className="text-sm text-text-muted" onClick={() => setCreating(true)}>
          New organization
        </button>
      </div>
      {/* Mounted only once the selection matches, so requests carry the right X-Org-Id. */}
      {active.id === selectedId && <ExamplesPanel key={active.id} />}
    </main>
  );
}

function CreateOrgForm({ onCreated }: { onCreated: (org: OrgMembership) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const createOrg = useCreateOrg({
    mutation: {
      onSuccess: async (org) => {
        await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
        onCreated(org);
      },
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    createOrg.mutate({ data: { name } });
  };
  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        aria-label="Organization name"
        placeholder="Organization name"
        className={`${input} flex-1`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        maxLength={100}
      />
      <button type="submit" className={button} disabled={createOrg.isPending}>
        Create
      </button>
    </form>
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
