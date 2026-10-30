import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const me = vi.fn();
const idle = () => ({ mutate: vi.fn(), isPending: false, error: null });
const empty = () => ({ data: { pages: [{ items: [], nextCursor: null }] }, isLoading: false });
vi.mock("@repo/api-client-react", () => ({
  useGetMe: () => me(),
  useLeaveCurrentOrg: () => idle(),
  useDeleteCurrentOrg: () => idle(),
  useListOrgMembersInfinite: () => empty(),
  useListInvitationsInfinite: () => empty(),
  useUpdateOrgMember: () => idle(),
  useRemoveOrgMember: () => idle(),
  useCreateInvitation: () => idle(),
  useRevokeInvitation: () => idle(),
  useCreateExample: () => idle(),
  useListExamplesInfinite: () => empty(),
  getGetMeQueryKey: () => ["/api/me"],
  getListOrgMembersInfiniteQueryKey: () => ["infinite", "/api/orgs/current/members"],
  getListInvitationsInfiniteQueryKey: () => ["infinite", "/api/orgs/current/invitations"],
  getListExamplesInfiniteQueryKey: () => ["infinite", "/api/example"],
}));

const ORG = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Alpha",
  handle: "alpha",
  role: "org_admin",
};
const signedInAs = (orgs: object[]) =>
  me.mockReturnValue({ data: { user: { id: "u", email: "e", name: "" }, orgs }, isLoading: false });
const dialog = () => screen.getByRole("dialog", { name: "Settings" });

beforeEach(() => {
  clerk.signedIn = true;
  me.mockReset();
  signedInAs([ORG]);
});

describe("the settings dialog", () => {
  it("opens from the account menu over the page, which stays where it was", async () => {
    const { router } = renderAt("/o/alpha");
    fireEvent.click(await screen.findByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(router.state.location.pathname).toBe("/o/alpha");
    expect(screen.getByRole("heading", { name: "Alpha" })).toBeTruthy();
    // Always on a named section, so the address says what's on screen.
    expect(router.state.location.search).toEqual({ settings: "profile" });
    expect(await screen.findByRole("region", { name: "Profile" })).toBeTruthy();
  });

  it("shows the first section for an address with none named", async () => {
    renderAt("/o/alpha?settings=");
    expect(await screen.findByRole("region", { name: "Organization" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "← All settings" })).toBeNull();
  });

  it("keeps Security as a section of its own, on Clerk's security page", async () => {
    window.history.replaceState(null, "", "/");
    renderAt("/o/alpha?settings=security");
    expect(await screen.findByRole("region", { name: "Security" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Security" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(window.location.hash).toBe("#/security");
    expect(screen.getByText("clerk user profile")).toBeTruthy();
  });

  it("shows only the person's own settings over a page outside an org", async () => {
    renderAt("/about?settings=members");
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(nav.textContent).toBe("YouProfileSecurity");
    expect(screen.getByRole("region", { name: "Profile" })).toBeTruthy();
  });

  it("lists the org's sections under its name, and the person's under You", async () => {
    renderAt("/o/alpha?settings=profile");
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(nav.textContent).toBe("AlphaOrganizationMembersYouProfileSecurity");
    expect(screen.getByRole("button", { name: "Profile" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByText("clerk user profile")).toBeTruthy();
  });

  it("takes focus, and gives it back to what opened it", async () => {
    renderAt("/o/alpha");
    const opener = await screen.findByRole("button", { name: "Account menu" });
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("menuitem", { name: "Settings" }));
    const opened = await screen.findByRole("dialog", { name: "Settings" });
    expect(document.activeElement).toBe(opened);
    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it.each([
    ["Escape", () => fireEvent.keyDown(dialog(), { key: "Escape" })],
    ["×", () => fireEvent.click(screen.getByRole("button", { name: "Close settings" }))],
    ["the backdrop", () => fireEvent.mouseDown(dialog().previousElementSibling as Element)],
  ])("closes with %s, back to the page", async (_, close) => {
    const { router } = renderAt("/o/alpha?settings=members");
    await screen.findByRole("dialog", { name: "Settings" });
    close();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toEqual({});
    expect(router.state.location.pathname).toBe("/o/alpha");
  });

  it("switches section in place, so one Back leaves settings", async () => {
    const { router } = renderAt("/o/alpha?settings=organization");
    await screen.findByRole("region", { name: "Organization" });
    const entries = router.history.length;
    fireEvent.click(screen.getByRole("button", { name: "Members" }));
    expect(await screen.findByRole("region", { name: "Members" })).toBeTruthy();
    expect(router.state.location.search).toEqual({ settings: "members" });
    expect(router.history.length).toBe(entries);
    // A section's way back to the list, for a phone.
    fireEvent.click(screen.getByRole("button", { name: "← All settings" }));
    expect(router.state.location.search).toEqual({ settings: "" });
  });

  it("opens an unknown section, or one the person can't use, on their first", async () => {
    renderAt("/o/alpha?settings=nope");
    expect(await screen.findByRole("region", { name: "Organization" })).toBeTruthy();
    signedInAs([]);
    renderAt("/o/alpha?settings=members");
    expect(await screen.findByText("clerk user profile")).toBeTruthy();
  });

  it("asks before closing over an invitation typed but not sent", async () => {
    const { router } = renderAt("/o/alpha?settings=members");
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@x.test" },
    });

    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(
      await screen.findByRole("alertdialog", { name: "Discard unsaved changes?" })
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.state.location.search).toEqual({ settings: "members" });
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("new@x.test");

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toEqual({});
  });

  it("asks before switching section, then switches", async () => {
    const { router } = renderAt("/o/alpha?settings=members");
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@x.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Organization" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    expect(await screen.findByRole("region", { name: "Organization" })).toBeTruthy();
    expect(router.state.location.search).toEqual({ settings: "organization" });
  });

  // Back and leaving the site go through the browser's history, which tests' memory history
  // doesn't have: E2E covers them ("asks before Back or leaving drops an unsent invitation").

  it.each([
    ["⌘,", { metaKey: true }],
    ["Ctrl+,", { ctrlKey: true }],
  ])("opens with %s from anywhere, and leaves an open one alone", async (_, modifier) => {
    const { router } = renderAt("/o/alpha");
    await screen.findByRole("heading", { name: "Alpha" });
    fireEvent.keyDown(window, { key: ",", ...modifier });
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(router.state.location.pathname).toBe("/o/alpha");

    fireEvent.click(screen.getByRole("button", { name: "Members" }));
    await screen.findByRole("region", { name: "Members" });
    fireEvent.keyDown(window, { key: ",", ...modifier });
    expect(router.state.location.search).toEqual({ settings: "members" });
  });

  it.each([
    ["with other keys held", true, { key: ",", metaKey: true, shiftKey: true }],
    ["without ⌘ or Ctrl", true, { key: "," }],
    ["for someone signed out", false, { key: ",", metaKey: true }],
  ])("ignores the shortcut %s", async (_, signedIn, keys) => {
    clerk.signedIn = signedIn;
    renderAt("/about");
    await screen.findByRole("heading", { name: "About" });
    fireEvent.keyDown(window, keys);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("redirecting to sign-in")).toBeNull();
  });

  it("sends signed-out visitors to sign-in", async () => {
    clerk.signedIn = false;
    renderAt("/about?settings=profile");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the account loading, then failing to load", async () => {
    me.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt("/about?settings=profile");
    expect(await screen.findByText("Loading…")).toBeTruthy();
    me.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") });
    renderAt("/about?settings=profile");
    expect(await screen.findByText(/Couldn't load your account: boom/)).toBeTruthy();
  });
});
