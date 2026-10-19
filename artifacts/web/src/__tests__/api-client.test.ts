import { ApiError, apiFetch, configureApiClient } from "@repo/api-client-react/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn(
  async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true }), { status: 200 })
);
const sentHeaders = () => new Headers(fetchMock.mock.calls.at(-1)?.[1]?.headers);

afterEach(() => {
  configureApiClient({});
  fetchMock.mockClear();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends the session token and the selected org", async () => {
    vi.stubGlobal("fetch", fetchMock);
    configureApiClient({ getToken: async () => "tok_123", getOrgId: () => "org-1" });
    await apiFetch("/api/example");
    expect(sentHeaders().get("authorization")).toBe("Bearer tok_123");
    expect(sentHeaders().get("x-org-id")).toBe("org-1");
  });

  it("sends neither when signed out with no org selected", async () => {
    vi.stubGlobal("fetch", fetchMock);
    configureApiClient({ getToken: async () => null, getOrgId: () => null });
    await apiFetch("/health");
    expect(sentHeaders().has("authorization")).toBe(false);
    expect(sentHeaders().has("x-org-id")).toBe(false);
  });

  it("carries on signed out when the identity provider fails", async () => {
    vi.stubGlobal("fetch", fetchMock);
    configureApiClient({ getToken: () => Promise.reject(new Error("Clerk failed to initialize")) });
    await expect(apiFetch("/health")).resolves.toEqual({ ok: true });
    expect(sentHeaders().has("authorization")).toBe(false);
  });

  it("throws ApiError with the status, message and code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Pick one", code: "org_required" }), { status: 400 })
      )
    );
    const error = await apiFetch("/api/example").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, message: "Pick one", code: "org_required" });
  });

  it("keeps a non-JSON error body as text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad gateway", { status: 502 }))
    );
    const error = (await apiFetch("/x").catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(502);
    expect(error.body).toBe("Bad gateway");
    expect(error.code).toBeUndefined();
  });
});
