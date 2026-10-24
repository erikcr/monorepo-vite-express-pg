import { act, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

type Options = { mutation?: { onSuccess?: (org: object) => Promise<unknown> } };
const accept = vi.fn();
const state: { options?: Options; error?: Error } = {};
vi.mock("@repo/api-client-react", () => ({
  useGetMe: () => ({
    data: { user: { id: "u", email: "ann@x.test", name: "" }, orgs: [] },
    isLoading: false,
  }),
  useAcceptInvitation: (options: Options) => {
    state.options = options;
    return { mutate: accept, isPending: false, error: state.error ?? null };
  },
  getGetMeQueryKey: () => ["/api/me"],
}));

const ORG = {
  id: "aaaaaaaa-0000-4000-8000-000000000001",
  name: "Alpha",
  handle: "alpha",
  role: "org_member",
};

beforeEach(() => {
  clerk.signedIn = true;
  accept.mockReset();
  state.error = undefined;
});

describe("/invite", () => {
  it("sends signed-out visitors to sign-in (Clerk returns them to the link)", async () => {
    clerk.signedIn = false;
    renderAt("/invite#tok");
    expect(await screen.findByText("redirecting to sign-in")).toBeTruthy();
  });

  it("accepts the token from the link's fragment, on request", async () => {
    renderAt("/invite#tok_123-abc");
    expect(await screen.findByText("Signed in as ann@x.test")).toBeTruthy();
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));
    expect(accept).toHaveBeenCalledWith({ data: { token: "tok_123-abc" } });
  });

  it("then opens the org joined, at its address", async () => {
    const { router, queryClient } = renderAt("/invite#tok");
    await screen.findByRole("button", { name: "Accept invitation" });
    const refetchMe = vi.spyOn(queryClient, "invalidateQueries");
    await act(() => state.options?.mutation?.onSuccess?.(ORG));
    expect(refetchMe).toHaveBeenCalledWith({ queryKey: ["/api/me"] });
    expect(router.state.location.pathname).toBe("/o/alpha");
  });

  it("explains a link without its token", async () => {
    renderAt("/invite");
    expect(await screen.findByText(/This invitation link is incomplete/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept invitation" })).toBeNull();
  });

  it("shows why the API refused", async () => {
    state.error = new Error("This invitation is for a different email address");
    renderAt("/invite#tok");
    expect(
      await screen.findByText("This invitation is for a different email address")
    ).toBeTruthy();
  });
});
