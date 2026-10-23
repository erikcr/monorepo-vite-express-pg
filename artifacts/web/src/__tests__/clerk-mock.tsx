import type { ReactNode } from "react";

// Stand-in for @clerk/react in component tests: `clerk.signedIn` decides what <Show> renders.
// Use with: vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));
export const clerk = { signedIn: false };

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
// The account menu, open: its custom actions as buttons.
export const UserButton = Object.assign(
  ({ children }: { children?: ReactNode }) => (
    <span>
      <button type="button">user menu</button>
      {children}
    </span>
  ),
  {
    MenuItems: ({ children }: { children: ReactNode }) => <>{children}</>,
    Action: ({ label, onClick }: { label: string; onClick?: () => void }) => (
      <button type="button" onClick={onClick}>
        {label}
      </button>
    ),
  }
);
export const UserProfile = () => <p>clerk user profile</p>;
export const SignOutButton = ({ children }: { children: ReactNode }) => <>{children}</>;
export const getToken = async () => null;
export const ClerkProvider = ({ children }: { children: ReactNode }) => <>{children}</>;
