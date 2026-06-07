import { describe, expect, it } from "vitest";
import { createExampleBody, getHealthResponse, listExamplesResponseItem } from "../index.js";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";
const validTs = new Date().toISOString();

describe("getHealthResponse", () => {
  it("accepts a valid response", () => {
    expect(getHealthResponse.safeParse({ status: "ok", ts: validTs, db: "ok" }).success).toBe(true);
  });

  it("rejects a non-ok status", () => {
    expect(getHealthResponse.safeParse({ status: "error", ts: validTs, db: "ok" }).success).toBe(
      false
    );
  });

  it("rejects a missing timestamp", () => {
    expect(getHealthResponse.safeParse({ status: "ok", db: "ok" }).success).toBe(false);
  });

  it("rejects a missing db field", () => {
    expect(getHealthResponse.safeParse({ status: "ok", ts: validTs }).success).toBe(false);
  });
});

describe("listExamplesResponseItem", () => {
  const valid = {
    id: validUuid,
    orgId: "org_1",
    name: "Test",
    createdAt: validTs,
    updatedAt: validTs,
  };

  it("accepts a valid example", () => {
    expect(listExamplesResponseItem.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid UUID", () => {
    expect(listExamplesResponseItem.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing orgId", () => {
    const { orgId: _, ...rest } = valid;
    expect(listExamplesResponseItem.safeParse(rest).success).toBe(false);
  });
});

describe("createExampleBody", () => {
  it("accepts valid input", () => {
    expect(createExampleBody.safeParse({ orgId: "org_1", name: "Test" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createExampleBody.safeParse({ orgId: "org_1", name: "" }).success).toBe(false);
  });

  it("rejects empty orgId", () => {
    expect(createExampleBody.safeParse({ orgId: "", name: "Test" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(createExampleBody.safeParse({ name: "Test" }).success).toBe(false);
  });
});
