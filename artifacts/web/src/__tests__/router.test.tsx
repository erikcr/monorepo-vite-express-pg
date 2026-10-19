import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router.tsx";

const health = vi.fn(() => ({ data: undefined, isLoading: true, isError: false }));
vi.mock("@repo/api-client-react", () => ({ useGetHealth: () => health() }));
const reportError = vi.fn();
vi.mock("@repo/api-client-react/errors", () => ({
  reportError: (...a: unknown[]) => reportError(...a),
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
  beforeEach(() => {
    health.mockImplementation(() => ({ data: undefined, isLoading: true, isError: false }));
    reportError.mockClear();
  });

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

  it("shows the crash screen when a route throws, reports it, and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    health.mockImplementation(() => {
      if (broken) throw new Error("page exploded");
      return { data: undefined, isLoading: true, isError: false };
    });
    renderAt("/");
    const retry = await screen.findByRole("button", { name: "Try again" });
    broken = false;
    fireEvent.click(retry);
    expect(reportError).toHaveBeenCalledWith("web", expect.any(Error), expect.any(String));
    expect(await screen.findByText("Status")).toBeTruthy(); // retry renders the page again
  });
});
