import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSelectedOrgId, selectOrg } from "../org.ts";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

type Options = { mutation?: { onSuccess?: (data?: object) => Promise<unknown> } };
const me = vi.fn();
const members = vi.fn();
const invitations = vi.fn();
const mutations = {
  update: vi.fn(),
  remove: vi.fn(),
  invite: vi.fn(),
  revoke: vi.fn(),
};
const options: Partial<Record<keyof typeof mutations, Options>> = {};
const errors: Partial<Record<keyof typeof mutations, Error>> = {};
const mutation = (name: keyof typeof mutations) => (o: Options) => {
  options[name] = o;
  return { mutate: mutations[name], isPending: false, error: errors[name] ?? null };
};
vi.mock("@repo/api-client-react", () => ({
  useGetMe: () => me(),
  useListOrgMembersInfinite: () => members(),
  useListInvitationsInfinite: () => invitations(),
  useUpdateOrgMember: (o: Options) => mutation("update")(o),
  useRemoveOrgMember: (o: Options) => mutation("remove")(o),
  useCreateInvitation: (o: Options) => mutation("invite")(o),
  useRevokeInvitation: (o: Options) => mutation("revoke")(o),
  getGetMeQueryKey: () => ["/api/me"],
  getListOrgMembersInfiniteQueryKey: () => ["infinite", "/api/orgs/current/members"],
  getListInvitationsInfiniteQueryKey: () => ["infinite", "/api/orgs/current/invitations"],
}));

const ORG = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alpha", role: "org_admin" };
const ME = { id: "11111111-0000-4000-8000-000000000001", email: "ann@x.test", name: "Ann" };
const BOB = { userId: "22222222-0000-4000-8000-000000000002", email: "bob@x.test", name: "" };
const signedInAs = (orgs: object[]) =>
  me.mockReturnValue({ data: { user: ME, orgs }, isLoading: false, error: null });
const page = <T,>(items: T[], more: object = {}) => ({
  data: { pages: [{ items, nextCursor: null }] },
  isLoading: false,
  error: null,
  ...more,
});
// Settings open over any page; About needs no data of its own.
const PATH = "/about?settings=members";
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

beforeEach(() => {
  clerk.signedIn = true;
  selectOrg(null);
  for (const fn of [me, members, invitations, ...Object.values(mutations)]) fn.mockReset();
  for (const key of Object.keys(errors)) delete errors[key as keyof typeof errors];
  members.mockReturnValue(
    page([
      { userId: BOB.userId, email: BOB.email, name: "", role: "org_member", joinedAt: inDays(0) },
      { userId: ME.id, email: ME.email, name: ME.name, role: "org_admin", joinedAt: inDays(-1) },
    ])
  );
  invitations.mockReturnValue(page([]));
});

describe("Settings → Members", () => {
  it("sends signed-out visitors to sign-in", async () => {
    clerk.signedIn = false;
    renderAt(PATH);
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
  });

  it("shows loading, then an error loading the account", async () => {
    me.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt(PATH);
    expect(await screen.findByText("Loading…")).toBeTruthy();
    me.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") });
    renderAt(PATH);
    expect(await screen.findByText(/Couldn't load your account: boom/)).toBeTruthy();
  });

  it("isn't offered to someone without an org, who gets their profile", async () => {
    signedInAs([]);
    renderAt(PATH);
    expect(await screen.findByText("clerk user profile")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Members" })).toBeNull();
    expect(members).not.toHaveBeenCalled();
  });

  it("lists the org's members, marking you, and its empty invitations", async () => {
    signedInAs([ORG]);
    // The lists ask the API only once the org is selected, so their requests carry its X-Org-Id.
    const selectedWhenListed: (string | null)[] = [];
    const listed = members.getMockImplementation();
    members.mockImplementation(() => {
      selectedWhenListed.push(getSelectedOrgId());
      return listed?.();
    });
    renderAt(PATH);
    expect(await screen.findByRole("region", { name: "Members" })).toBeTruthy();
    expect(screen.getByText("Who belongs to Alpha, and who's invited")).toBeTruthy();
    expect(getSelectedOrgId()).toBe(ORG.id);
    expect(screen.getByText("bob@x.test")).toBeTruthy();
    expect(screen.getByText("(you)")).toBeTruthy();
    expect(screen.getByText("No pending invitations.")).toBeTruthy();
    expect(new Set(selectedWhenListed)).toEqual(new Set([ORG.id]));
  });

  it("shows a list that failed to load, and one still loading", async () => {
    signedInAs([ORG]);
    members.mockReturnValue({ ...page([]), error: new Error("members failed") });
    invitations.mockReturnValue({ ...page([]), data: undefined, isLoading: true });
    renderAt(PATH);
    expect(await screen.findByText("members failed")).toBeTruthy();
    expect(screen.getByText("Loading…")).toBeTruthy();
    expect(screen.queryByText("No pending invitations.")).toBeNull();
  });

  it("lets an admin change roles and remove others, but not themselves", async () => {
    signedInAs([ORG]);
    renderAt(PATH);
    fireEvent.change(await screen.findByLabelText("Role of bob@x.test"), {
      target: { value: "org_admin" },
    });
    expect(mutations.update).toHaveBeenCalledWith({
      userId: BOB.userId,
      data: { role: "org_admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove bob@x.test" }));
    expect(mutations.remove).toHaveBeenCalledWith({ userId: BOB.userId });
    expect(screen.queryByRole("button", { name: "Remove Ann" })).toBeNull();
  });

  it("shows members the lists only: no role controls, removing or inviting", async () => {
    signedInAs([{ ...ORG, role: "org_member" }]);
    invitations.mockReturnValue(
      page([{ id: "i1", email: "new@x.test", role: "org_member", expiresAt: inDays(7) }])
    );
    renderAt(PATH);
    expect(await screen.findByText("new@x.test")).toBeTruthy();
    expect(screen.queryByLabelText("Role of bob@x.test")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Remove/ })).toBeNull();
    expect(screen.queryByLabelText("Email address")).toBeNull();
    expect(screen.queryByRole("button", { name: /^Revoke/ })).toBeNull();
  });

  it("invites by email and role, then clears the form and refreshes the list", async () => {
    signedInAs([ORG]);
    const { queryClient } = renderAt(PATH);
    const email = await screen.findByLabelText("Email address");
    fireEvent.change(email, { target: { value: "new@x.test" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "org_admin" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    expect(mutations.invite).toHaveBeenCalledWith({
      data: { email: "new@x.test", role: "org_admin" },
    });
    const refresh = vi.spyOn(queryClient, "invalidateQueries");
    await act(() => options.invite?.mutation?.onSuccess?.({ email: "new@x.test" }));
    expect((email as HTMLInputElement).value).toBe("");
    expect(refresh).toHaveBeenCalledWith({
      queryKey: ["infinite", "/api/orgs/current/invitations"],
    });
    // Says what it did, until the next address is typed.
    expect(screen.getByRole("status").textContent).toBe("Invitation sent to new@x.test");
    fireEvent.change(email, { target: { value: "n" } });
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("lists pending and expired invitations, and revokes one", async () => {
    signedInAs([ORG]);
    invitations.mockReturnValue(
      page([
        { id: "i1", email: "new@x.test", role: "org_member", expiresAt: inDays(7) },
        { id: "i2", email: "late@x.test", role: "org_admin", expiresAt: inDays(-1) },
      ])
    );
    renderAt(PATH);
    expect(await screen.findByText(/Member · Expires/)).toBeTruthy();
    expect(screen.getByText(/Admin · Expired: invite again/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Revoke invitation for late@x.test" }));
    expect(mutations.revoke).toHaveBeenCalledWith({ id: "i2" });
  });

  it("refreshes the members and /me after a role change", async () => {
    signedInAs([ORG]);
    const { queryClient } = renderAt(PATH);
    await screen.findByLabelText("Role of bob@x.test");
    const refresh = vi.spyOn(queryClient, "invalidateQueries");
    await act(() => options.update?.mutation?.onSuccess?.());
    expect(refresh).toHaveBeenCalledWith({ queryKey: ["infinite", "/api/orgs/current/members"] });
    expect(refresh).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
  });

  it("shows why the API refused a change", async () => {
    errors.remove = new Error("Make someone else an org admin first: an org needs one");
    errors.invite = new Error("They're already a member");
    signedInAs([ORG]);
    renderAt(PATH);
    expect(await screen.findByText(/Make someone else an org admin/)).toBeTruthy();
    expect(screen.getByText("They're already a member")).toBeTruthy();
  });

  it("loads more of a long list", async () => {
    signedInAs([ORG]);
    const fetchNextPage = vi.fn();
    members.mockReturnValue({ ...page([]), hasNextPage: true, fetchNextPage });
    renderAt(PATH);
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
