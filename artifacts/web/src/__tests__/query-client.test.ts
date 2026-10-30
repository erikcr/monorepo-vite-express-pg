import { ApiError } from "@repo/api-client-react/client";
import { createQueryClient } from "@repo/api-client-react/query-client";
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
