import {
  type OrgMembership,
  useDeleteCurrentOrg,
  useLeaveCurrentOrg,
} from "@repo/api-client-react";
import { useState } from "react";
import { Input } from "../components/ui.tsx";
import { SettingsGroup, SettingsSection } from "./SettingsSection.tsx";

/** Settings → Organization: leaving the org (any member) and deleting it (org admins). */
export function OrganizationSection({
  org,
  onGone,
}: {
  org: OrgMembership;
  onGone: () => Promise<void>;
}) {
  const [confirmName, setConfirmName] = useState("");
  const leave = useLeaveCurrentOrg({ mutation: { onSuccess: onGone } });
  const remove = useDeleteCurrentOrg({ mutation: { onSuccess: onGone } });
  const confirmed = confirmName === org.name;

  return (
    <SettingsSection title="Organization" description={`Your membership of ${org.name}`}>
      <SettingsGroup title="Leave">
        <button
          type="button"
          className="border border-border rounded-button px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => leave.mutate()}
          disabled={leave.isPending}
        >
          Leave {org.name}
        </button>
        {leave.error && <p className="text-destructive text-sm mt-2">{leave.error.message}</p>}
      </SettingsGroup>
      {org.role === "org_admin" && (
        <SettingsGroup title="Delete">
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (confirmed) remove.mutate({ data: { confirmName } });
            }}
          >
            <p className="text-sm text-text-muted">
              Deleting the organization removes its records and memberships for good.
            </p>
            <label htmlFor="confirm-org-name" className="text-sm">
              Type <strong>{org.name}</strong> to confirm
            </label>
            <Input
              id="confirm-org-name"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
            />
            <button
              type="submit"
              className="bg-destructive text-destructive-fg rounded-button px-4 py-2 text-sm self-start disabled:opacity-50"
              disabled={!confirmed || remove.isPending}
            >
              Delete organization
            </button>
            {remove.error && <p className="text-destructive text-sm">{remove.error.message}</p>}
          </form>
        </SettingsGroup>
      )}
    </SettingsSection>
  );
}
