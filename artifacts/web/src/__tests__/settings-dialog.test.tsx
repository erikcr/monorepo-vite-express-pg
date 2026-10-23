import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { selectOrg } from "../org.ts";
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
  getGetMeQueryKey: () => ["/api/me"],
  getListOrgMembersInfiniteQueryKey: () => ["infinite", "/api/orgs/current/members"],
  getListInvitationsInfiniteQueryKey: () => ["infinite", "/api/orgs/current/invitations"],
}));

const ORG = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alpha", role: "org_admin" };
const signedInAs = (orgs: object[]) =>
  me.mockReturnValue({ data: { user: { id: "u", email: "e", name: "" }, orgs }, isLoading: false });
const dialog = () => screen.getByRole("dialog", { name: "Settings" });

beforeEach(() => {
  clerk.signedIn = true;
  selectOrg(null);
  me.mockReset();
  signedInAs([ORG]);
});

describe("the settings dialog", () => {
  it("opens from the account menu over the page, which stays where it was", async () => {
    const { router } = renderAt("/about");
    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(dialog().getAttribute("aria-modal")).toBe("true");
    expect(router.state.location.pathname).toBe("/about");
    expect(screen.getByRole("heading", { name: "About" })).toBeTruthy();
    // No section asked for: the first one shows (on a phone, the list alone).
    expect(screen.getByRole("region", { name: "Organization" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "← All settings" })).toBeNull();
  });

  it("lists the org's sections under Workspace and the person's under You", async () => {
    renderAt("/about?settings=profile");
    const nav = await screen.findByRole("navigation", { name: "Settings sections" });
    expect(nav.textContent).toBe("WorkspaceOrganizationMembersYouProfile");
    expect(screen.getByRole("button", { name: "Profile" }).getAttribute("aria-current")).toBe(
      "page"
    );
    expect(screen.getByText("clerk user profile")).toBeTruthy();
  });

  it("takes focus, and gives it back to what opened it", async () => {
    renderAt("/about");
    const opener = await screen.findByRole("button", { name: "Settings" });
    opener.focus();
    fireEvent.click(opener);
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
    const { router } = renderAt("/about?settings=members");
    await screen.findByRole("dialog", { name: "Settings" });
    close();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toEqual({});
    expect(router.state.location.pathname).toBe("/about");
  });

  it("switches section in place, so one Back leaves settings", async () => {
    const { router } = renderAt("/about?settings=organization");
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
    renderAt("/about?settings=nope");
    expect(await screen.findByRole("region", { name: "Organization" })).toBeTruthy();
    signedInAs([]);
    renderAt("/about?settings=members");
    expect(await screen.findByText("clerk user profile")).toBeTruthy();
  });

  it("asks before dropping an invitation typed but not sent", async () => {
    const { router } = renderAt("/about?settings=members");
    fireEvent.change(await screen.findByLabelText("Email address"), {
      target: { value: "new@x.test" },
    });

    fireEvent.keyDown(dialog(), { key: "Escape" });
    expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Email address") as HTMLInputElement).value).toBe("new@x.test");

    fireEvent.click(screen.getByRole("button", { name: "Organization" }));
    expect(router.state.location.search).toEqual({ settings: "members" });
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(router.state.location.search).toEqual({ settings: "organization" });
    expect(await screen.findByRole("region", { name: "Organization" })).toBeTruthy();
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
