import { SignIn } from "@clerk/react";
import { Loading, Page } from "../components/ui.tsx";

export function SignInPage() {
  return (
    <Page className="flex justify-center">
      <SignIn fallback={<Loading />} routing="path" path="/sign-in" forceRedirectUrl="/app" />
    </Page>
  );
}
