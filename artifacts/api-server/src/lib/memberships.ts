// Changing who belongs to an org, and with which role. Every change takes the org's row lock
// first, so changes to one org's memberships happen one at a time: two admins stepping down
// together can't both see the other still there, and the org never loses its last org_admin.
import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable } from "@repo/db/schema";
import { and, eq } from "drizzle-orm";
import type { OrgRole } from "./authz/policy.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Locks the org's row until the transaction ends. */
export async function lockOrg(tx: Tx, orgId: string): Promise<void> {
  await tx
    .select({ id: orgsTable.id })
    .from(orgsTable)
    .where(eq(orgsTable.id, orgId))
    .for("update");
}

export type MembershipChange = { remove: true } | { role: OrgRole };

/**
 * Removes `userId` from the org, or gives them `role` there. "not_found" when they aren't a
 * member; "last_org_admin" when the change would leave the org without one.
 */
export async function changeMembership(
  db: Db,
  orgId: string,
  userId: string,
  change: MembershipChange
): Promise<"done" | "not_found" | "last_org_admin"> {
  return db.transaction(async (tx) => {
    await lockOrg(tx, orgId);
    const inOrg = and(eq(orgUsersTable.orgId, orgId), eq(orgUsersTable.userId, userId));
    const [membership] = await tx.select().from(orgUsersTable).where(inOrg);
    if (!membership) return "not_found";
    const losesAdmin =
      membership.role === "org_admin" && ("remove" in change || change.role !== "org_admin");
    if (losesAdmin) {
      const admins = await tx
        .select({ userId: orgUsersTable.userId })
        .from(orgUsersTable)
        .where(and(eq(orgUsersTable.orgId, orgId), eq(orgUsersTable.role, "org_admin")));
      if (admins.length <= 1) return "last_org_admin";
    }
    if ("remove" in change) await tx.delete(orgUsersTable).where(inOrg);
    else await tx.update(orgUsersTable).set({ role: change.role }).where(inOrg);
    return "done";
  });
}

/** The 409 every membership route answers when a change would leave the org without an admin. */
export const LAST_ORG_ADMIN = {
  error: "Make someone else an org admin first: an org needs one",
  code: "last_org_admin",
} as const;
