import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rememberLastOrg, setCurrentOrgId } from "../org.ts";
import { renderAt } from "../test-helpers/render.tsx";
import { clerk } from "./clerk-mock.tsx";

vi.mock("@clerk/react", () => import("./clerk-mock.tsx"));

type Options = { mutation?: { onSuccess?: (org: object) => Promise<unknown> } };
type Check = { data?: object; isFetching: boolean; error: Error | null };
const createOrg = vi.fn();
const check = vi.fn<(params: { handle: string }) => Check>();
const state: { options?: Options; error?: Error } = {};
vi.mock("@repo/api-client-react", () => ({
  useGetMe: () => ({
    data: { user: { id: "u", email: "e", name: "" }, orgs: [] },
    isLoading: false,
  }),
  useCreateOrg: (options: Options) => {
    state.options = options;
    return { mutate: createOrg, isPending: false, error: state.error ?? null };
  },
  useCheckOrgHandle: (params: { handle: string }) => check(params),
  getGetMeQueryKey: () => ["/api/me"],
}));

const answer = (data: object): Check => ({ data, isFetching: false, error: null });
const handleField = () => screen.getByLabelText("Handle") as HTMLInputElement;
const status = () => document.getElementById("handle-status")?.textContent;
const createButton = () => screen.getByRole("button", { name: "Create" });

beforeEach(() => {
  clerk.signedIn = true;
  setCurrentOrgId(null);
  rememberLastOrg(null);
  createOrg.mockReset();
  check.mockReset();
  check.mockImplementation(({ handle }) => answer({ handle, available: true }));
  state.error = undefined;
});

describe("creating an org: the handle", () => {
  it("follows the name until edited, lowercased as typed", async () => {
    renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme, Inc." } });
    expect(handleField().value).toBe("acme-inc");
    fireEvent.change(handleField(), { target: { value: "ACME" } });
    expect(handleField().value).toBe("acme");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Two" } });
    expect(handleField().value).toBe("acme");
  });

  it("is checked once typing stops, then shown available", async () => {
    renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme" } });
    expect(status()).toBe("Checking…");
    await waitFor(() => expect(status()).toBe("Available"));
    expect(check).toHaveBeenLastCalledWith({ handle: "acme" });
    expect(check).not.toHaveBeenCalledWith({ handle: "a" });
    expect(createButton().hasAttribute("disabled")).toBe(false);
  });

  it("shows checking while the API answers", async () => {
    check.mockReturnValue({ data: undefined, isFetching: true, error: null });
    renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme" } });
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(status()).toBe("Checking…");
  });

  it.each([
    ["taken", "That handle is taken"],
    ["reserved", "That handle is reserved"],
    [
      "invalid",
      "Use 3–40 lowercase letters, digits and single hyphens, with no hyphen at either end",
    ],
  ])("says why it's unavailable (%s), and won't create", async (reason, message) => {
    check.mockImplementation(({ handle }) => answer({ handle, available: false, reason }));
    renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme" } });
    await waitFor(() => expect(status()).toBe(message));
    expect(createButton().hasAttribute("disabled")).toBe(true);
  });

  it("lets the person try a handle that couldn't be checked", async () => {
    check.mockReturnValue({ data: undefined, isFetching: false, error: new Error("offline") });
    renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme" } });
    await waitFor(() => expect(status()).toBe("Couldn't check this handle; you can still try it."));
    expect(createButton().hasAttribute("disabled")).toBe(false);
  });
});

describe("creating an org", () => {
  it("sends the name and handle, then opens the new org at its address", async () => {
    const { router } = renderAt("/app");
    fireEvent.change(await screen.findByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.click(createButton());
    expect(createOrg).toHaveBeenCalledWith({ data: { name: "Acme", handle: "acme" } });
    await act(() =>
      state.options?.mutation?.onSuccess?.({
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        name: "Acme",
        handle: "acme",
        role: "org_admin",
      })
    );
    expect(router.state.location.pathname).toBe("/o/acme");
  });

  it("shows why the API refused", async () => {
    state.error = new Error("That handle is taken");
    renderAt("/app");
    expect(await screen.findByText("That handle is taken")).toBeTruthy();
  });
});
