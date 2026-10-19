import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers/create-test-db.js";

// The access layer relies on these constraints; the migration is what enforces them.
describe("access tables", () => {
  let db: Db;

  beforeAll(async () => {
    db = await createTestDb();
  });

  const first = <T>([row]: T[]): T => {
    if (!row) throw new Error("insert returned no row");
    return row;
  };
  const user = async (clerkUserId: string) =>
    first(
      await db
        .insert(usersTable)
        .values({ clerkUserId, email: `${clerkUserId}@example.com` })
        .returning()
    );
  const org = async (name: string) =>
    first(await db.insert(orgsTable).values({ name }).returning());

  it("allows one role per person per org", async () => {
    const [u, o] = [await user("user_a"), await org("Org A")];
    await db.insert(orgUsersTable).values({ orgId: o.id, userId: u.id, role: "org_admin" });
    await expect(
      db.insert(orgUsersTable).values({ orgId: o.id, userId: u.id, role: "org_member" })
    ).rejects.toThrow();
  });

  it("removes grants when the org or the user is deleted", async () => {
    const [u, o1, o2] = [await user("user_b"), await org("Org B1"), await org("Org B2")];
    await db.insert(orgUsersTable).values([
      { orgId: o1.id, userId: u.id, role: "org_admin" },
      { orgId: o2.id, userId: u.id, role: "org_member" },
    ]);
    await db.delete(orgsTable).where(eq(orgsTable.id, o1.id));
    expect(
      await db.select().from(orgUsersTable).where(eq(orgUsersTable.userId, u.id))
    ).toHaveLength(1);
    await db.delete(usersTable).where(eq(usersTable.id, u.id));
    expect(
      await db.select().from(orgUsersTable).where(eq(orgUsersTable.orgId, o2.id))
    ).toHaveLength(0);
  });

  it("allows one users row per Clerk account", async () => {
    await user("user_c");
    await expect(user("user_c")).rejects.toThrow();
  });

  it("grants staff access to an email once, whatever its case", async () => {
    await db.insert(platformStaffTable).values({ email: "Ops@Example.com", role: "staff_admin" });
    await expect(
      db.insert(platformStaffTable).values({ email: "ops@example.com", role: "staff_support" })
    ).rejects.toThrow();
    const [row] = await db.select().from(platformStaffTable);
    expect(row).toMatchObject({ status: "active", clerkUserId: null });
  });
});
