import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createMember, createOrg } from "../test-helpers/auth.js";
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

  const create = async (headers: Record<string, string>, name: string): Promise<Row> =>
    (await request.post("/api/example").set(headers).send({ name })).body;

  describe("access", () => {
    it("requires a signed-in member", async () => {
      expect((await request.get("/api/example")).status).toBe(401);
      expect((await request.post("/api/example").send({ name: "x" })).status).toBe(401);
    });

    it("lets a member act only in orgs they belong to", async () => {
      const m = await createMember(db);
      const other = await createOrg(db);
      expect((await request.get("/api/example").set(m.as(other))).status).toBe(403);
    });
  });

  describe("POST /", () => {
    it("creates a record in the member's org and returns 201", async () => {
      const m = await createMember(db);
      const res = await request.post("/api/example").set(m.headers).send({ name: "Alpha" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ orgId: m.orgs[0]?.id, name: "Alpha" });
    });

    it("ignores an org id in the body: the org comes from the session", async () => {
      const m = await createMember(db);
      const other = await createOrg(db);
      const res = await request
        .post("/api/example")
        .set(m.headers)
        .send({ name: "Sneaky", orgId: other.id });
      expect(res.status).toBe(201);
      expect(res.body.orgId).toBe(m.orgs[0]?.id);
    });

    it("enqueues an example-created job for the new record", async () => {
      const m = await createMember(db);
      const row = await create(m.headers, "Queued");
      expect(queue.enqueued).toContainEqual({
        name: "example-created",
        data: { exampleId: row.id, orgId: m.orgs[0]?.id },
      });
    });

    it("returns 400 when the body is invalid", async () => {
      const m = await createMember(db);
      const res = await request.post("/api/example").set(m.headers).send({ name: "" });
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.name).toBeDefined();
    });

    it("returns 400 for a name over 100 characters", async () => {
      const m = await createMember(db);
      const send = (name: string) => request.post("/api/example").set(m.headers).send({ name });
      expect((await send("x".repeat(100))).status).toBe(201);
      const res = await send("x".repeat(101));
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.name).toBeDefined();
    });
  });

  describe("GET / (list)", () => {
    it("returns an empty page for an org with no rows", async () => {
      const m = await createMember(db);
      const res = await request.get("/api/example").set(m.headers);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it("never returns rows from another org", async () => {
      const a = await createMember(db);
      const b = await createMember(db);
      await create(a.headers, "Item A");
      await create(b.headers, "Item B");
      const res = await request.get("/api/example").set(a.headers);
      expect(res.body.items.map((r: Row) => r.name)).toEqual(["Item A"]);
    });

    it("lists the org chosen with X-Org-Id for someone in several orgs", async () => {
      const [one, two] = [await createOrg(db), await createOrg(db)];
      const m = await createMember(db, { orgs: [one, two] });
      await create(m.as(two), "In two");
      expect((await request.get("/api/example").set(m.as(one))).body.items).toEqual([]);
      expect((await request.get("/api/example").set(m.as(two))).body.items).toHaveLength(1);
    });

    it("pages newest first and visits every row exactly once, including timestamp ties", async () => {
      const m = await createMember(db);
      const orgId = m.orgs[0]?.id;
      if (!orgId) throw new Error("expected an org");
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
        const query = new URLSearchParams({ limit: "2", ...(cursor ? { cursor } : {}) });
        const res = await request.get(`/api/example?${query}`).set(m.headers);
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
      const m = await createMember(db);
      const orgId = m.orgs[0]?.id;
      if (!orgId) throw new Error("expected an org");
      await db
        .insert(exampleTable)
        .values(Array.from({ length: 21 }, (_, i) => ({ orgId, name: `row ${i}` })));
      const res = await request.get("/api/example").set(m.headers);
      expect(res.body.items).toHaveLength(20);
      expect(res.body.nextCursor).toEqual(expect.any(String));
    });

    it.each(["0", "101", "abc"])("returns 400 for limit=%s", async (limit) => {
      const m = await createMember(db);
      expect((await request.get(`/api/example?limit=${limit}`).set(m.headers)).status).toBe(400);
    });

    it("returns 400 for a cursor it didn't issue", async () => {
      const m = await createMember(db);
      const res = await request.get("/api/example?cursor=not-a-cursor").set(m.headers);
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.cursor).toEqual(["Invalid cursor"]);
    });

    // Well-formed cursors whose values Postgres would reject must still be a 400, not a 500.
    it.each([
      ["an id that isn't a uuid", ["2026-01-01T00:00:00.000Z", "not-a-uuid"]],
      ["a date Postgres can't compare", ["+275760-09-13T00:00:00.000Z", missingId]],
      ["a date that isn't ISO", ["1 January 2026", missingId]],
      ["a date that doesn't exist", ["2026-13-45T00:00:00.000Z", missingId]],
    ])("returns 400 for a cursor with %s", async (_case, parts) => {
      const m = await createMember(db);
      const cursor = Buffer.from(JSON.stringify(parts)).toString("base64url");
      const res = await request.get(`/api/example?cursor=${cursor}`).set(m.headers);
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.cursor).toEqual(["Invalid cursor"]);
    });
  });

  describe("GET /:id", () => {
    it("returns the record", async () => {
      const m = await createMember(db);
      const row = await create(m.headers, "Get me");
      const res = await request.get(`/api/example/${row.id}`).set(m.headers);
      expect(res.status).toBe(200);
      expect(res.body).toEqual(row);
    });

    it("returns 404 for a missing id or another org's record", async () => {
      const owner = await createMember(db);
      const intruder = await createMember(db);
      const row = await create(owner.headers, "Private");
      expect((await request.get(`/api/example/${missingId}`).set(owner.headers)).status).toBe(404);
      expect((await request.get(`/api/example/${row.id}`).set(intruder.headers)).status).toBe(404);
    });

    it("returns 400 for a malformed id", async () => {
      const m = await createMember(db);
      expect((await request.get("/api/example/not-a-uuid").set(m.headers)).status).toBe(400);
    });
  });

  describe("PATCH /:id", () => {
    it("updates the name and touches updatedAt", async () => {
      const m = await createMember(db);
      const row = await create(m.headers, "Before");
      await new Promise((r) => setTimeout(r, 5));
      const res = await request
        .patch(`/api/example/${row.id}`)
        .set(m.headers)
        .send({ name: "After" });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: row.id, name: "After", createdAt: row.createdAt });
      expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
        new Date(row.updatedAt).getTime()
      );
    });

    it("returns 404 for another org's record, leaving it unchanged", async () => {
      const owner = await createMember(db);
      const intruder = await createMember(db);
      const row = await create(owner.headers, "Keep");
      const res = await request
        .patch(`/api/example/${row.id}`)
        .set(intruder.headers)
        .send({ name: "Hijacked" });
      expect(res.status).toBe(404);
      const after = await request.get(`/api/example/${row.id}`).set(owner.headers);
      expect(after.body.name).toBe("Keep");
    });

    it("returns 400 for an invalid body", async () => {
      const m = await createMember(db);
      const row = await create(m.headers, "Valid");
      const res = await request.patch(`/api/example/${row.id}`).set(m.headers).send({ name: "" });
      expect(res.status).toBe(400);
      const long = { name: "x".repeat(101) };
      expect((await request.patch(`/api/example/${row.id}`).set(m.headers).send(long)).status).toBe(
        400
      );
    });
  });

  describe("DELETE /:id", () => {
    it("deletes the record: 204, then 404", async () => {
      const m = await createMember(db);
      const row = await create(m.headers, "Doomed");
      expect((await request.delete(`/api/example/${row.id}`).set(m.headers)).status).toBe(204);
      expect((await request.get(`/api/example/${row.id}`).set(m.headers)).status).toBe(404);
    });

    it("returns 404 for another org's record, leaving it in place", async () => {
      const owner = await createMember(db);
      const intruder = await createMember(db);
      const row = await create(owner.headers, "Survivor");
      const res = await request.delete(`/api/example/${row.id}`).set(intruder.headers);
      expect(res.status).toBe(404);
      expect((await request.get(`/api/example/${row.id}`).set(owner.headers)).status).toBe(200);
    });
  });
});
