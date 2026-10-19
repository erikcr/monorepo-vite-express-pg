import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router.tsx";

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
}));

function renderAt(path: string) {
  const queryClient = new QueryClient();
  const router = createAppRouter(queryClient, createMemoryHistory({ initialEntries: [path] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return router;
}

describe("routes (web)", () => {
  it("renders the home page at /", async () => {
    renderAt("/");
    expect(await screen.findByText("Status")).toBeTruthy();
  });

  it("renders the about page at /about", async () => {
    renderAt("/about");
    expect(await screen.findByRole("heading", { name: "About" })).toBeTruthy();
  });

  it("shows the 404 page for an unknown path", async () => {
    renderAt("/no-such-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });

  it("navigates client-side through the nav links", async () => {
    const router = renderAt("/");
    fireEvent.click(await screen.findByRole("link", { name: "About" }));
    expect(await screen.findByRole("heading", { name: "About" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/about");
  });
});
