import { createHash } from "node:crypto";
import type { Db, Org } from "@repo/db";
import { orgInvitationsTable, orgsTable, orgUsersTable, usersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Email } from "../lib/email.js";
import { bearer, createMember, createOrg } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

let db: Db;
let request: ReturnType<typeof supertest>;
const queue = createFakeQueue();

beforeAll(async () => {
  db = await createTestDb();
  request = supertest(createApp(db, queue));
});
beforeEach(() => {
  queue.enqueued.length = 0;
});

const missingId = "00000000-0000-4000-8000-000000000000";
const firstOrg = (m: { orgs: Org[] }) => {
  const [org] = m.orgs;
  if (!org) throw new Error("expected an org");
  return org;
};
const roleIn = async (orgId: string, userId: string) =>
  (await db.select().from(orgUsersTable).where(eq(orgUsersTable.orgId, orgId))).find(
    (m) => m.userId === userId
  )?.role;

/** An org with an admin and a member, who joined a minute later. */
async function team() {
  const admin = await createMember(db);
  const member = await createMember(db, { role: "org_member", orgs: admin.orgs });
  // Rows made in the same millisecond tie on created_at and then order by their random ids.
  await db
    .update(orgUsersTable)
    .set({ createdAt: new Date(Date.now() - 60_000) })
    .where(eq(orgUsersTable.userId, admin.user.id));
  return { admin, member, org: firstOrg(admin) };
}

describe("GET /api/orgs/current/members", () => {
  it("lists the org's members, newest first, to every member", async () => {
    const { admin, member } = await team();
    await createMember(db); // someone in another org
    const res = await request.get("/api/orgs/current/members").set(member.headers);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([
      {
        userId: member.user.id,
        email: member.user.email,
        name: "",
        role: "org_member",
        joinedAt: expect.any(String),
      },
      expect.objectContaining({ userId: admin.user.id, role: "org_admin" }),
    ]);
    expect(res.body.nextCursor).toBeNull();
  });

  it("pages with a cursor, and refuses one it didn't issue", async () => {
    const { admin, member } = await team();
    const first = await request.get("/api/orgs/current/members?limit=1").set(admin.headers);
    expect(first.body.items.map((m: { userId: string }) => m.userId)).toEqual([member.user.id]);
    const second = await request
      .get(`/api/orgs/current/members?limit=1&cursor=${first.body.nextCursor}`)
      .set(admin.headers);
    expect(second.body.items.map((m: { userId: string }) => m.userId)).toEqual([admin.user.id]);
    expect(second.body.nextCursor).toBeNull();
    const bad = await request.get("/api/orgs/current/members?cursor=bad").set(admin.headers);
    expect(bad.status).toBe(400);
  });

  it("requires a session and a membership", async () => {
    expect((await request.get("/api/orgs/current/members")).status).toBe(401);
    const { org } = await team();
    const outsider = await createMember(db);
    expect((await request.get("/api/orgs/current/members").set(outsider.as(org))).status).toBe(403);
  });
});

describe("PATCH /api/orgs/current/members/:userId", () => {
  const patch = (headers: Record<string, string>, userId: string, role: string) =>
    request.patch(`/api/orgs/current/members/${userId}`).set(headers).send({ role });

  it("lets an org admin change a member's role", async () => {
    const { admin, member, org } = await team();
    const res = await patch(admin.headers, member.user.id, "org_admin");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ userId: member.user.id, role: "org_admin" });
    expect(await roleIn(org.id, member.user.id)).toBe("org_admin");
  });

  it("never demotes the last org admin, but one of two can step down", async () => {
    const { admin, member, org } = await team();
    const res = await patch(admin.headers, admin.user.id, "org_member");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_org_admin");
    expect(await roleIn(org.id, admin.user.id)).toBe("org_admin");
    await patch(admin.headers, member.user.id, "org_admin");
    expect((await patch(admin.headers, admin.user.id, "org_member")).status).toBe(200);
  });

  it("is for org admins only", async () => {
    const { admin, member, org } = await team();
    expect((await patch(member.headers, admin.user.id, "org_member")).status).toBe(403);
    expect((await patch(member.headers, member.user.id, "org_admin")).status).toBe(403);
    expect(await roleIn(org.id, member.user.id)).toBe("org_member");
    expect(
      (await request.patch(`/api/orgs/current/members/${member.user.id}`).send({})).status
    ).toBe(401);
  });

  it("answers 404 for someone outside the org, and changes nothing there", async () => {
    const { admin } = await team();
    const other = await createMember(db, { role: "org_member" });
    expect((await patch(admin.headers, other.user.id, "org_admin")).status).toBe(404);
    expect(await roleIn(firstOrg(other).id, other.user.id)).toBe("org_member");
    expect((await patch(admin.headers, missingId, "org_admin")).status).toBe(404);
  });

  it("validates the role and the id", async () => {
    const { admin, member } = await team();
    expect((await patch(admin.headers, member.user.id, "owner")).status).toBe(400);
    expect((await patch(admin.headers, "not-a-uuid", "org_admin")).status).toBe(400);
  });
});

describe("DELETE /api/orgs/current/members/:userId", () => {
  const remove = (headers: Record<string, string>, userId: string) =>
    request.delete(`/api/orgs/current/members/${userId}`).set(headers);

  it("lets an org admin remove a member", async () => {
    const { admin, member, org } = await team();
    expect((await remove(admin.headers, member.user.id)).status).toBe(204);
    expect(await roleIn(org.id, member.user.id)).toBeUndefined();
    expect((await request.get("/api/example").set(member.as(org))).status).not.toBe(200);
  });

  it("never removes the last org admin", async () => {
    const { admin, org } = await team();
    const res = await remove(admin.headers, admin.user.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("last_org_admin");
    expect(await roleIn(org.id, admin.user.id)).toBe("org_admin");
  });

  it("is for org admins only, and only in their org", async () => {
    const { admin, member, org } = await team();
    expect((await remove(member.headers, admin.user.id)).status).toBe(403);
    expect(await roleIn(org.id, admin.user.id)).toBe("org_admin");
    const other = await createMember(db);
    expect((await remove(admin.headers, other.user.id)).status).toBe(404);
    expect(await roleIn(firstOrg(other).id, other.user.id)).toBe("org_admin");
    expect((await request.delete(`/api/orgs/current/members/${missingId}`)).status).toBe(401);
  });
});

/** The token in an enqueued invitation email's link. */
function tokenFrom(email: Email): string {
  const match = /\/invite#([A-Za-z0-9_-]+)/.exec(email.text);
  if (!match?.[1]) throw new Error(`no invitation link in: ${email.text}`);
  return match[1];
}
const sentInvitations = () =>
  queue.enqueued.filter((j) => j.name === "send-email").map((j) => j.data as Email);

describe("POST /api/orgs/current/invitations", () => {
  const invite = (headers: Record<string, string>, email: string, role = "org_member") =>
    request.post("/api/orgs/current/invitations").set(headers).send({ email, role });

  it("invites by email: a 7-day invitation, emailed with its link; only the hash is stored", async () => {
    const { admin, org } = await team();
    const before = Date.now();
    const res = await invite(admin.headers, "new@x.test", "org_admin");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      email: "new@x.test",
      role: "org_admin",
      expiresAt: expect.any(String),
      createdAt: expect.any(String),
    });
    const lifetime = new Date(res.body.expiresAt).getTime() - before;
    expect(lifetime).toBeGreaterThanOrEqual(7 * 24 * 3600_000 - 1000);
    expect(lifetime).toBeLessThanOrEqual(7 * 24 * 3600_000 + 1000);

    const [email] = sentInvitations();
    expect(email).toMatchObject({ to: "new@x.test", tags: { kind: "invitation" } });
    expect(email?.subject).toContain(org.name);
    expect(email?.text).toContain(admin.user.email);
    expect(email?.text).toContain("http://localhost:5173/invite#");
    const token = tokenFrom(email as Email);
    const [row] = await db
      .select()
      .from(orgInvitationsTable)
      .where(eq(orgInvitationsTable.id, res.body.id));
    expect(row?.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("escapes the org's name in the HTML email", async () => {
    const admin = await createMember(db, { orgs: [await createOrg(db, "<b>Acme</b> & Co")] });
    await invite(admin.headers, "esc@x.test");
    const [email] = sentInvitations();
    expect(email?.html).toContain("&lt;b&gt;Acme&lt;/b&gt; &amp; Co");
    expect(email?.html).not.toContain("<b>Acme</b>");
  });

  it("replaces a pending invitation for the same email: the old link stops working", async () => {
    const { admin, org } = await team();
    const invitee = await createMember(db, { orgs: [] });
    await invite(admin.headers, invitee.user.email);
    const oldToken = tokenFrom(sentInvitations()[0] as Email);
    const again = await invite(admin.headers, invitee.user.email.toUpperCase(), "org_admin");
    expect(again.status).toBe(201);
    const rows = await db
      .select()
      .from(orgInvitationsTable)
      .where(eq(orgInvitationsTable.orgId, org.id));
    expect(rows).toHaveLength(1);
    const accept = (token: string) =>
      request.post("/api/invitations/accept").set(invitee.headers).send({ token });
    expect((await accept(oldToken)).status).toBe(404);
    expect((await accept(tokenFrom(sentInvitations()[1] as Email))).body.role).toBe("org_admin");
  });

  it("refuses someone who's already a member, whatever the email's case", async () => {
    const { admin, member } = await team();
    const res = await invite(admin.headers, member.user.email.toUpperCase());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("already_member");
    expect(sentInvitations()).toEqual([]);
  });

  it("caps each person at 50 invitations a day, across their orgs, even ones since deleted", async () => {
    const [first, second] = [await createOrg(db), await createOrg(db)];
    const admin = await createMember(db, { orgs: [first, second] });
    const inviter = eq(usersTable.id, admin.user.id);
    const count = async () => (await db.select().from(usersTable).where(inviter))[0];
    expect((await invite(admin.as(first), "one@x.test")).status).toBe(201);
    expect(await count()).toMatchObject({
      invitationsSent: 1,
      invitationsWindowStart: expect.any(Date),
    });
    await db.update(usersTable).set({ invitationsSent: 49 }).where(inviter);
    expect((await invite(admin.as(first), "fifty@x.test")).status).toBe(201);
    // Deleting the org takes its invitations with it, but not the count.
    await db.delete(orgsTable).where(eq(orgsTable.id, first.id));
    queue.enqueued.length = 0;

    const refused = await invite(admin.as(second), "fifty-one@x.test");
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe("invitation_limit");
    expect(sentInvitations()).toEqual([]);
    expect(
      await db.select().from(orgInvitationsTable).where(eq(orgInvitationsTable.orgId, second.id))
    ).toEqual([]);
  });

  it("starts counting again a day after the day's first invitation", async () => {
    const admin = await createMember(db);
    const inviter = eq(usersTable.id, admin.user.id);
    const dayStarted = (msAgo: number) =>
      db
        .update(usersTable)
        .set({ invitationsSent: 50, invitationsWindowStart: new Date(Date.now() - msAgo) })
        .where(inviter);
    await dayStarted(23 * 3600_000);
    expect((await invite(admin.headers, "early@x.test")).status).toBe(429);
    await dayStarted(24 * 3600_000 + 60_000);
    expect((await invite(admin.headers, "next-day@x.test")).status).toBe(201);
    const [row] = await db.select().from(usersTable).where(inviter);
    expect(row?.invitationsSent).toBe(1);
  });

  it("is for org admins only, and validates the body", async () => {
    const { admin, member } = await team();
    expect((await invite(member.headers, "x@x.test")).status).toBe(403);
    expect((await invite(admin.headers, "not-an-email")).status).toBe(400);
    expect((await invite(admin.headers, "x@x.test", "owner")).status).toBe(400);
    expect(
      (await request.post("/api/orgs/current/invitations").send({ email: "x@x.test" })).status
    ).toBe(401);
    expect(sentInvitations()).toEqual([]);
  });
});

describe("GET /api/orgs/current/invitations", () => {
  it("lists the org's pending invitations, newest first, to every member", async () => {
    const { admin, member } = await team();
    const other = await team();
    await request
      .post("/api/orgs/current/invitations")
      .set(other.admin.headers)
      .send({ email: "elsewhere@x.test", role: "org_member" });
    for (const email of ["first@x.test", "second@x.test"]) {
      await request
        .post("/api/orgs/current/invitations")
        .set(admin.headers)
        .send({ email, role: "org_member" });
    }
    // Clearly older, rather than possibly tied on created_at (then ordered by random id).
    await db
      .update(orgInvitationsTable)
      .set({ createdAt: new Date(Date.now() - 60_000) })
      .where(eq(orgInvitationsTable.email, "first@x.test"));
    const res = await request.get("/api/orgs/current/invitations").set(member.headers);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { email: string }) => i.email)).toEqual([
      "second@x.test",
      "first@x.test",
    ]);
    const paged = await request.get("/api/orgs/current/invitations?limit=1").set(member.headers);
    expect(paged.body.nextCursor).toEqual(expect.any(String));
    expect(
      (await request.get("/api/orgs/current/invitations?cursor=x").set(member.headers)).status
    ).toBe(400);
  });

  it("requires a session and a membership", async () => {
    expect((await request.get("/api/orgs/current/invitations")).status).toBe(401);
    const { org } = await team();
    const outsider = await createMember(db);
    expect((await request.get("/api/orgs/current/invitations").set(outsider.as(org))).status).toBe(
      403
    );
  });
});

describe("DELETE /api/orgs/current/invitations/:id", () => {
  it("revokes: the invitation goes, and its link stops working", async () => {
    const { admin } = await team();
    const invitee = await createMember(db, { orgs: [] });
    const created = await request
      .post("/api/orgs/current/invitations")
      .set(admin.headers)
      .send({ email: invitee.user.email, role: "org_member" });
    const token = tokenFrom(sentInvitations()[0] as Email);
    const res = await request
      .delete(`/api/orgs/current/invitations/${created.body.id}`)
      .set(admin.headers);
    expect(res.status).toBe(204);
    const accept = await request
      .post("/api/invitations/accept")
      .set(invitee.headers)
      .send({ token });
    expect(accept.status).toBe(404);
  });

  it("is for org admins only, and only in their org", async () => {
    const { admin, member } = await team();
    const other = await team();
    const created = await request
      .post("/api/orgs/current/invitations")
      .set(other.admin.headers)
      .send({ email: "kept@x.test", role: "org_member" });
    const path = `/api/orgs/current/invitations/${created.body.id}`;
    expect((await request.delete(path).set(admin.headers)).status).toBe(404);
    expect((await request.delete(path).set(other.member.headers)).status).toBe(403);
    expect((await request.delete(path)).status).toBe(401);
    expect(
      (await request.delete(`/api/orgs/current/invitations/x`).set(admin.headers)).status
    ).toBe(400);
    const rows = await db
      .select()
      .from(orgInvitationsTable)
      .where(eq(orgInvitationsTable.id, created.body.id));
    expect(rows).toHaveLength(1);
    expect(member).toBeDefined();
  });
});

describe("POST /api/invitations/accept", () => {
  /** An admin's invitation for `email`, and its token. */
  async function invited(email: string, role = "org_member") {
    const { admin, org } = await team();
    queue.enqueued.length = 0;
    await request.post("/api/orgs/current/invitations").set(admin.headers).send({ email, role });
    return { org, token: tokenFrom(sentInvitations()[0] as Email) };
  }
  const accept = (headers: Record<string, string>, token: string) =>
    request.post("/api/invitations/accept").set(headers).send({ token });

  it("makes the invited person a member with the invited role, once", async () => {
    const invitee = await createMember(db, { orgs: [] });
    const { org, token } = await invited(invitee.user.email.toUpperCase(), "org_admin");
    const res = await accept(invitee.headers, token);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: org.id, name: org.name, handle: org.handle, role: "org_admin" });
    expect(await roleIn(org.id, invitee.user.id)).toBe("org_admin");
    const again = await accept(invitee.headers, token);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe("invitation_not_found");
  });

  it("refuses anyone but the invited email, and keeps the invitation for them", async () => {
    const invitee = await createMember(db, { orgs: [] });
    const stranger = await createMember(db, { orgs: [] });
    const { org, token } = await invited(invitee.user.email);
    const res = await accept(stranger.headers, token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invitation_email_mismatch");
    expect(await roleIn(org.id, stranger.user.id)).toBeUndefined();
    expect((await accept(invitee.headers, token)).status).toBe(200);
  });

  it("goes by the account's email now, not an out-of-date copy of it", async () => {
    // The users row still has an address the person has since given up (the webhook that would
    // have updated it never came), and someone else may now hold it.
    const former = await createMember(db, { orgs: [] });
    const row = eq(usersTable.id, former.user.id);
    await db.update(usersTable).set({ email: "given-up@x.test" }).where(row);
    const { org, token } = await invited("given-up@x.test");
    const res = await accept(former.headers, token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("invitation_email_mismatch");
    expect(await roleIn(org.id, former.user.id)).toBeUndefined();
    const [updated] = await db.select().from(usersTable).where(row);
    expect(updated?.email).toBe(former.user.email);
  });

  it("lets someone whose email changed accept an invitation to the new one", async () => {
    const invitee = await createMember(db, { orgs: [] });
    const headers = bearer({ sub: invitee.user.clerkUserId, email: "changed@x.test", name: "Ann" });
    const { org, token } = await invited("changed@x.test");
    expect((await accept(headers, token)).status).toBe(200);
    expect(await roleIn(org.id, invitee.user.id)).toBe("org_member");
    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, invitee.user.id));
    expect(updated).toMatchObject({ email: "changed@x.test", name: "Ann" });
  });

  it("refuses an account whose email is no longer verified", async () => {
    const invitee = await createMember(db, { orgs: [] });
    const { org, token } = await invited(invitee.user.email);
    const res = await accept(bearer({ sub: invitee.user.clerkUserId }), token);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("email_unverified");
    expect(await roleIn(org.id, invitee.user.id)).toBeUndefined();
  });

  it("refuses an expired invitation with 410", async () => {
    const invitee = await createMember(db, { orgs: [] });
    const { org, token } = await invited(invitee.user.email);
    await db
      .update(orgInvitationsTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(orgInvitationsTable.orgId, org.id));
    const res = await accept(invitee.headers, token);
    expect(res.status).toBe(410);
    expect(res.body.code).toBe("invitation_expired");
    expect(await roleIn(org.id, invitee.user.id)).toBeUndefined();
  });

  it("keeps an existing member's role, and uses up the invitation", async () => {
    const { admin, member, org } = await team();
    await db.insert(orgInvitationsTable).values({
      orgId: org.id,
      email: member.user.email,
      role: "org_admin",
      tokenHash: createHash("sha256").update("already-in").digest("hex"),
      invitedBy: admin.user.id,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const res = await accept(member.headers, "already-in");
    expect(res.body).toEqual({
      id: org.id,
      name: org.name,
      handle: org.handle,
      role: "org_member",
    });
    expect((await accept(member.headers, "already-in")).status).toBe(404);
  });

  it("answers 404 for a token it never issued, 401 signed out, 400 without one", async () => {
    const someone = await createMember(db, { orgs: [] });
    expect((await accept(someone.headers, "made-up")).status).toBe(404);
    expect((await request.post("/api/invitations/accept").send({ token: "x" })).status).toBe(401);
    expect((await accept(someone.headers, "")).status).toBe(400);
  });
});
