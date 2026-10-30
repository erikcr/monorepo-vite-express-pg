import { UserProfile } from "@clerk/react";
import { useLayoutEffect, useState } from "react";
import { SettingsSection } from "./SettingsSection.tsx";

// Clerk's card fills the section, and its own navigation is hidden: Profile and Security are
// sections of the dialog (docs/UI.md), so there's one list of places, not two.
const appearance = {
  elements: {
    rootBox: { width: "100%" },
    cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none", border: "none" },
    navbar: { display: "none" },
    // Clerk sets this one in a media query, which outranks a plain value.
    navbarMobileMenuRow: { display: "none !important" },
    footer: { display: "none" },
  },
};

/** Settings → Profile: Clerk keeps the person's name, photo and email addresses. */
export function ProfileSection() {
  return (
    <SettingsSection title="Profile" description="Your name, photo and email addresses">
      <UserProfile routing="hash" appearance={appearance} />
    </SettingsSection>
  );
}

/** Settings → Security: Clerk keeps the person's password, second factor and active devices. */
export function SecuritySection() {
  // Clerk picks its page from the address's hash, read when it mounts.
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    window.history.replaceState(window.history.state, "", "#/security");
    setReady(true);
  }, []);
  return (
    <SettingsSection title="Security" description="Your password, second factor and active devices">
      {ready && <UserProfile routing="hash" appearance={appearance} />}
    </SettingsSection>
  );
}
