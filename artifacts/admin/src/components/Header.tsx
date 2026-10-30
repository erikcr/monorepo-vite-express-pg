import { useClerk, useUser } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { AccountMenu, AccountMenuSkeleton } from "./AccountMenu.tsx";

function Account() {
  const { isLoaded, isSignedIn } = useUser();
  const { openUserProfile } = useClerk();
  if (!isLoaded) return <AccountMenuSkeleton />;
  if (!isSignedIn) return null;
  // Admin has no settings dialog: Clerk's own profile opens in its place. Staff set up their
  // second factor there.
  return <AccountMenu items={[{ label: "Manage account", onSelect: () => openUserProfile() }]} />;
}

/** The top bar. Its height is fixed, so nothing below it moves as it fills in. */
export function Header() {
  return (
    <header className="h-header shrink-0 border-b border-border">
      <nav
        aria-label="Main"
        className="h-full max-w-content mx-auto px-page-x flex items-center gap-4 text-sm"
      >
        <Link
          to="/"
          className="text-text-muted hover:text-text"
          activeProps={{ className: "text-text font-medium" }}
        >
          Dashboard
        </Link>
        <span className="ml-auto flex items-center">
          <Account />
        </span>
      </nav>
    </header>
  );
}
