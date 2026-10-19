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
import { AboutPage } from "./pages/AboutPage.tsx";
import { AppPage } from "./pages/AppPage.tsx";
import { CrashScreen } from "./pages/CrashScreen.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { SignInPage } from "./pages/SignInPage.tsx";

// Route loaders get the QueryClient, so they can prefetch into the same cache the hooks read.
export interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
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
            <UserButton />
          </Show>
          <Show when="signed-out">
            <Link to="/sign-in/$" params={{ _splat: "" }} className={link}>
              Sign in
            </Link>
          </Show>
        </span>
      </nav>
      <Outlet />
    </>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
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

const appRoute = createRoute({ getParentRoute: () => rootRoute, path: "/app", component: AppPage });
// Clerk's sign-in renders its own steps under /sign-in/… (factor-one, verify, …).
const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sign-in/$",
  component: SignInPage,
});

const routeTree = rootRoute.addChildren([homeRoute, aboutRoute, appRoute, signInRoute]);

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
