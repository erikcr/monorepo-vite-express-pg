import type { ReactNode } from "react";
import { vi } from "vitest";

// Stand-in for @clerk/react in component tests: `clerk.signedIn` decides what <Show> renders.
// Use with: vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));
export const clerk = {
  signedIn: false,
  loaded: true,
  user: {
    fullName: "Ada Lovelace" as string | null,
    primaryEmailAddress: { emailAddress: "ada@x.test" },
    hasImage: false,
    imageUrl: "https://img.clerk.com/ada",
  },
  signOut: vi.fn(),
  openUserProfile: vi.fn(),
};

export function Show({
  when,
  fallback,
  children,
}: {
  when: "signed-in" | "signed-out";
  fallback?: ReactNode;
  children?: ReactNode;
}) {
  const visible = when === "signed-in" ? clerk.signedIn : !clerk.signedIn;
  return <>{visible ? children : (fallback ?? null)}</>;
}

export const RedirectToSignIn = () => <p>redirecting to sign-in</p>;
export const SignIn = () => <p>clerk sign-in form</p>;
export const useUser = () => ({
  isLoaded: clerk.loaded,
  isSignedIn: clerk.signedIn,
  user: clerk.signedIn ? clerk.user : null,
});
export const useClerk = () => ({ signOut: clerk.signOut, openUserProfile: clerk.openUserProfile });
export const UserProfile = () => <p>clerk user profile</p>;
export const SignOutButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const getToken = async () => null;
export const ClerkProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
