import { Show, UserButton } from "@clerk/react";
import { reportError } from "@repo/api-client-react/errors";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  type RouterHistory,
} from "@tanstack/react-router";
import { z } from "zod";
import { AboutPage } from "./pages/AboutPage.tsx";
import { AppPage } from "./pages/AppPage.tsx";
import { CrashScreen } from "./pages/CrashScreen.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { InvitePage } from "./pages/InvitePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OrgHomePage } from "./pages/OrgHomePage.tsx";
import { OrgLayout } from "./pages/OrgLayout.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";
import {
  SETTINGS_SECTIONS,
  Settings,
  SettingsShortcut,
  useOpenSettings,
} from "./settings/Settings.tsx";

// Route loaders get the QueryClient, so they can prefetch into the same cache the hooks read.
export interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const openSettings = useOpenSettings();
  const link = "text-text-muted hover:text-text";
  const active = { className: "text-text font-medium" };
  return (
    <>
      <nav className="px-page-x pt-4 flex items-center gap-4 text-sm max-w-xl mx-auto">
        <Link to="/" className={link} activeProps={active} activeOptions={{ exact: true }}>
          Home
        </Link>
        <Link to="/about" className={link} activeProps={active}>
          About
        </Link>
        <Link to="/app" className={link} activeProps={active}>
          App
        </Link>
        <span className="ml-auto">
          <Show when="signed-in">
            {/* Settings open from the account menu, over the page (docs/UI.md). Clerk's own
                "Manage account" is hidden: its profile is the Profile section. */}
            <UserButton
              appearance={{
                elements: { userButtonPopoverActionButton__manageAccount: { display: "none" } },
              }}
            >
              <UserButton.MenuItems>
                <UserButton.Action
                  label="Settings"
                  labelIcon={<GearIcon />}
                  onClick={openSettings}
                />
              </UserButton.MenuItems>
            </UserButton>
            <SettingsShortcut />
          </Show>
          <Show when="signed-out">
            <Link to="/sign-in/$" params={{ _splat: "" }} className={link}>
              Sign in
            </Link>
          </Show>
        </span>
      </nav>
      <Outlet />
      <Settings />
    </>
  );
}

const GearIcon = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" aria-hidden>
    <circle cx="8" cy="8" r="2.5" strokeWidth="1.5" />
    <path
      d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  // ?settings=<section> opens the settings dialog over any page; an unknown section opens it
  // with none chosen.
  validateSearch: z.object({
    settings: z
      .enum([...SETTINGS_SECTIONS, ""])
      .optional()
      .catch(""),
  }),
  notFoundComponent: NotFoundPage,
});

// Declare each route as its own const: createRoute() calls written inline in addChildren([...])
// lose their path types, and <Link to> silently accepts any string.
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/about",
  component: AboutPage,
});

// Home for someone signed in: it opens one of their orgs.
const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app", component: AppPage });
// The org scope: the org's places sit under /o/<handle>, and its layout makes it the org that
// requests are for.
const orgRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/o/$org",
  component: OrgLayout,
});
const orgHomeRoute = createRoute({
  getParentRoute: () => orgRoute,
  path: "/",
  component: OrgHomePage,
});
// Invitation emails link here, with the token after the #.
const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/invite",
  component: InvitePage,
});
// Clerk's sign-in renders its own steps under /sign-in/… (factor-one, verify, …).
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in/$",
  component: SignInPage,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  aboutRoute,
  appRoute,
  orgRoute.addChildren([orgHomeRoute]),
  inviteRoute,
  signInRoute,
]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    defaultPreload: "intent",
    // Render errors inside routes: report them, show the crash screen with a retry.
    defaultOnCatch: (error, info) => reportError("web", error, info.componentStack),
    defaultErrorComponent: ({ reset }) => <CrashScreen onRetry={reset} />,
  });
}

// Registers the route tree so <Link to>, params and search are type-checked app-wide.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
