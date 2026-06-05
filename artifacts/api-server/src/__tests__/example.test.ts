import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

describe("/api/example", () => {
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    request = supertest(createApp(await createTestDb()));
  });

  it("GET / returns an array", async () => {
    const res = await request.get("/api/example");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST / creates a record and returns 201", async () => {
    const res = await request.post("/api/example").send({ orgId: "org_test", name: "Alpha" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ orgId: "org_test", name: "Alpha" });
    expect(typeof res.body.id).toBe("string");
  });

  it("GET / returns the created record", async () => {
    await request.post("/api/example").send({ orgId: "org_a", name: "Item A" });
    const res = await request.get("/api/example");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it("POST / returns 400 when body is invalid", async () => {
    const res = await request.post("/api/example").send({ orgId: "", name: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("GET /?orgId= filters by org", async () => {
    await request.post("/api/example").send({ orgId: "org_filter", name: "Filtered" });
    await request.post("/api/example").send({ orgId: "org_other", name: "Other" });

    const res = await request.get("/api/example?orgId=org_filter");
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((r: { orgId: string }) => r.orgId === "org_filter")).toBe(true);
  });
});
