import { SignIn } from "@clerk/react";
import { Loading, Page } from "../components/ui.tsx";

// After signing in, back to the page that sent the person here (<RedirectToSignIn> puts it in the
// address as redirect_url), or /app if none did. A forceRedirectUrl would beat redirect_url, so a
// signed-out invitee would lose their invitation and a link to a settings section its section.
export function SignInPage() {
  return (
    <Page className="flex justify-center">
      <SignIn fallback={<Loading />} routing="path" path="/sign-in" fallbackRedirectUrl="/app" />
    </Page>
  );
}
