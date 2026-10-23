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
import { useState } from "react";
import { Confirmation, SettingsGroup, SettingsSection } from "./SettingsSection.tsx";
import { useUnsavedChanges } from "./unsaved-changes.ts";

const input = "bg-surface border border-border rounded-input px-3 py-2 text-sm";
const button = "bg-brand text-brand-fg rounded-button px-4 py-2 text-sm disabled:opacity-50";
const ROLE_LABELS: Record<OrgRole, string> = { org_admin: "Admin", org_member: "Member" };
const paging = {
  getNextPageParam: (page: { nextCursor: string | null }) => page.nextCursor ?? undefined,
};

/** Settings → Members: who belongs to the org, their roles, and invitations. */
export function MembersSection({ org, myId }: { org: OrgMembership; myId: string | undefined }) {
  return (
    <SettingsSection title="Members" description={`Who belongs to ${org.name}, and who's invited`}>
      <MemberList org={org} myId={myId} />
      <Invitations org={org} />
    </SettingsSection>
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
    <SettingsGroup title="Members">
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
                {/* You leave an org from Settings → Organization, rather than removing yourself here. */}
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
    </SettingsGroup>
  );
}

function Invitations({ org }: { org: OrgMembership }) {
  const queryClient = useQueryClient();
  const isAdmin = org.role === "org_admin";
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [role, setRole] = useState<OrgRole>("org_member");
  const list = useListInvitationsInfinite({}, { query: paging });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListInvitationsInfiniteQueryKey() });
  const invite = useCreateInvitation({
    mutation: {
      onSuccess: (invitation) => {
        setSentTo(invitation.email);
        setEmail("");
        return refresh();
      },
    },
  });
  const revoke = useRevokeInvitation({ mutation: { onSuccess: refresh } });
  const invitations = list.data?.pages.flatMap((page) => page.items) ?? [];
  // An address typed but not sent is lost on closing, so the dialog asks first.
  useUnsavedChanges(email !== "");

  return (
    <SettingsGroup title="Invitations">
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
            onChange={(e) => {
              setEmail(e.target.value);
              setSentTo(null);
            }}
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
      <Confirmation>{sentTo && `Invitation sent to ${sentTo}`}</Confirmation>
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
    </SettingsGroup>
  );
}
