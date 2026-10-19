import type { Db } from "@repo/db";
import supertest from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { bearer, createMember, createOrg } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

let db: Db;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  db = await createTestDb();
  request = supertest(createApp(db, createFakeQueue()));
});

describe("GET /api/me", () => {
  it("requires a session", async () => {
    expect((await request.get("/api/me")).status).toBe(401);
  });

  it("returns the person and only their own memberships, with roles", async () => {
    const [alpha, beta] = [await createOrg(db, "Alpha"), await createOrg(db, "Beta")];
    await createOrg(db, "Not mine");
    const m = await createMember(db, { role: "org_member", orgs: [beta, alpha] });
    const res = await request.get("/api/me").set(m.headers);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: m.user.id, email: m.user.email, name: "" },
      orgs: [
        { id: alpha.id, name: "Alpha", role: "org_member" },
        { id: beta.id, name: "Beta", role: "org_member" },
      ],
    });
  });

  it("works before the person belongs to any org (first sign-in)", async () => {
    const res = await request.get("/api/me").set(bearer({ sub: "user_fresh", email: "f@x.test" }));
    expect(res.status).toBe(200);
    expect(res.body.orgs).toEqual([]);
  });
});

describe("POST /api/orgs", () => {
  it("creates an org with the creator as org_admin, who can then use it", async () => {
    const session = bearer({ sub: "user_founder", email: "founder@x.test" });
    const res = await request.post("/api/orgs").set(session).send({ name: "Acme" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Acme", role: "org_admin" });
    // Their only org, so X-Org-Id is optional.
    const created = await request.post("/api/example").set(session).send({ name: "First" });
    expect(created.body.orgId).toBe(res.body.id);
  });

  it("gives nobody else access to the new org", async () => {
    const founder = bearer({ sub: "user_founder2", email: "founder2@x.test" });
    const org = (await request.post("/api/orgs").set(founder).send({ name: "Private" })).body;
    const other = await createMember(db);
    expect(
      (await request.get("/api/example").set({ ...other.headers, "x-org-id": org.id })).status
    ).toBe(403);
  });

  it("validates the name", async () => {
    const session = bearer({ sub: "user_v", email: "v@x.test" });
    expect((await request.post("/api/orgs").set(session).send({ name: "" })).status).toBe(400);
    expect(
      (
        await request
          .post("/api/orgs")
          .set(session)
          .send({ name: "x".repeat(101) })
      ).status
    ).toBe(400);
    expect((await request.post("/api/orgs").send({ name: "Anon" })).status).toBe(401);
  });
});
