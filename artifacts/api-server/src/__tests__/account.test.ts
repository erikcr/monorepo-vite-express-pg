import type { Db } from "@repo/db";
import { exampleTable, orgsTable, orgUsersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
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

const orgExists = async (orgId: string) =>
  (await db.select().from(orgsTable).where(eq(orgsTable.id, orgId))).length === 1;
const membersOf = async (orgId: string) =>
  (await db.select().from(orgUsersTable).where(eq(orgUsersTable.orgId, orgId))).map(
    (m) => m.userId
  );

describe("DELETE /api/orgs/current", () => {
  const remove = (headers: Record<string, string>, confirmName?: string) =>
    request
      .delete("/api/orgs/current")
      .set(headers)
      .send(confirmName === undefined ? {} : { confirmName });

  it("deletes the org with its memberships and records, and nothing else", async () => {
    const admin = await createMember(db);
    const [org] = admin.orgs;
    if (!org) throw new Error("expected an org");
    const colleague = await createMember(db, { role: "org_member", orgs: admin.orgs });
    await request.post("/api/example").set(admin.headers).send({ name: "Doomed" });
    const bystander = await createMember(db);
    await request.post("/api/example").set(bystander.headers).send({ name: "Kept" });

    const res = await remove(admin.headers, org.name);
    expect(res.status).toBe(204);
    expect(await orgExists(org.id)).toBe(false);
    expect(await membersOf(org.id)).toEqual([]);
    expect(await db.select().from(exampleTable).where(eq(exampleTable.orgId, org.id))).toEqual([]);
    // The people remain, and so does every other org.
    expect((await request.get("/api/me").set(colleague.headers)).body.orgs).toEqual([]);
    const otherOrg = bystander.orgs[0]?.id ?? "";
    expect(await orgExists(otherOrg)).toBe(true);
    expect((await request.get("/api/example").set(bystander.headers)).body.items).toHaveLength(1);
  });

  it("requires the org's exact name, and leaves the org alone otherwise", async () => {
    const admin = await createMember(db);
    const org = admin.orgs[0];
    if (!org) throw new Error("expected an org");
    for (const confirmName of [undefined, "", org.name.toUpperCase(), `${org.name} `]) {
      const res = await remove(admin.headers, confirmName);
      expect(res.status).toBe(400);
      expect(res.body.error.fieldErrors.confirmName).toBeDefined();
    }
    expect(await orgExists(org.id)).toBe(true);
  });

  it("is for org admins of that org only", async () => {
    expect((await request.delete("/api/orgs/current").send({ confirmName: "x" })).status).toBe(401);
    const admin = await createMember(db);
    const org = admin.orgs[0];
    if (!org) throw new Error("expected an org");
    const member = await createMember(db, { role: "org_member", orgs: admin.orgs });
    expect((await remove(member.headers, org.name)).status).toBe(403);
    const outsider = await createMember(db);
    expect((await remove(outsider.as(org), org.name)).status).toBe(403);
    expect(await orgExists(org.id)).toBe(true);
  });
});

describe("DELETE /api/orgs/current/membership", () => {
  const leave = (headers: Record<string, string>) =>
    request.delete("/api/orgs/current/membership").set(headers);

  it("removes only the person's own membership", async () => {
    const admin = await createMember(db);
    const org = admin.orgs[0];
    if (!org) throw new Error("expected an org");
    const member = await createMember(db, { role: "org_member", orgs: admin.orgs });
    expect((await leave(member.headers)).status).toBe(204);
    expect(await membersOf(org.id)).toEqual([admin.user.id]);
    expect((await request.get("/api/example").set(member.as(org))).status).toBe(403);
  });

  it("refuses the last org admin with 409, but lets one of two leave", async () => {
    const first = await createMember(db);
    const org = first.orgs[0];
    if (!org) throw new Error("expected an org");
    const res = await leave(first.headers);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_org_admin");
    expect(await membersOf(org.id)).toEqual([first.user.id]);

    const second = await createMember(db, { orgs: first.orgs });
    expect((await leave(first.headers)).status).toBe(204);
    expect(await membersOf(org.id)).toEqual([second.user.id]);
    expect((await leave(second.headers)).status).toBe(409);
  });

  it("never lets two admins leave together and strand the org", async () => {
    const first = await createMember(db);
    const org = first.orgs[0];
    if (!org) throw new Error("expected an org");
    const second = await createMember(db, { orgs: first.orgs });
    const results = await Promise.all([leave(first.headers), leave(second.headers)]);
    expect(results.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(await membersOf(org.id)).toHaveLength(1);
  });

  it("requires a session and a membership", async () => {
    expect((await request.delete("/api/orgs/current/membership")).status).toBe(401);
    const org = await createOrg(db);
    const outsider = await createMember(db);
    expect((await leave(outsider.as(org))).status).toBe(403);
  });
});
