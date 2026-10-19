import type { Db } from "@repo/db";
import { orgUsersTable, platformStaffTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { grantOrgMembership, grantStaff, revokeStaff } from "../lib/grants.js";
import { createMember, createOrg } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("grantStaff / revokeStaff", () => {
  it("creates a grant, then updates role and re-activates it, matching email case-insensitively", async () => {
    expect(await grantStaff(db, "Lead@x.test", "staff_support")).toBe("created");
    expect(await revokeStaff(db, "lead@X.test")).toBe(true);
    expect(await grantStaff(db, "LEAD@x.test", "staff_admin")).toBe("updated");
    const rows = await db.select().from(platformStaffTable);
    expect(rows.filter((r) => r.email.toLowerCase() === "lead@x.test")).toEqual([
      expect.objectContaining({ role: "staff_admin", status: "active" }),
    ]);
  });

  it("rejects an unknown role and reports a missing grant", async () => {
    await expect(grantStaff(db, "x@x.test", "superuser")).rejects.toThrow(
      'Unknown staff role "superuser"'
    );
    expect(await revokeStaff(db, "nobody@x.test")).toBe(false);
  });
});

describe("grantOrgMembership", () => {
  it("adds a signed-in person to an org, or changes their role there", async () => {
    const m = await createMember(db, { role: "org_member" });
    const target = await createOrg(db);
    await grantOrgMembership(db, m.user.email.toUpperCase(), target.id, "org_member");
    await grantOrgMembership(db, m.user.email, target.id, "org_admin");
    const grants = await db.select().from(orgUsersTable).where(eq(orgUsersTable.orgId, target.id));
    expect(grants).toEqual([expect.objectContaining({ userId: m.user.id, role: "org_admin" })]);
  });

  it("refuses unknown people, orgs and roles", async () => {
    const m = await createMember(db);
    const org = await createOrg(db);
    await expect(grantOrgMembership(db, "ghost@x.test", org.id, "org_member")).rejects.toThrow(
      "need to sign in once first"
    );
    await expect(
      grantOrgMembership(db, m.user.email, "00000000-0000-4000-8000-00000000dead", "org_member")
    ).rejects.toThrow("No org with id");
    await expect(grantOrgMembership(db, m.user.email, org.id, "owner")).rejects.toThrow(
      'Unknown org role "owner"'
    );
  });
});
