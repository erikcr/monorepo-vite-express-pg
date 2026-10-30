import { useUser } from "@clerk/react";
import { Link } from "@tanstack/react-router";
import { SettingsShortcut, useOpenSettings } from "../settings/Settings.tsx";
import { AccountMenu, AccountMenuSkeleton } from "./AccountMenu.tsx";

const link = "text-text-muted hover:text-text";
const active = { className: "text-text font-medium" };

function Account() {
  const { isLoaded, isSignedIn } = useUser();
  // Settings open from the account menu, over the page (docs/UI.md).
  const openSettings = useOpenSettings();
  if (!isLoaded) return <AccountMenuSkeleton />;
  if (!isSignedIn) {
    return (
      <Link to="/sign-in/$" params={{ _splat: "" }} className={link}>
        Sign in
      </Link>
    );
  }
  return (
    <>
      <AccountMenu items={[{ label: "Settings", onSelect: openSettings }]} />
      <SettingsShortcut />
    </>
  );
}

/** The top bar. Its height is fixed, so nothing below it moves as it fills in. */
export function Header() {
  return (
    <header className="h-header shrink-0 border-b border-border">
      <nav
        aria-label="Main"
        className="h-full max-w-content mx-auto px-page-x flex items-center gap-4 text-sm"
      >
        <Link to="/" className={link} activeProps={active} activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/about" className={link} activeProps={active}>
          About
        </Link>
        <Link to="/app" className={link} activeProps={active}>
          App
        </Link>
        <span className="ml-auto flex items-center">
          <Account />
        </span>
      </nav>
    </header>
  );
}
