import { RedirectToSignIn, Show } from "@clerk/react";
import { getGetMeQueryKey } from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useActiveOrg, useSwitchOrg } from "../active-org.ts";
import { MembersSection } from "./MembersSection.tsx";
import { OrganizationSection } from "./OrganizationSection.tsx";
import { ProfileSection } from "./ProfileSection.tsx";
import { SettingsDialog, type SettingsNavItem } from "./SettingsDialog.tsx";

/** Every settings section, in the order the dialog lists them. */
export const SETTINGS_SECTIONS = ["organization", "members", "profile"] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

const WORKSPACE: SettingsNavItem<SettingsSectionId>[] = [
  { id: "organization", label: "Organization", group: "Workspace" },
  { id: "members", label: "Members", group: "Workspace" },
];
const YOU: SettingsNavItem<SettingsSectionId>[] = [
  { id: "profile", label: "Profile", group: "You" },
];

const root = getRouteApi("__root__");

/**
 * The settings dialog, over whatever page is open, while the address has `?settings=<section>`
 * (`?settings=` alone opens it with no section chosen). Switching section replaces the address,
 * so one Back leaves settings; closing removes the parameter, so Back doesn't reopen them.
 */
export function Settings() {
  const { settings } = root.useSearch();
  if (settings === undefined) return null;
  return (
    <Show when="signed-in" fallback={<RedirectToSignIn />}>
      <SettingsForPerson requested={settings} />
    </Show>
  );
}

function SettingsForPerson({ requested }: { requested: SettingsSectionId | "" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const switchOrg = useSwitchOrg();
  const { me, active, ready } = useActiveOrg();

  const show = (settings: SettingsSectionId | "") =>
    navigate({ to: ".", search: (prev) => ({ ...prev, settings }), replace: true });
  const close = () =>
    navigate({ to: ".", search: ({ settings: _, ...rest }) => rest, replace: true });

  // The org's sections only for someone in one; a section they can't use opens none.
  const sections = me.data ? [...(active ? WORKSPACE : []), ...YOU] : [];
  const activeId = sections.find((s) => s.id === requested)?.id ?? null;
  const shownId = activeId ?? sections[0]?.id;

  // After leaving or deleting the org: refetch /me first, so the org that's gone can't be picked
  // again from the old list, then close settings on the first org left (or the create form).
  const leftOrg = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    switchOrg(null);
    await close();
  };

  return (
    <SettingsDialog
      sections={sections}
      activeId={activeId}
      onSelect={(id) => show(id ?? "")}
      onClose={close}
    >
      {me.isLoading && <p className="px-6 py-5 text-text-muted text-sm">Loading…</p>}
      {me.error && (
        <p className="px-6 py-5 text-destructive text-sm">
          Couldn't load your account: {me.error.message}
        </p>
      )}
      {/* Org sections mount only once the selection matches, so requests carry its X-Org-Id. */}
      {shownId === "organization" && active && ready && (
        <OrganizationSection key={active.id} org={active} onGone={leftOrg} />
      )}
      {shownId === "members" && active && ready && (
        <MembersSection key={active.id} org={active} myId={me.data?.user.id} />
      )}
      {shownId === "profile" && <ProfileSection />}
    </SettingsDialog>
  );
}
