import type { Db } from "@repo/db";
import { orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import express from "express";
import supertest from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { loadStaff } from "../lib/authz/access.js";
import { type Access, createAccess } from "../middleware/access.js";
import { bearer, createMember, createOrg, grantStaff } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

let db: Db;
let access: Access;
let request: ReturnType<typeof supertest>;

beforeAll(async () => {
  db = await createTestDb();
  access = createAccess(db);
  // A probe app: each route answers with what the access layer handed it.
  const app = express();
  app.get("/me", access.signedIn, (req, res) => res.json({ userId: req.user?.id }));
  app.get("/read", access.requireOrg("example.read"), (req, res) =>
    res.json({ orgId: req.ctx?.org.id, role: req.ctx?.role })
  );
  app.get("/settings", access.requireOrg("org.settings.write"), (_req, res) => res.json({}));
  app.get("/staff", access.requireStaff("platform.orgs.read"), (req, res) =>
    res.json({ role: req.staff?.role })
  );
  app.get("/staff-admin", access.requireStaff("platform.staff.manage"), (_req, res) =>
    res.json({})
  );
  request = supertest(app);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authentication", () => {
  it("answers 401 without a valid session", async () => {
    expect((await request.get("/me")).status).toBe(401);
    expect((await request.get("/me").set("authorization", "Bearer not-a-token")).status).toBe(401);
    expect((await request.get("/read")).status).toBe(401);
  });

  it("creates the users row on the first signed-in request, from the verified email", async () => {
    const session = bearer({ sub: "user_new", email: "new@x.test", name: "New Person" });
    const res = await request.get("/me").set(session);
    expect(res.status).toBe(200);
    const [row] = await db.select().from(usersTable).where(eq(usersTable.clerkUserId, "user_new"));
    expect(row).toMatchObject({ id: res.body.userId, email: "new@x.test", name: "New Person" });
    // Second request: same row.
    const again = await request.get("/me").set(bearer({ sub: "user_new", email: "new@x.test" }));
    expect(again.body.userId).toBe(row?.id);
  });

  it("refuses an account without a verified email", async () => {
    const res = await request.get("/me").set(bearer({ sub: "user_unverified" }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("email_unverified");
  });
});

describe("requireOrg: which org", () => {
  it("uses the only org when X-Org-Id is omitted", async () => {
    const m = await createMember(db);
    const res = await request.get("/read").set(m.headers);
    expect(res.body).toEqual({ orgId: m.orgs[0]?.id, role: "org_admin" });
  });

  it("requires X-Org-Id when the person belongs to several orgs", async () => {
    const m = await createMember(db, { orgs: [await createOrg(db), await createOrg(db)] });
    const missing = await request.get("/read").set(m.headers);
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe("org_required");
    const [, second] = m.orgs;
    if (!second) throw new Error("expected two orgs");
    expect((await request.get("/read").set(m.as(second))).body.orgId).toBe(second.id);
  });

  it("refuses an org the person doesn't belong to: the header is checked, never trusted", async () => {
    const m = await createMember(db);
    const other = await createOrg(db);
    const res = await request.get("/read").set(m.as(other));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("forbidden");
  });

  it("answers 404 no_org for someone with no memberships yet", async () => {
    const res = await request.get("/read").set(bearer({ sub: "user_lonely", email: "l@x.test" }));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("no_org");
  });
});

describe("requireOrg: permissions", () => {
  it("checks the permission, not the role name", async () => {
    const member = await createMember(db, { role: "org_member" });
    expect((await request.get("/read").set(member.headers)).status).toBe(200);
    expect((await request.get("/settings").set(member.headers)).status).toBe(403);
    const admin = await createMember(db, { role: "org_admin" });
    expect((await request.get("/settings").set(admin.headers)).status).toBe(200);
  });

  it("gives an unknown role nothing", async () => {
    const m = await createMember(db, { role: "owner" });
    expect((await request.get("/read").set(m.headers)).body.code).toBe("no_org");
  });

  it("takes a removed grant away on the next request", async () => {
    const m = await createMember(db);
    expect((await request.get("/read").set(m.headers)).status).toBe(200);
    await db.delete(orgUsersTable).where(eq(orgUsersTable.userId, m.user.id));
    expect((await request.get("/read").set(m.headers)).status).toBe(404);
  });
});

describe("requireStaff", () => {
  const staffSession = (sub: string, email: string, fva?: [number, number]) =>
    bearer({ sub, email, ...(fva ? { fva } : {}) });

  it("refuses people without a staff grant", async () => {
    const m = await createMember(db);
    expect((await request.get("/staff").set(m.headers)).status).toBe(403);
    expect((await request.get("/staff")).status).toBe(401);
  });

  it("links a grant to the account whose verified email matches, case-insensitively", async () => {
    await grantStaff(db, "Ops@Example.com", "staff_support");
    const res = await request.get("/staff").set(staffSession("user_ops", "ops@example.com"));
    expect(res.body).toEqual({ role: "staff_support" });
    const [row] = await db
      .select()
      .from(platformStaffTable)
      .where(eq(platformStaffTable.clerkUserId, "user_ops"));
    expect(row?.email).toBe("Ops@Example.com");
    // Another account with the same email can't claim the now-linked grant.
    expect(
      (await request.get("/staff").set(staffSession("user_other", "ops@example.com"))).status
    ).toBe(403);
  });

  it("refuses an unverified email and a disabled grant", async () => {
    await grantStaff(db, "unverified@x.test");
    expect((await request.get("/staff").set(bearer({ sub: "user_unv" }))).status).toBe(403);
    await grantStaff(db, "gone@x.test", "staff_admin", "disabled");
    expect((await request.get("/staff").set(staffSession("user_gone", "gone@x.test"))).status).toBe(
      403
    );
  });

  it("only asks Clerk for the email while a grant is waiting to be linked", async () => {
    // Fetching the email is a Clerk API call: without this, every non-staff request to the admin
    // API would make one, and anyone signed in could spend the Clerk instance's rate limit.
    const fresh = await createTestDb();
    const identity = (clerkUserId: string, email: string) => ({
      clerkUserId,
      secondFactorAgeMinutes: null,
      profile: vi.fn(async () => ({ email, name: "" })),
    });

    const outsider = identity("user_outsider", "outsider@x.test");
    expect(await loadStaff(fresh, outsider)).toBeNull();
    expect(outsider.profile).not.toHaveBeenCalled();

    await grantStaff(fresh, "pending@x.test", "staff_support");
    const claimant = identity("user_pending", "pending@x.test");
    expect(await loadStaff(fresh, claimant)).toMatchObject({ role: "staff_support" });
    expect(claimant.profile).toHaveBeenCalledOnce();

    // Linked now, so nothing is waiting: the outsider is refused without a lookup again.
    expect(await loadStaff(fresh, outsider)).toBeNull();
    expect(outsider.profile).not.toHaveBeenCalled();
  });

  it("checks the staff permission", async () => {
    await grantStaff(db, "support@x.test", "staff_support");
    const session = staffSession("user_support", "support@x.test");
    expect((await request.get("/staff").set(session)).status).toBe(200);
    expect((await request.get("/staff-admin").set(session)).status).toBe(403);
  });

  it("requires a second factor when STAFF_MFA_REQUIRED is on", async () => {
    vi.stubEnv("STAFF_MFA_REQUIRED", "true");
    await grantStaff(db, "mfa@x.test");
    const without = await request
      .get("/staff")
      .set(staffSession("user_mfa", "mfa@x.test", [1, -1]));
    expect(without.status).toBe(403);
    expect(without.body.code).toBe("second_factor_required");
    const withFactor = await request
      .get("/staff")
      .set(staffSession("user_mfa", "mfa@x.test", [1, 0]));
    expect(withFactor.status).toBe(200);
    // A second factor counts for 12 hours; after that, staff sign in again.
    const lastMinute = staffSession("user_mfa", "mfa@x.test", [720, 720]);
    expect((await request.get("/staff").set(lastMinute)).status).toBe(200);
    const stale = await request
      .get("/staff")
      .set(staffSession("user_mfa", "mfa@x.test", [721, 721]));
    expect(stale.status).toBe(403);
    expect(stale.body.code).toBe("second_factor_required");
  });
});
