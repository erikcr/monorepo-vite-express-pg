import { SignOutButton } from "@clerk/react";
import { Button, Page, PageTitle } from "../components/ui.tsx";

// The admin API answers 403 for signed-in people without an active staff grant, and for staff
// whose session has no second factor from the last 12 hours (code "second_factor_required").
export function StaffRequired({ code }: { code: string | undefined }) {
  const needsFactor = code === "second_factor_required";
  return (
    <Page>
      <PageTitle
        description={
          needsFactor
            ? "Staff must have signed in with a second factor in the last 12 hours. Sign in again with it (set one up in your account first if you haven't)."
            : "This account doesn't have staff access. Ask a staff admin to grant it (pnpm staff:grant)."
        }
      >
        {needsFactor ? "Second factor required" : "Staff access required"}
      </PageTitle>
      <SignOutButton>
        <Button>Sign out</Button>
      </SignOutButton>
    </Page>
  );
}
