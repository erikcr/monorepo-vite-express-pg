import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { createAppRouter } from "../router.tsx";

/**
 * Renders the whole app at `path`, through the real router and a fresh query cache, so a test
 * exercises the route's guards, search validation and loader as well as the page. Mock the
 * generated hooks (`@repo/api-client-react`) and Clerk (`../__tests__/clerk-mock.tsx`) in the test.
 */
export function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { router, queryClient };
}
