import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const listOrgs = vi.fn();
vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useListAdminOrgsInfinite: (params: unknown) => listOrgs(params),
}));

const org = (id: string, name: string, memberCount = 1) => ({
  id,
  name,
  memberCount,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const page = (items: object[], extra: object = {}) => ({
  data: { pages: [{ items, nextCursor: null }] },
  isLoading: false,
  error: null,
  ...extra,
});

describe("routes (admin)", () => {
  beforeEach(() => {
    clerk.signedIn = true;
    listOrgs.mockReset().mockReturnValue(page([]));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires sign-in for every page", async () => {
    clerk.signedIn = false;
    renderAt("/");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
    expect(listOrgs).not.toHaveBeenCalled();
  });

  it("lists organizations with member counts", async () => {
    listOrgs.mockReturnValue(page([org("o1", "Acme", 3), org("o2", "Globex", 0)]));
    renderAt("/");
    expect(await screen.findByRole("cell", { name: "Acme" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "3" })).toBeTruthy();
    expect(listOrgs).toHaveBeenCalledWith({});
  });

  it("searches by the ?q= in the URL", async () => {
    renderAt("/?q=acme");
    expect(((await screen.findByLabelText("Search organizations")) as HTMLInputElement).value).toBe(
      "acme"
    );
    expect(listOrgs).toHaveBeenCalledWith({ q: "acme" });
  });

  it("writes the search to the URL once typing pauses", async () => {
    const { router } = renderAt("/");
    const box = await screen.findByLabelText("Search organizations");
    vi.useFakeTimers();
    fireEvent.change(box, { target: { value: "glob" } });
    expect(router.state.location.search).toEqual({});
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    vi.useRealTimers();
    await vi.waitFor(() => expect(router.state.location.search).toEqual({ q: "glob" }));
  });

  it("loads the next page on request", async () => {
    const fetchNextPage = vi.fn();
    listOrgs.mockReturnValue(page([org("o1", "Acme")], { hasNextPage: true, fetchNextPage }));
    renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalled();
    expect(screen.getByText("1+")).toBeTruthy();
  });

  it("explains a 403 instead of showing an empty table", async () => {
    listOrgs.mockReturnValue(page([], { error: { status: 403, code: "forbidden", message: "x" } }));
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Staff access required" })).toBeTruthy();
  });

  it("asks staff without a recent second factor to sign in again with one", async () => {
    listOrgs.mockReturnValue(
      page([], { error: { status: 403, code: "second_factor_required", message: "x" } })
    );
    renderAt("/");
    expect(await screen.findByRole("heading", { name: "Second factor required" })).toBeTruthy();
    expect(screen.getByText(/in the last 12 hours/)).toBeTruthy();
  });

  it("renders the settings placeholder, sign-in and the 404 page", async () => {
    renderAt("/settings");
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    renderAt("/sign-in/");
    expect(await screen.findByText("clerk sign-in form")).toBeTruthy();
    renderAt("/no-such-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
