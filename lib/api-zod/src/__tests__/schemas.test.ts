import { describe, expect, it } from "vitest";
import { CreateExampleBody, GetHealthResponse, ListExamplesResponseItem } from "../index.js";

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

describe("ListExamplesResponseItem", () => {
  const valid = {
    id: validUuid,
    orgId: "org_1",
    name: "Test",
    createdAt: validTs,
    updatedAt: validTs,
  };

  it("accepts a valid example", () => {
    expect(ListExamplesResponseItem.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid UUID", () => {
    expect(ListExamplesResponseItem.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing orgId", () => {
    const { orgId: _, ...rest } = valid;
    expect(ListExamplesResponseItem.safeParse(rest).success).toBe(false);
  });
});

describe("CreateExampleBody", () => {
  it("accepts valid input", () => {
    expect(CreateExampleBody.safeParse({ orgId: "org_1", name: "Test" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CreateExampleBody.safeParse({ orgId: "org_1", name: "" }).success).toBe(false);
  });

  it("rejects empty orgId", () => {
    expect(CreateExampleBody.safeParse({ orgId: "", name: "Test" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(CreateExampleBody.safeParse({ name: "Test" }).success).toBe(false);
  });
});
