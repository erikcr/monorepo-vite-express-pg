import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const listOrgs = vi.fn();
vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useListAdminOrgsInfinite: (params: unknown) => listOrgs(params),
}));
const reportError = vi.fn();
vi.mock("@repo/api-client-react/errors", () => ({
  reportError: (...a: unknown[]) => reportError(...a),
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

  it("has an account menu with Clerk's profile, and holds its place while Clerk loads", async () => {
    renderAt("/");
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Manage account" }));
    expect(clerk.openUserProfile).toHaveBeenCalledOnce();
    cleanup();

    clerk.loaded = false;
    renderAt("/no-such-page");
    await screen.findByRole("heading", { name: "Page not found" });
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(document.querySelector("header [aria-hidden]")).toBeTruthy();
    clerk.loaded = true;
  });

  it("has no account menu when signed out", async () => {
    clerk.signedIn = false;
    renderAt("/no-such-page");
    await screen.findByRole("heading", { name: "Page not found" });
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
    expect(document.querySelector("header [aria-hidden]")).toBeNull();
  });

  it("requires sign-in for every page", async () => {
    clerk.signedIn = false;
    renderAt("/");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
    expect(listOrgs).not.toHaveBeenCalled();
  });

  it("shows nothing of the dashboard until the API has said this person is staff", async () => {
    listOrgs.mockReturnValue({ ...page([]), data: undefined, isLoading: true });
    renderAt("/");
    expect(await screen.findByText("Loading…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Admin Dashboard" })).toBeNull();
    expect(screen.queryByText("Overview")).toBeNull();
    expect(screen.queryByText("Theme tokens")).toBeNull();
  });

  it("says when the list fails to load, keeping the rest of the dashboard", async () => {
    listOrgs.mockReturnValue(
      page([], { data: undefined, error: { status: 500, message: "boom" } })
    );
    renderAt("/");
    expect(await screen.findByText("Failed to load: boom")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Admin Dashboard" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
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

  it("shows the crash screen when a page throws, reports it, and retries", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let broken = true;
    listOrgs.mockImplementation(() => {
      if (broken) throw new Error("page exploded");
      return page([]);
    });
    renderAt("/");
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeTruthy();
    broken = false;
    fireEvent.click(retry);
    expect(reportError).toHaveBeenCalledWith("admin", expect.any(Error), expect.any(String));
    expect(await screen.findByText("No organizations yet.")).toBeTruthy();
  });

  it("renders sign-in and the 404 page", async () => {
    renderAt("/sign-in/");
    expect(await screen.findByText("clerk sign-in form")).toBeTruthy();
    renderAt("/no-such-page");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
  });
});
