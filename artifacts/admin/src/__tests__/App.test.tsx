import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App.tsx";

const listExamples = vi.fn();

vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useListExamplesInfinite: () => listExamples(),
}));

const row = (id: string, name: string) => ({
  id,
  orgId: "org_1",
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

describe("App (admin)", () => {
  beforeEach(() => {
    listExamples.mockReturnValue({ data: undefined, isLoading: true, error: null });
  });
  it("renders without crashing", () => {
    render(<App />);
    expect(document.body).toBeTruthy();
  });

  it("shows the admin heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /admin/i })).toBeTruthy();
  });

  it("shows the overview section", () => {
    render(<App />);
    expect(screen.getByText("Overview")).toBeTruthy();
  });

  it("lists rows from every loaded page and loads the next one on request", () => {
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
    render(<App />);
    expect(screen.getByText("First")).toBeTruthy();
    expect(screen.getByText("Second")).toBeTruthy();
    expect(screen.getByText("2+")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
