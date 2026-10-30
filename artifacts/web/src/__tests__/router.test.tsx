import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const health = vi.fn(() => ({ data: undefined, isLoading: true, isError: false }));
vi.mock("@repo/api-client-react", () => ({ useGetHealth: () => health() }));
const reportError = vi.fn();
vi.mock("@repo/api-client-react/errors", () => ({
  reportError: (...a: unknown[]) => reportError(...a),
}));

describe("routes (web)", () => {
  beforeEach(() => {
    clerk.signedIn = false;
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
    const { router } = renderAt("/");
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

  it("offers sign-in when signed out, and the account menu when signed in", async () => {
    renderAt("/");
    expect(await screen.findByRole("link", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Account menu" })).toBeNull();
  });

  it("shows the account menu once signed in", async () => {
    clerk.signedIn = true;
    renderAt("/");
    expect(await screen.findByRole("button", { name: "Account menu" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("renders Clerk's sign-in under /sign-in, including its sub-steps", async () => {
    renderAt("/sign-in");
    expect(await screen.findByText("clerk sign-in form")).toBeTruthy();
    renderAt("/sign-in/factor-one");
    expect((await screen.findAllByText("clerk sign-in form")).length).toBeGreaterThan(0);
  });
});
