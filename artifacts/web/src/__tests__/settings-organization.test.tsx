import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentOrgId, rememberLastOrg, setCurrentOrgId } from "../org.ts";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const me = vi.fn();
const leaveOrg = vi.fn();
const deleteOrg = vi.fn();
type Mutation = { mutation?: { onSuccess?: () => Promise<unknown> } };
const mutations: { leave?: Mutation; delete?: Mutation } = {};
const mutationState: { leaveError?: Error; deleteError?: Error } = {};
vi.mock("@repo/api-client-react", () => ({
  useGetMe: () => me(),
  useLeaveCurrentOrg: (options: Mutation) => {
    mutations.leave = options;
    return { mutate: leaveOrg, isPending: false, error: mutationState.leaveError ?? null };
  },
  useDeleteCurrentOrg: (options: Mutation) => {
    mutations.delete = options;
    return { mutate: deleteOrg, isPending: false, error: mutationState.deleteError ?? null };
  },
  useCreateExample: () => ({ mutate: vi.fn(), isPending: false, error: null }),
  useListExamplesInfinite: () => ({
    data: { pages: [{ items: [], nextCursor: null }] },
    isLoading: false,
  }),
  getGetMeQueryKey: () => ["/api/me"],
  getListExamplesInfiniteQueryKey: () => ["infinite", "/api/example"],
}));

const org = (id: string, name: string) => ({
  id,
  name,
  handle: name.toLowerCase(),
  role: "org_admin",
});
const ORG_A = org("aaaaaaaa-0000-4000-8000-000000000001", "Alpha");
const ORG_B = org("bbbbbbbb-0000-4000-8000-000000000002", "Beta");
const signedInAs = (orgs: object[]) =>
  me.mockReturnValue({ data: { user: { id: "u", email: "e", name: "" }, orgs }, isLoading: false });
const PATH = "/o/alpha?settings=organization";

beforeEach(() => {
  clerk.signedIn = true;
  setCurrentOrgId(null);
  rememberLastOrg(null);
  for (const fn of [me, leaveOrg, deleteOrg]) fn.mockReset();
  mutationState.leaveError = undefined;
  mutationState.deleteError = undefined;
});

describe("Settings → Organization", () => {
  const member = { ...ORG_A, role: "org_member" };

  it("lets a member leave, but not delete", async () => {
    signedInAs([member]);
    renderAt(PATH);
    expect(await screen.findByText("Your membership of Alpha")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Leave Alpha" }));
    expect(leaveOrg).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
  });

  it("deletes only once the admin has typed the org's exact name", async () => {
    signedInAs([ORG_A]);
    renderAt(PATH);
    const remove = await screen.findByRole("button", { name: "Delete organization" });
    const confirm = screen.getByLabelText("Type Alpha to confirm");
    fireEvent.change(confirm, { target: { value: "alpha" } });
    expect(remove.hasAttribute("disabled")).toBe(true);
    fireEvent.click(remove);
    expect(deleteOrg).not.toHaveBeenCalled();
    fireEvent.change(confirm, { target: { value: "Alpha" } });
    expect(remove.hasAttribute("disabled")).toBe(false);
    fireEvent.click(remove);
    expect(deleteOrg).toHaveBeenCalledWith({ data: { confirmName: "Alpha" } });
  });

  it("shows why the API refused", async () => {
    mutationState.leaveError = new Error("Make someone else an org admin before you leave");
    mutationState.deleteError = new Error("No access to that organization");
    signedInAs([ORG_A]);
    renderAt(PATH);
    expect(await screen.findByText(/Make someone else an org admin/)).toBeTruthy();
    expect(screen.getByText("No access to that organization")).toBeTruthy();
  });

  it.each(["leave", "delete"] as const)(
    "after a %s, goes home to another org with nothing cached from the old one",
    async (action) => {
      signedInAs([ORG_A, ORG_B]);
      const { router, queryClient } = renderAt(PATH);
      await screen.findByRole("button", { name: "Leave Alpha" });
      queryClient.setQueryData(["infinite", "/api/example"], { stale: "from Alpha" });
      const refetchMe = vi.spyOn(queryClient, "invalidateQueries");

      signedInAs([ORG_B]); // what /me answers once refetched
      await act(() => mutations[action]?.mutation?.onSuccess?.());

      expect(refetchMe).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
      await screen.findByRole("heading", { name: "Beta" });
      expect(router.state.location.pathname).toBe("/o/beta");
      expect(getCurrentOrgId()).toBe(ORG_B.id);
      expect(queryClient.getQueryData(["infinite", "/api/example"])).toBeUndefined();
      expect(router.state.location.search).toEqual({});
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  );
});
