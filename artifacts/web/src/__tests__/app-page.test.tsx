import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSelectedOrgId, selectOrg } from "../org.ts";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const me = vi.fn();
const createOrg = vi.fn();
const createExample = vi.fn();
const listExamples = vi.fn();
const leaveOrg = vi.fn();
const deleteOrg = vi.fn();
type Mutation = { mutation?: { onSuccess?: () => Promise<unknown> } };
const mutations: { leave?: Mutation; delete?: Mutation } = {};
const mutationState: { leaveError?: Error; deleteError?: Error } = {};
vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useGetMe: () => me(),
  useCreateOrg: () => ({ mutate: createOrg, isPending: false }),
  useCreateExample: () => ({ mutate: createExample, isPending: false }),
  useListExamplesInfinite: () => listExamples(),
  useLeaveCurrentOrg: (options: Mutation) => {
    mutations.leave = options;
    return { mutate: leaveOrg, isPending: false, error: mutationState.leaveError ?? null };
  },
  useDeleteCurrentOrg: (options: Mutation) => {
    mutations.delete = options;
    return { mutate: deleteOrg, isPending: false, error: mutationState.deleteError ?? null };
  },
  getGetMeQueryKey: () => ["/api/me"],
  getListExamplesInfiniteQueryKey: () => ["infinite", "/api/example"],
}));

const org = (id: string, name: string) => ({ id, name, role: "org_admin" });
const ORG_A = org("aaaaaaaa-0000-4000-8000-000000000001", "Alpha");
const ORG_B = org("bbbbbbbb-0000-4000-8000-000000000002", "Beta");
const signedInAs = (orgs: object[]) =>
  me.mockReturnValue({ data: { user: { id: "u", email: "e", name: "" }, orgs }, isLoading: false });

beforeEach(() => {
  clerk.signedIn = true;
  selectOrg(null);
  for (const fn of [me, createOrg, createExample, listExamples, leaveOrg, deleteOrg]) {
    fn.mockReset();
  }
  mutationState.leaveError = undefined;
  mutationState.deleteError = undefined;
  listExamples.mockReturnValue({
    data: { pages: [{ items: [], nextCursor: null }] },
    isLoading: false,
  });
});

describe("/app", () => {
  it("sends signed-out visitors to sign-in", async () => {
    clerk.signedIn = false;
    renderAt("/app");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
    expect(me).not.toHaveBeenCalled();
  });

  it("asks someone without an org to create one", async () => {
    signedInAs([]);
    renderAt("/app");
    expect(await screen.findByRole("heading", { name: "Create your organization" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Organization name"), { target: { value: "Acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(createOrg).toHaveBeenCalledWith({ data: { name: "Acme" } });
  });

  it("works in the person's only org and remembers it", async () => {
    signedInAs([ORG_A]);
    renderAt("/app");
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
    expect(getSelectedOrgId()).toBe(ORG_A.id);
    expect(await screen.findByText("No records yet.")).toBeTruthy();
  });

  it("drops a remembered org the person no longer belongs to", async () => {
    selectOrg("cccccccc-0000-4000-8000-000000000003");
    signedInAs([ORG_A, ORG_B]);
    renderAt("/app");
    await screen.findByLabelText("Organization");
    expect(getSelectedOrgId()).toBe(ORG_A.id);
  });

  it("switches orgs, clearing every cached response except /me", async () => {
    signedInAs([ORG_A, ORG_B]);
    const { queryClient } = renderAt("/app");
    queryClient.setQueryData(["/api/me"], { kept: true });
    queryClient.setQueryData(["infinite", "/api/example"], { stale: "from Alpha" });
    fireEvent.change(await screen.findByLabelText("Organization"), { target: { value: ORG_B.id } });
    expect(getSelectedOrgId()).toBe(ORG_B.id);
    expect(queryClient.getQueryData(["/api/me"])).toEqual({ kept: true });
    expect(queryClient.getQueryData(["infinite", "/api/example"])).toBeUndefined();
  });

  it("lists records and adds one", async () => {
    signedInAs([ORG_A]);
    listExamples.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              {
                id: "r1",
                orgId: ORG_A.id,
                name: "First record",
                createdAt: "2026-01-01T00:00:00.000Z",
              },
            ],
            nextCursor: "c1",
          },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: vi.fn(),
    });
    renderAt("/app");
    expect(await screen.findByText("First record")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
    // The API's limit, so a long name is stopped in the form rather than refused by the API.
    expect(screen.getByLabelText("Record name").getAttribute("maxlength")).toBe("100");
    fireEvent.change(screen.getByLabelText("Record name"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createExample).toHaveBeenCalledWith({ data: { name: "Second" } });
  });
});

describe("/app: leaving and deleting the org", () => {
  const member = { ...ORG_A, role: "org_member" };

  it("lets a member leave, but not delete", async () => {
    signedInAs([member]);
    renderAt("/app");
    fireEvent.click(await screen.findByRole("button", { name: "Leave Alpha" }));
    expect(leaveOrg).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Delete organization" })).toBeNull();
  });

  it("deletes only once the admin has typed the org's exact name", async () => {
    signedInAs([ORG_A]);
    renderAt("/app");
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
    renderAt("/app");
    expect(await screen.findByText(/Make someone else an org admin/)).toBeTruthy();
    expect(screen.getByText("No access to that organization")).toBeTruthy();
  });

  it.each(["leave", "delete"] as const)(
    "after a %s, moves to another org with nothing cached from the old one",
    async (action) => {
      signedInAs([ORG_A, ORG_B]);
      selectOrg(ORG_A.id);
      const { queryClient } = renderAt("/app");
      await screen.findByRole("button", { name: "Leave Alpha" });
      queryClient.setQueryData(["infinite", "/api/example"], { stale: "from Alpha" });
      const refetchMe = vi.spyOn(queryClient, "invalidateQueries");

      signedInAs([ORG_B]); // what /me answers once refetched
      await act(() => mutations[action]?.mutation?.onSuccess?.());

      expect(refetchMe).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
      expect(getSelectedOrgId()).toBe(ORG_B.id);
      expect(queryClient.getQueryData(["infinite", "/api/example"])).toBeUndefined();
      expect(await screen.findByRole("heading", { name: "Beta" })).toBeTruthy();
    }
  );
});
