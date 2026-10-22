import { RedirectToSignIn, Show } from "@clerk/react";
import {
  getGetMeQueryKey,
  getListInvitationsInfiniteQueryKey,
  getListOrgMembersInfiniteQueryKey,
  type OrgMembership,
  type OrgRole,
  useCreateInvitation,
  useListInvitationsInfinite,
  useListOrgMembersInfinite,
  useRemoveOrgMember,
  useRevokeInvitation,
  useUpdateOrgMember,
} from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useActiveOrg } from "../active-org.ts";

export function MembersPage() {
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <Members />
    </Show>
  );
}

const input = "bg-surface border border-border rounded-input px-3 py-2 text-sm";
const button = "bg-brand text-brand-fg rounded-button px-4 py-2 text-sm disabled:opacity-50";
const section = "bg-surface-raised border border-border rounded-card p-5 mt-6";
const heading = "text-sm font-semibold uppercase tracking-wide text-text-muted mb-4";
const ROLE_LABELS: Record<OrgRole, string> = { org_admin: "Admin", org_member: "Member" };
const paging = {
  getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
};

function Members() {
  const { me, active, ready } = useActiveOrg();

  if (me.isLoading) return <p className="px-page-x py-page-y text-text-muted text-sm">Loading…</p>;
  if (me.error) {
    return (
      <p className="px-page-x py-page-y text-destructive text-sm">
        Couldn't load your account: {me.error.message}
      </p>
    );
  }
  if (!active) {
    return (
      <main className="px-page-x py-page-y max-w-xl mx-auto text-sm">
        <p className="mb-2">You don't belong to an organization yet.</p>
        <Link to="/app" className="underline">
          Create one
        </Link>
      </main>
    );
  }

  return (
    <main className="px-page-x py-page-y max-w-xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Members of {active.name}</h1>
        <Link to="/app" className="text-sm text-text-muted hover:text-text">
          Back to {active.name}
        </Link>
      </div>
      {/* Mounted only once the selection matches, so requests carry the right X-Org-Id. */}
      {ready && (
        <>
          <MemberList key={active.id} org={active} myId={me.data?.user.id} />
          <Invitations key={`invitations-${active.id}`} org={active} />
        </>
      )}
    </main>
  );
}

function MemberList({ org, myId }: { org: OrgMembership; myId: string | undefined }) {
  const queryClient = useQueryClient();
  const isAdmin = org.role === "org_admin";
  const list = useListOrgMembersInfinite({}, { query: paging });
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListOrgMembersInfiniteQueryKey() }),
      // A change to your own role changes what /me says you may do.
      queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() }),
    ]);
  const update = useUpdateOrgMember({ mutation: { onSuccess: refresh } });
  const remove = useRemoveOrgMember({ mutation: { onSuccess: refresh } });
  const members = list.data?.pages.flatMap((page) => page.items) ?? [];
  const error = update.error ?? remove.error;

  return (
    <section className={section}>
      <h2 className={heading}>Members</h2>
      {list.isLoading && <p className="text-text-muted text-sm">Loading…</p>}
      {list.error && <p className="text-destructive text-sm">{list.error.message}</p>}
      {error && <p className="text-destructive text-sm mb-2">{error.message}</p>}
      <ul className="divide-y divide-border-subtle">
        {members.map((m) => {
          const label = m.name || m.email;
          const you = m.userId === myId;
          return (
            <li key={m.userId} className="py-2 text-sm flex items-center justify-between gap-3">
              <span>
                {label}
                {you && <span className="text-text-muted"> (you)</span>}
                {m.name && <span className="block text-text-muted">{m.email}</span>}
              </span>
              <span className="flex items-center gap-2">
                {isAdmin ? (
                  <select
                    aria-label={`Role of ${label}`}
                    className={input}
                    value={m.role}
                    disabled={update.isPending}
                    onChange={(e) =>
                      update.mutate({ userId: m.userId, data: { role: e.target.value as OrgRole } })
                    }
                  >
                    <option value="org_admin">{ROLE_LABELS.org_admin}</option>
                    <option value="org_member">{ROLE_LABELS.org_member}</option>
                  </select>
                ) : (
                  <span className="text-text-muted">{ROLE_LABELS[m.role]}</span>
                )}
                {/* You leave an org from its page, rather than removing yourself here. */}
                {isAdmin && !you && (
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    className="text-destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate({ userId: m.userId })}
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          );
        })}
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

function Invitations({ org }: { org: OrgMembership }) {
  const queryClient = useQueryClient();
  const isAdmin = org.role === "org_admin";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrgRole>("org_member");
  const list = useListInvitationsInfinite({}, { query: paging });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListInvitationsInfiniteQueryKey() });
  const invite = useCreateInvitation({
    mutation: {
      onSuccess: () => {
        setEmail("");
        return refresh();
      },
    },
  });
  const revoke = useRevokeInvitation({ mutation: { onSuccess: refresh } });
  const invitations = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className={section}>
      <h2 className={heading}>Invitations</h2>
      {isAdmin && (
        <form
          className="flex flex-wrap gap-2 mb-4"
          onSubmit={(e) => {
            e.preventDefault();
            invite.mutate({ data: { email, role } });
          }}
        >
          <input
            type="email"
            aria-label="Email address"
            placeholder="name@example.com"
            className={`${input} flex-1`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
          />
          <select
            aria-label="Role"
            className={input}
            value={role}
            onChange={(e) => setRole(e.target.value as OrgRole)}
          >
            <option value="org_member">{ROLE_LABELS.org_member}</option>
            <option value="org_admin">{ROLE_LABELS.org_admin}</option>
          </select>
          <button type="submit" className={button} disabled={invite.isPending}>
            Invite
          </button>
        </form>
      )}
      {invite.error && <p className="text-destructive text-sm mb-2">{invite.error.message}</p>}
      {revoke.error && <p className="text-destructive text-sm mb-2">{revoke.error.message}</p>}
      {list.isLoading && <p className="text-text-muted text-sm">Loading…</p>}
      {list.error && <p className="text-destructive text-sm">{list.error.message}</p>}
      {!list.isLoading && !list.error && invitations.length === 0 && (
        <p className="text-text-muted text-sm">No pending invitations.</p>
      )}
      <ul className="divide-y divide-border-subtle">
        {invitations.map((i) => {
          const expired = new Date(i.expiresAt).getTime() <= Date.now();
          return (
            <li key={i.id} className="py-2 text-sm flex items-center justify-between gap-3">
              <span>
                {i.email}
                <span className="block text-text-muted">
                  {ROLE_LABELS[i.role]} ·{" "}
                  {expired
                    ? "Expired: invite again to send a new link"
                    : `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
                </span>
              </span>
              {isAdmin && (
                <button
                  type="button"
                  aria-label={`Revoke invitation for ${i.email}`}
                  className="text-destructive"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate({ id: i.id })}
                >
                  Revoke
                </button>
              )}
            </li>
          );
        })}
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
