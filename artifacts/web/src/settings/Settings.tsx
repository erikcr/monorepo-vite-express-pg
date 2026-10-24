import { RedirectToSignIn, Show } from "@clerk/react";
import { getGetMeQueryKey } from "@repo/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useOrgOnScreen } from "../active-org.ts";
import { MembersSection } from "./MembersSection.tsx";
import { OrganizationSection } from "./OrganizationSection.tsx";
import { ProfileSection } from "./ProfileSection.tsx";
import { SettingsDialog, type SettingsNavItem } from "./SettingsDialog.tsx";

/** Every settings section, in the order the dialog lists them. */
export const SETTINGS_SECTIONS = ["organization", "members", "profile"] as const;
type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number];

// The org's sections are listed under its name, so nobody changes settings for the wrong org.
const orgSections = (orgName: string): SettingsNavItem<SettingsSectionId>[] => [
  { id: "organization", label: "Organization", group: orgName },
  { id: "members", label: "Members", group: orgName },
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

/** Opens settings over the current page, on no section in particular. */
export function useOpenSettings() {
  const navigate = useNavigate();
  return () => navigate({ to: ".", search: (prev) => ({ ...prev, settings: "" }) });
}

/**
 * ⌘, (Ctrl+, off a Mac) opens settings from anywhere, as in most desktop apps. Rendered only for
 * someone signed in; while settings are open it does nothing.
 */
export function SettingsShortcut() {
  const open = useOpenSettings();
  const isOpen = root.useSearch({ select: (s) => s.settings !== undefined });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "," || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (!isOpen) open();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, isOpen]);
  return null;
}

function SettingsForPerson({ requested }: { requested: SettingsSectionId | "" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // Org settings are for the org on screen, so they're never for the wrong one; over a page
  // outside an org there's only "You".
  const { me, org: active, ready } = useOrgOnScreen();

  const show = (settings: SettingsSectionId | "") =>
    navigate({ to: ".", search: (prev) => ({ ...prev, settings }), replace: true });
  const close = () =>
    navigate({ to: ".", search: ({ settings: _, ...rest }) => rest, replace: true });

  // The org's sections only for someone in one; a section they can't use opens none.
  const sections = me.data ? [...(active ? orgSections(active.name) : []), ...YOU] : [];
  const activeId = sections.find((s) => s.id === requested)?.id ?? null;
  const shownId = activeId ?? sections[0]?.id;

  // After leaving or deleting the org: refetch /me first, so the org that's gone can't be opened
  // again from the old list, then go home, which opens the first org left (or the create form).
  const leftOrg = async () => {
    await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
    await navigate({ to: "/app" });
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
      {/* Org sections mount only once requests carry the org's X-Org-Id. */}
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
