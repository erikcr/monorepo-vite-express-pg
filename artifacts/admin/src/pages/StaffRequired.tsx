import { SignOutButton } from "@clerk/react";

// The admin API answers 403 for signed-in people without an active staff grant, and for staff
// whose session has no second factor from the last 12 hours (code "second_factor_required").
export function StaffRequired({ code }: { code: string | undefined }) {
  const needsFactor = code === "second_factor_required";
  return (
    <main className="px-page-x py-page-y max-w-xl">
      <h1 className="font-semibold mb-2">
        {needsFactor ? "Second factor required" : "Staff access required"}
      </h1>
      <p className="text-text-muted text-sm mb-4">
        {needsFactor
          ? "Staff must have signed in with a second factor in the last 12 hours. Sign in again with it (set one up in your account first if you haven't)."
          : "This account doesn't have staff access. Ask a staff admin to grant it (pnpm staff:grant)."}
      </p>
      <SignOutButton>
        <button type="button" className="bg-brand text-brand-fg rounded-button px-4 py-2 text-sm">
          Sign out
        </button>
      </SignOutButton>
    </main>
  );
}
