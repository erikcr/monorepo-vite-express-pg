import type { Db } from "@repo/db";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { bearer, createMember, createOrg, grantStaff } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

let db: Db;
let request: ReturnType<typeof supertest>;
const staff = bearer({ sub: "user_staff", email: "staff@x.test" });

beforeAll(async () => {
  db = await createTestDb();
  request = supertest(createApp(db, createFakeQueue()));
  await grantStaff(db, "staff@x.test", "staff_support");
});

type AdminOrg = { id: string; name: string; memberCount: number };

describe("GET /api/admin/orgs", () => {
  it("is for staff only", async () => {
    expect((await request.get("/api/admin/orgs")).status).toBe(401);
    const member = await createMember(db, { role: "org_admin" });
    expect((await request.get("/api/admin/orgs").set(member.headers)).status).toBe(403);
  });

  it("lists every org newest first, with member counts", async () => {
    const empty = await createOrg(db, "Empty Co");
    const busy = await createOrg(db, "Busy Co");
    await createMember(db, { orgs: [busy] });
    await createMember(db, { orgs: [busy] });
    const res = await request.get("/api/admin/orgs?limit=100").set(staff);
    expect(res.status).toBe(200);
    const byId = new Map<string, AdminOrg>(res.body.items.map((o: AdminOrg) => [o.id, o]));
    expect(byId.get(busy.id)?.memberCount).toBe(2);
    expect(byId.get(empty.id)?.memberCount).toBe(0);
    const ids = res.body.items.map((o: AdminOrg) => o.id);
    expect(ids.indexOf(busy.id)).toBeLessThan(ids.indexOf(empty.id));
  });

  it("searches names case-insensitively, treating % and _ literally", async () => {
    await createOrg(db, "Searchable Widgets");
    await createOrg(db, "100% Juice");
    await createOrg(db, "1000 Juices");
    const names = async (q: string) =>
      (await request.get(`/api/admin/orgs?q=${encodeURIComponent(q)}`).set(staff)).body.items.map(
        (o: AdminOrg) => o.name
      );
    expect(await names("searchable")).toEqual(["Searchable Widgets"]);
    expect(await names("100%")).toEqual(["100% Juice"]);
  });

  it("pages with a cursor", async () => {
    for (let i = 0; i < 3; i++) await createOrg(db, `Paged ${i}`);
    const first = await request.get("/api/admin/orgs?q=Paged&limit=2").set(staff);
    expect(first.body.items).toHaveLength(2);
    const second = await request
      .get(`/api/admin/orgs?q=Paged&limit=2&cursor=${first.body.nextCursor}`)
      .set(staff);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect((await request.get("/api/admin/orgs?cursor=bad").set(staff)).status).toBe(400);
  });
});
