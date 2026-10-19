// Granting access by hand (scripts in src/scripts/): the first staff member, and memberships of
// orgs nobody can invite you to yet (e.g. the seed orgs). Roles are validated against the policy.
import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { eq, sql } from "drizzle-orm";
import { isOrgRole, isStaffRole } from "./authz/policy.js";

const sameEmail = (
  column: typeof platformStaffTable.email | typeof usersTable.email,
  email: string
) => sql`lower(${column}) = lower(${email})`;

/** Grants (or re-activates, or changes the role of) staff access for an email. */
export async function grantStaff(
  db: Db,
  email: string,
  role: string
): Promise<"created" | "updated"> {
  if (!isStaffRole(role)) throw new Error(`Unknown staff role "${role}"`);
  const [existing] = await db
    .select()
    .from(platformStaffTable)
    .where(sameEmail(platformStaffTable.email, email));
  if (existing) {
    await db
      .update(platformStaffTable)
      .set({ role, status: "active" })
      .where(eq(platformStaffTable.id, existing.id));
    return "updated";
  }
  await db.insert(platformStaffTable).values({ email, role });
  return "created";
}

/** Disables an email's staff access (the row stays, as a record). False if there was none. */
export async function revokeStaff(db: Db, email: string): Promise<boolean> {
  const rows = await db
    .update(platformStaffTable)
    .set({ status: "disabled" })
    .where(sameEmail(platformStaffTable.email, email))
    .returning({ id: platformStaffTable.id });
  return rows.length > 0;
}

/**
 * Gives a person (by the email they signed in with) `role` in an org, or changes it. They must
 * have signed in once, so their users row exists.
 */
export async function grantOrgMembership(
  db: Db,
  email: string,
  orgId: string,
  role: string
): Promise<void> {
  if (!isOrgRole(role)) throw new Error(`Unknown org role "${role}"`);
  const [user] = await db.select().from(usersTable).where(sameEmail(usersTable.email, email));
  if (!user) throw new Error(`No user with email ${email}: they need to sign in once first`);
  const [org] = await db.select().from(orgsTable).where(eq(orgsTable.id, orgId));
  if (!org) throw new Error(`No org with id ${orgId}`);
  await db
    .insert(orgUsersTable)
    .values({ orgId, userId: user.id, role })
    .onConflictDoUpdate({ target: [orgUsersTable.orgId, orgUsersTable.userId], set: { role } });
}
