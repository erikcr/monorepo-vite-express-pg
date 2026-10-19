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
  getListExamplesInfiniteQueryOptions: (params: object) => {
    listQueryOptions(params);
    return {
      queryKey: ["examples"],
      queryFn: async () => ({ items: [], nextCursor: null }),
    };
  },
}));

const row = (id: string, name: string) => ({
  id,
  orgId: "123e4567-e89b-42d3-a456-426614174001",
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

  it("prefetches the first page of records in the route loader", async () => {
    renderAt("/");
    await screen.findByText("Overview");
    expect(listQueryOptions).toHaveBeenCalledWith({});
    expect(listExamples).toHaveBeenCalledWith({});
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
