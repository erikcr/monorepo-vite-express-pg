import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

type Row = { id: string; orgId: string; name: string; createdAt: string; updatedAt: string };
const missingId = "00000000-0000-4000-8000-000000000000";

describe("/api/example", () => {
  let request: ReturnType<typeof supertest>;
  let db: Db;
  const queue = createFakeQueue();

  beforeAll(async () => {
    db = await createTestDb();
    request = supertest(createApp(db, queue));
  });

  const create = async (orgId: string, name: string): Promise<Row> =>
    (await request.post("/api/example").send({ orgId, name })).body;

  describe("POST /", () => {
    it("creates a record and returns 201", async () => {
      const res = await request.post("/api/example").send({ orgId: "org_test", name: "Alpha" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ orgId: "org_test", name: "Alpha" });
      expect(typeof res.body.id).toBe("string");
    });

    it("enqueues an example-created job for the new record", async () => {
      const row = await create("org_job", "Queued");
      expect(queue.enqueued).toContainEqual({
        name: "example-created",
        data: { exampleId: row.id, orgId: "org_job" },
      });
    });

    it("returns 400 when the body is invalid", async () => {
      const res = await request.post("/api/example").send({ orgId: "", name: "" });
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });
  });

  describe("GET / (list)", () => {
    it("returns 400 without orgId (tenant isolation)", async () => {
      const res = await request.get("/api/example");
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it("returns an empty page for an org with no rows", async () => {
      const res = await request.get("/api/example?orgId=org_empty");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it("never returns rows from another org", async () => {
      await create("org_a", "Item A");
      await create("org_b", "Item B");
      const res = await request.get("/api/example?orgId=org_a");
      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
      expect(res.body.items.every((r: Row) => r.orgId === "org_a")).toBe(true);
    });

    it("pages newest first and visits every row exactly once, including timestamp ties", async () => {
      const orgId = "org_pages";
      // Five rows sharing one createdAt (ties are broken by id), plus two older ones.
      const tie = new Date("2026-01-02T00:00:00.000Z");
      await db
        .insert(exampleTable)
        .values([
          ...[1, 2, 3, 4, 5].map((n) => ({ orgId, name: `tie ${n}`, createdAt: tie })),
          { orgId, name: "old 1", createdAt: new Date("2026-01-01T00:00:00.000Z") },
          { orgId, name: "old 2", createdAt: new Date("2025-12-31T00:00:00.000Z") },
        ]);

      const seen: Row[] = [];
      let cursor: string | null = null;
      do {
        const query = new URLSearchParams({ orgId, limit: "2", ...(cursor ? { cursor } : {}) });
        const res = await request.get(`/api/example?${query}`);
        expect(res.status).toBe(200);
        expect(res.body.items.length).toBeLessThanOrEqual(2);
        seen.push(...res.body.items);
        cursor = res.body.nextCursor;
      } while (cursor);

      expect(seen).toHaveLength(7);
      expect(new Set(seen.map((r) => r.id)).size).toBe(7);
      const order = seen.map((r) => [r.createdAt, r.id].join("|"));
      expect(order).toEqual([...order].sort().reverse());
      expect(seen.slice(-2).map((r) => r.name)).toEqual(["old 1", "old 2"]);
    });

    it("defaults to 20 per page", async () => {
      const orgId = "org_default_limit";
      await db
        .insert(exampleTable)
        .values(Array.from({ length: 21 }, (_, i) => ({ orgId, name: `row ${i}` })));
      const res = await request.get(`/api/example?orgId=${orgId}`);
      expect(res.body.items).toHaveLength(20);
      expect(res.body.nextCursor).toEqual(expect.any(String));
    });

    it.each(["0", "101", "abc"])("returns 400 for limit=%s", async (limit) => {
      const res = await request.get(`/api/example?orgId=org_a&limit=${limit}`);
      expect(res.status).toBe(400);
    });

    it("returns 400 for a cursor it didn't issue", async () => {
      const res = await request.get("/api/example?orgId=org_a&cursor=not-a-cursor");
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.cursor).toEqual(["Invalid cursor"]);
    });
  });

  describe("GET /:id", () => {
    it("returns the record", async () => {
      const row = await create("org_get", "Get me");
      const res = await request.get(`/api/example/${row.id}?orgId=org_get`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(row);
    });

    it("returns 404 for a missing id", async () => {
      const res = await request.get(`/api/example/${missingId}?orgId=org_get`);
      expect(res.status).toBe(404);
    });

    it("returns 404 for another org's record", async () => {
      const row = await create("org_owner", "Private");
      const res = await request.get(`/api/example/${row.id}?orgId=org_intruder`);
      expect(res.status).toBe(404);
    });

    it("returns 400 for a malformed id or missing orgId", async () => {
      expect((await request.get("/api/example/not-a-uuid?orgId=org_get")).status).toBe(400);
      expect((await request.get(`/api/example/${missingId}`)).status).toBe(400);
    });
  });

  describe("PATCH /:id", () => {
    it("updates the name and touches updatedAt", async () => {
      const row = await create("org_patch", "Before");
      await new Promise((r) => setTimeout(r, 5));
      const res = await request
        .patch(`/api/example/${row.id}?orgId=org_patch`)
        .send({ name: "After" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: row.id, name: "After", createdAt: row.createdAt });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(row.updatedAt).getTime()
      );
    });

    it("returns 404 for another org's record, leaving it unchanged", async () => {
      const row = await create("org_owner", "Keep");
      const res = await request
        .patch(`/api/example/${row.id}?orgId=org_intruder`)
        .send({ name: "Hijacked" });
      expect(res.status).toBe(404);
      const after = await request.get(`/api/example/${row.id}?orgId=org_owner`);
      expect(after.body.name).toBe("Keep");
    });

    it("returns 400 for an invalid body", async () => {
      const row = await create("org_patch", "Valid");
      const res = await request.patch(`/api/example/${row.id}?orgId=org_patch`).send({ name: "" });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /:id", () => {
    it("deletes the record: 204, then 404", async () => {
      const row = await create("org_delete", "Doomed");
      const res = await request.delete(`/api/example/${row.id}?orgId=org_delete`);
      expect(res.status).toBe(204);
      expect((await request.get(`/api/example/${row.id}?orgId=org_delete`)).status).toBe(404);
    });

    it("returns 404 for another org's record, leaving it in place", async () => {
      const row = await create("org_owner", "Survivor");
      const res = await request.delete(`/api/example/${row.id}?orgId=org_intruder`);
      expect(res.status).toBe(404);
      expect((await request.get(`/api/example/${row.id}?orgId=org_owner`)).status).toBe(200);
    });
  });
});
