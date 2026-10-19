import { RedirectToSignIn, Show, UserButton } from "@clerk/react";
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
import type { ComponentType } from "react";
import { z } from "zod";
import { CrashScreen } from "./pages/CrashScreen.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";

// Route loaders get the QueryClient, so they can prefetch into the same cache the hooks read.
export interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const link = "text-text-muted hover:text-text";
  return (
    <>
      <nav className="px-page-x pt-3 flex items-center gap-4 text-xs border-b border-border bg-surface-raised pb-3">
        <Link to="/" className={link} activeProps={{ className: "text-text font-medium" }}>
          Dashboard
        </Link>
        <Link to="/settings" className={link} activeProps={{ className: "text-text font-medium" }}>
          Settings
        </Link>
        <span className="ml-auto">
          <Show when="signed-in">
            <UserButton />
          </Show>
        </span>
      </nav>
      <Outlet />
    </>
  );
}

// The whole admin app is for signed-in staff: pages render only with a session (the API then
// checks the staff grant), and anyone else goes to sign-in.
const signedIn = (Page: ComponentType) => () => (
  <Show when="signed-in" fallback={<RedirectToSignIn />}>
    <Page />
  </Show>
);

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

// Declare each route as its own const: createRoute() calls written inline in addChildren([...])
// lose their path types, and <Link to> silently accepts any string.
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Search params are validated like any other input; ?q= filters the org list by name.
  validateSearch: z.object({ q: z.string().max(100).optional().catch(undefined) }),
  component: signedIn(DashboardPage),
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: signedIn(SettingsPage),
});

// Clerk's sign-in renders its own steps under /sign-in/… (factor-one, verify, …).
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in/$",
  component: SignInPage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, settingsRoute, signInRoute]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient },
    history,
    defaultPreload: "intent",
    // Render errors inside routes: report them, show the crash screen with a retry.
    defaultOnCatch: (error, info) => reportError("admin", error, info.componentStack),
    defaultErrorComponent: ({ reset }) => <CrashScreen onRetry={reset} />,
  });
}

// Registers the route tree so <Link to>, params and search are type-checked app-wide.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
