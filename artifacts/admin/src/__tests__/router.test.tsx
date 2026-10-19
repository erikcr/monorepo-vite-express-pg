import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "../router.tsx";

const listExamples = vi.fn();
const listQueryOptions = vi.fn();

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useListExamplesInfinite: (params: unknown) => listExamples(params),
  getListExamplesInfiniteQueryOptions: (params: { orgId: string }) => {
    listQueryOptions(params);
    return {
      queryKey: ["examples", params.orgId],
      queryFn: async () => ({ items: [], nextCursor: null }),
    };
  },
}));

const row = (id: string, name: string) => ({
  id,
  orgId: "org_1",
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

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

describe("routes (admin)", () => {
  beforeEach(() => {
    listExamples.mockReset().mockReturnValue({ data: undefined, isLoading: true, error: null });
    listQueryOptions.mockReset();
  });

  it("renders the dashboard at /", async () => {
    renderAt("/");
    expect(await screen.findByRole("heading", { name: /admin/i })).toBeTruthy();
    expect(screen.getByText("Overview")).toBeTruthy();
  });

  it("defaults the org filter to org_1 and prefetches its first page", async () => {
    renderAt("/");
    expect(((await screen.findByLabelText("Org filter")) as HTMLInputElement).value).toBe("org_1");
    expect(listExamples).toHaveBeenCalledWith({ orgId: "org_1" });
    expect(listQueryOptions).toHaveBeenCalledWith({ orgId: "org_1" });
  });

  it("reads the org filter from the URL", async () => {
    renderAt("/?orgId=org_9");
    expect(((await screen.findByLabelText("Org filter")) as HTMLInputElement).value).toBe("org_9");
    expect(listExamples).toHaveBeenCalledWith({ orgId: "org_9" });
    expect(listQueryOptions).toHaveBeenCalledWith({ orgId: "org_9" });
  });

  it("writes the org filter back to the URL as you type", async () => {
    const router = renderAt("/");
    fireEvent.change(await screen.findByLabelText("Org filter"), { target: { value: "org_7" } });
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ orgId: "org_7" }));
  });

  it("lists rows from every loaded page and loads the next one on request", async () => {
    const fetchNextPage = vi.fn();
    listExamples.mockReturnValue({
      data: {
        pages: [
          { items: [row("a", "First")], nextCursor: "c1" },
          { items: [row("b", "Second")], nextCursor: "c2" },
        ],
      },
      isLoading: false,
      error: null,
      hasNextPage: true,
      fetchNextPage,
      isFetchingNextPage: false,
    });
    renderAt("/");
    expect(await screen.findByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("2+")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("renders the settings placeholder at /settings", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
  });

  it("shows the 404 page for an unknown path", async () => {
    renderAt("/no-such-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
