import { describe, expect, it } from "vitest";
import {
  CreateExampleBody,
  GetExampleResponse,
  GetHealthResponse,
  ListExamplesQueryParams,
  ListExamplesResponse,
} from "../index.js";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";
const validTs = new Date().toISOString();

describe("GetHealthResponse", () => {
  const valid = { status: "ok", ts: validTs, db: "ok", sha: null };

  it("accepts a valid response, with or without a commit sha", () => {
    expect(GetHealthResponse.safeParse(valid).success).toBe(true);
    expect(GetHealthResponse.safeParse({ ...valid, sha: "abc123" }).success).toBe(true);
  });

  it("rejects a non-ok status", () => {
    expect(GetHealthResponse.safeParse({ ...valid, status: "error" }).success).toBe(false);
  });

  it("rejects a missing timestamp", () => {
    const { ts: _, ...rest } = valid;
    expect(GetHealthResponse.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing db field", () => {
    const { db: _, ...rest } = valid;
    expect(GetHealthResponse.safeParse(rest).success).toBe(false);
  });
});

const validExample = {
  id: validUuid,
  orgId: "123e4567-e89b-42d3-a456-426614174001",
  name: "Test",
  createdAt: validTs,
  updatedAt: validTs,
};

describe("GetExampleResponse", () => {
  it("accepts a valid example", () => {
    expect(GetExampleResponse.safeParse(validExample).success).toBe(true);
  });

  it("rejects an invalid UUID", () => {
    expect(GetExampleResponse.safeParse({ ...validExample, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing orgId", () => {
    const { orgId: _, ...rest } = validExample;
    expect(GetExampleResponse.safeParse(rest).success).toBe(false);
  });
});

describe("ListExamplesResponse (a page)", () => {
  it("accepts items with a next cursor, or null on the last page", () => {
    expect(ListExamplesResponse.safeParse({ items: [validExample], nextCursor: "c" }).success).toBe(
      true
    );
    expect(ListExamplesResponse.safeParse({ items: [], nextCursor: null }).success).toBe(true);
  });

  it("rejects a bare array (the pre-pagination shape)", () => {
    expect(ListExamplesResponse.safeParse([validExample]).success).toBe(false);
  });
});

describe("ListExamplesQueryParams", () => {
  it("coerces limit from the query string and defaults it to 20", () => {
    expect(ListExamplesQueryParams.parse({ limit: "5" }).limit).toBe(5);
    expect(ListExamplesQueryParams.parse({}).limit).toBe(20);
  });

  it("rejects limits outside 1–100", () => {
    expect(ListExamplesQueryParams.safeParse({ limit: "0" }).success).toBe(false);
    expect(ListExamplesQueryParams.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("CreateExampleBody", () => {
  it("accepts valid input", () => {
    expect(CreateExampleBody.safeParse({ name: "Test" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CreateExampleBody.safeParse({ name: "" }).success).toBe(false);
  });

  it("drops an org id from the body: the org comes from the session", () => {
    expect(CreateExampleBody.parse({ name: "Test", orgId: "someone-else" })).toEqual({
      name: "Test",
    });
  });

  it("rejects a missing name", () => {
    expect(CreateExampleBody.safeParse({}).success).toBe(false);
  });
});
