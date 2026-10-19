import { getListExamplesInfiniteQueryOptions } from "@repo/api-client-react";
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
import { DashboardPage, examplesPaging } from "./pages/DashboardPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";

// Route loaders get the QueryClient, so they can prefetch into the same cache the hooks read.
export interface RouterContext {
  queryClient: QueryClient;
}

function RootLayout() {
  const link = "text-text-muted hover:text-text";
  return (
    <>
      <nav className="px-page-x pt-3 flex gap-4 text-xs border-b border-border bg-surface-raised pb-3">
        <Link to="/" className={link} activeProps={{ className: "text-text font-medium" }}>
          Dashboard
        </Link>
        <Link to="/settings" className={link} activeProps={{ className: "text-text font-medium" }}>
          Settings
        </Link>
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
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  // Search params are validated like any other input; links may omit orgId (it defaults).
  validateSearch: z.object({ orgId: z.string().default("org_1") }),
  loaderDeps: ({ search }) => ({ orgId: search.orgId }),
  // Prefetch the first page so the table renders with data. prefetch never throws: API errors
  // surface in the page's own error state.
  loader: ({ context, deps }) =>
    deps.orgId
      ? context.queryClient.prefetchInfiniteQuery({
          ...getListExamplesInfiniteQueryOptions({ orgId: deps.orgId }, { query: examplesPaging }),
          initialPageParam: undefined,
        })
      : undefined,
  component: DashboardPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const routeTree = rootRoute.addChildren([dashboardRoute, settingsRoute]);

export function createAppRouter(queryClient: QueryClient, history?: RouterHistory) {
  return createRouter({ routeTree, context: { queryClient }, history, defaultPreload: "intent" });
}

// Registers the route tree so <Link to>, params and search are type-checked app-wide.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
