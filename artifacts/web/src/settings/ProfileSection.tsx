import { UserProfile } from "@clerk/react";
import { SettingsSection } from "./SettingsSection.tsx";

/** Settings → Profile: Clerk keeps the person's name, email addresses and sign-in methods. */
export function ProfileSection() {
  return (
    <SettingsSection title="Profile" description="Your name, email addresses and how you sign in">
      <UserProfile
        routing="hash"
        // Clerk's card has a fixed width of its own; here it fills the section instead.
        appearance={{
          elements: {
            rootBox: { width: "100%" },
            cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none" },
          },
        }}
      />
    </SettingsSection>
  );
}
