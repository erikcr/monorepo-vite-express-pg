import { SignIn } from "@clerk/react";

export function SignInPage() {
  return (
    <main className="px-page-x py-page-y flex justify-center">
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" />
    </main>
  );
}
