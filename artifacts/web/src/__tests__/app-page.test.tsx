import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentOrgId, getLastOrgId, rememberLastOrg, setCurrentOrgId } from "../org.ts";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

const me = vi.fn();
const createOrg = vi.fn();
const createExample = vi.fn();
const listExamples = vi.fn();
vi.mock("@repo/api-client-react", () => ({
  useGetHealth: () => ({ data: undefined, isLoading: true, isError: false }),
  useGetMe: () => me(),
  useCreateOrg: () => ({ mutate: createOrg, isPending: false, error: null }),
  useCheckOrgHandle: () => ({ data: undefined, isFetching: false, error: null }),
  useCreateExample: () => ({ mutate: createExample, isPending: false }),
  useListExamplesInfinite: () => listExamples(),
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

beforeEach(() => {
  clerk.signedIn = true;
  setCurrentOrgId(null);
  rememberLastOrg(null);
  for (const fn of [me, createOrg, createExample, listExamples]) fn.mockReset();
  listExamples.mockReturnValue({
    data: { pages: [{ items: [], nextCursor: null }] },
    isLoading: false,
  });
});

describe("/app, home", () => {
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
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });

  it("opens the org used last, if the person still belongs to it", async () => {
    rememberLastOrg(ORG_B.id);
    signedInAs([ORG_A, ORG_B]);
    const { router } = renderAt("/app");
    await screen.findByLabelText("Organization");
    expect(router.state.location.pathname).toBe("/o/beta");
  });

  it("else their first", async () => {
    rememberLastOrg("cccccccc-0000-4000-8000-000000000003");
    signedInAs([ORG_A, ORG_B]);
    const { router } = renderAt("/app");
    await screen.findByLabelText("Organization");
    expect(router.state.location.pathname).toBe("/o/alpha");
    expect(getLastOrgId()).toBe(ORG_A.id);
  });

  it("shows the account loading, then failing to load", async () => {
    me.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt("/app");
    const loading = await screen.findByText("Loading…");
    // In the same centered column as what replaces it, not against the left edge.
    expect(loading.closest("main")?.className).toContain("max-w-content mx-auto");
    me.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") });
    renderAt("/app");
    expect(await screen.findByText(/Couldn't load your account: boom/)).toBeTruthy();
  });
});

describe("/o/<handle>, the org scope", () => {
  it("sends signed-out visitors to sign-in", async () => {
    clerk.signedIn = false;
    renderAt("/o/alpha");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
  });

  it("opens the org the address names, and requests are for it", async () => {
    signedInAs([ORG_A]);
    renderAt("/o/alpha");
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
    expect(getCurrentOrgId()).toBe(ORG_A.id);
    expect(getLastOrgId()).toBe(ORG_A.id);
    expect(await screen.findByText("No records yet.")).toBeTruthy();
    // Members are a settings section, opened over this page.
    expect(screen.getByRole("link", { name: "Members" }).getAttribute("href")).toBe(
      "/o/alpha?settings=members"
    );
  });

  it("takes the org from the address, never from what the browser remembers", async () => {
    rememberLastOrg(ORG_B.id);
    signedInAs([ORG_A, ORG_B]);
    renderAt("/o/alpha");
    await screen.findByLabelText("Organization");
    expect(getCurrentOrgId()).toBe(ORG_A.id);
  });

  it("matches the handle whatever its case", async () => {
    signedInAs([ORG_A]);
    renderAt("/o/Alpha");
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
  });

  it.each([
    ["doesn't exist", "nope"],
    ["isn't the person's", "beta"],
  ])("answers the same for a handle that %s, without switching org", async (_, handle) => {
    signedInAs([ORG_A]);
    setCurrentOrgId(ORG_A.id);
    renderAt(`/o/${handle}`);
    expect(
      await screen.findByRole("heading", { name: "Not found, or you don't have access" })
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to your organizations" })).toBeTruthy();
    expect(getCurrentOrgId()).toBe(ORG_A.id);
    expect(listExamples).not.toHaveBeenCalled();
  });

  it("shows the account loading, then failing to load", async () => {
    me.mockReturnValue({ data: undefined, isLoading: true, error: null });
    renderAt("/o/alpha");
    const loading = await screen.findByText("Loading…");
    // In the same centered column as what replaces it, not against the left edge.
    expect(loading.closest("main")?.className).toContain("max-w-content mx-auto");
    me.mockReturnValue({ data: undefined, isLoading: false, error: new Error("boom") });
    renderAt("/o/alpha");
    expect(await screen.findByText(/Couldn't load your account: boom/)).toBeTruthy();
  });

  it("switches org by address, clearing every cached response except /me", async () => {
    signedInAs([ORG_A, ORG_B]);
    const { router, queryClient } = renderAt("/o/alpha");
    const picker = await screen.findByLabelText("Organization");
    queryClient.setQueryData(["/api/me"], { kept: true });
    queryClient.setQueryData(["infinite", "/api/example"], { stale: "from Alpha" });
    await act(async () => {
      fireEvent.change(picker, { target: { value: "beta" } });
    });
    expect(router.state.location.pathname).toBe("/o/beta");
    expect(getCurrentOrgId()).toBe(ORG_B.id);
    expect(queryClient.getQueryData(["/api/me"])).toEqual({ kept: true });
    expect(queryClient.getQueryData(["infinite", "/api/example"])).toBeUndefined();
  });

  it("creates another org from inside one", async () => {
    signedInAs([ORG_A]);
    renderAt("/o/alpha");
    fireEvent.click(await screen.findByRole("button", { name: "New organization" }));
    expect(screen.getByRole("heading", { name: "New organization" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByRole("heading", { name: "Alpha" })).toBeTruthy();
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
    renderAt("/o/alpha");
    expect(await screen.findByText("First record")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Load more" })).toBeTruthy();
    // The API's limit, so a long name is stopped in the form rather than refused by the API.
    expect(screen.getByLabelText("Record name").getAttribute("maxlength")).toBe("100");
    fireEvent.change(screen.getByLabelText("Record name"), { target: { value: "Second" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(createExample).toHaveBeenCalledWith({ data: { name: "Second" } });
  });
});
