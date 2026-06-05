import { describe, expect, it } from "vitest";
import { CreateExampleInputSchema, ExampleSchema, HealthResponseSchema } from "../index.js";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";
const validTs = new Date().toISOString();

describe("HealthResponseSchema", () => {
  it("accepts a valid response", () => {
    expect(HealthResponseSchema.safeParse({ status: "ok", ts: validTs }).success).toBe(true);
  });

  it("rejects a non-ok status", () => {
    expect(HealthResponseSchema.safeParse({ status: "error", ts: validTs }).success).toBe(false);
  });

  it("rejects a missing timestamp", () => {
    expect(HealthResponseSchema.safeParse({ status: "ok" }).success).toBe(false);
  });
});

describe("ExampleSchema", () => {
  const valid = {
    id: validUuid,
    orgId: "org_1",
    name: "Test",
    createdAt: validTs,
    updatedAt: validTs,
  };

  it("accepts a valid example", () => {
    expect(ExampleSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid UUID", () => {
    expect(ExampleSchema.safeParse({ ...valid, id: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects missing orgId", () => {
    const { orgId: _, ...rest } = valid;
    expect(ExampleSchema.safeParse(rest).success).toBe(false);
  });
});

describe("CreateExampleInputSchema", () => {
  it("accepts valid input", () => {
    expect(CreateExampleInputSchema.safeParse({ orgId: "org_1", name: "Test" }).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(CreateExampleInputSchema.safeParse({ orgId: "org_1", name: "" }).success).toBe(false);
  });

  it("rejects empty orgId", () => {
    expect(CreateExampleInputSchema.safeParse({ orgId: "", name: "Test" }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(CreateExampleInputSchema.safeParse({ name: "Test" }).success).toBe(false);
  });
});
