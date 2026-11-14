import { ApiError } from "@repo/api-client-react/client";
import { createQueryClient, useForgetOnUserChange } from "@repo/api-client-react/query-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const attempts = async (error: Error) => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const queryFn = vi.fn().mockRejectedValue(error);
  const client = createQueryClient();
  client.setDefaultOptions({
    queries: { ...client.getDefaultOptions().queries, retryDelay: 0 },
  });
  await client.fetchQuery({ queryKey: ["q"], queryFn }).catch(() => {});
  return queryFn.mock.calls.length;
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createQueryClient's retries", () => {
  it.each([401, 403, 404, 429])("takes the API's %i as its answer", async (status) => {
    expect(await attempts(new ApiError(status, { error: "no" }))).toBe(1);
  });

  it("tries a server error once more", async () => {
    expect(await attempts(new ApiError(503, { error: "down" }))).toBe(2);
  });

  it("tries a network failure once more", async () => {
    expect(await attempts(new TypeError("Failed to fetch"))).toBe(2);
  });
});

describe("useForgetOnUserChange", () => {
  const session = (first: string | null | undefined) => {
    const client = new QueryClient();
    client.setQueryData(["/api/me"], "theirs");
    const view = renderHook(({ userId }) => useForgetOnUserChange(userId), {
      initialProps: { userId: first },
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });
    const cached = () => client.getQueryData(["/api/me"]);
    return { cached, becomes: (userId: string | null | undefined) => view.rerender({ userId }) };
  };

  it("keeps the cache while the session loads and the same person stays", () => {
    const s = session(undefined);
    s.becomes("user_a");
    s.becomes("user_a");
    expect(s.cached()).toBe("theirs");
  });

  it("forgets everything on sign-out", () => {
    const s = session("user_a");
    s.becomes(null);
    expect(s.cached()).toBeUndefined();
  });

  it("forgets everything when the session changes hands without a sign-out", () => {
    const s = session("user_a");
    s.becomes("user_b");
    expect(s.cached()).toBeUndefined();
  });

  it("forgets what a signed-out visitor loaded once someone signs in", () => {
    const s = session(null);
    s.becomes("user_a");
    expect(s.cached()).toBeUndefined();
  });
});
