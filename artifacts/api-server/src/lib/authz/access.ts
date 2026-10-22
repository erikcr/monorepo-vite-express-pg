import type { Db, Org, User } from "@repo/db";
import { orgsTable, orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Identity } from "../identity.js";
import {
  isOrgRole,
  isStaffRole,
  type OrgPermission,
  type OrgRole,
  orgPermissions,
  type StaffRole,
} from "./policy.js";

/**
 * The person's `users` row, created on their first signed-in request from the primary verified
 * email and the name; Clerk's user.updated webhook keeps both current (src/routes/webhooks.ts).
 * Null when Clerk hasn't verified an email yet: such an account gets no access.
 */
export async function ensureUser(db: Db, identity: Identity): Promise<User | null> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, identity.clerkUserId));
  if (existing) return existing;
  const profile = await identity.profile();
  if (!profile) return null;
  await db
    .insert(usersTable)
    .values({ clerkUserId: identity.clerkUserId, email: profile.email, name: profile.name })
    .onConflictDoNothing(); // a concurrent first request may have created it
  const [created] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.clerkUserId, identity.clerkUserId));
  return created ?? null;
}

/** Every org the user may act in, with their role there. Read on every request, never cached. */
export async function loadOrgRoles(db: Db, userId: string): Promise<Map<string, OrgRole>> {
  const grants = await db
    .select({ orgId: orgUsersTable.orgId, role: orgUsersTable.role })
    .from(orgUsersTable)
    .where(eq(orgUsersTable.userId, userId));
  const roles = new Map<string, OrgRole>();
  for (const { orgId, role } of grants) if (isOrgRole(role)) roles.set(orgId, role);
  return roles;
}

export type Tenant = { orgId: string } | { refusal: "no_org" | "not_granted" | "org_required" };

/**
 * The org a request acts in. `X-Org-Id` is only ever checked against the person's grants, never
 * trusted. Without it, someone with exactly one org acts in that one.
 */
export function resolveTenant(roles: Map<string, OrgRole>, requested: string | undefined): Tenant {
  if (requested) return roles.has(requested) ? { orgId: requested } : { refusal: "not_granted" };
  const [only, ...others] = roles.keys();
  if (only === undefined) return { refusal: "no_org" };
  return others.length === 0 ? { orgId: only } : { refusal: "org_required" };
}

export const can = (role: OrgRole, permission: OrgPermission) =>
  orgPermissions(role).includes(permission);

export async function loadOrg(db: Db, orgId: string): Promise<Org | undefined> {
  const [org] = await db.select().from(orgsTable).where(eq(orgsTable.id, orgId));
  return org;
}

/**
 * The person's active staff grant and role, or null. A grant is made by email; on the account's
 * first staff request it's linked to the account whose primary *verified* email matches.
 */
export async function loadStaff(
  db: Db,
  identity: Identity
): Promise<{ id: string; role: StaffRole } | null> {
  let [row] = await db
    .select()
    .from(platformStaffTable)
    .where(eq(platformStaffTable.clerkUserId, identity.clerkUserId));
  // Fetching the email calls Clerk's API, so only do it while some grant is waiting to be linked:
  // otherwise every non-staff request to the admin API would make that call.
  if (!row && (await hasUnlinkedStaffGrant(db))) {
    const email = (await identity.profile())?.email;
    if (!email) return null;
    [row] = await db
      .update(platformStaffTable)
      .set({ clerkUserId: identity.clerkUserId })
      .where(
        and(
          sql`lower(${platformStaffTable.email}) = lower(${email})`,
          isNull(platformStaffTable.clerkUserId)
        )
      )
      .returning();
  }
  if (row?.status !== "active" || !isStaffRole(row.role)) return null;
  return { id: row.id, role: row.role };
}

async function hasUnlinkedStaffGrant(db: Db): Promise<boolean> {
  const [row] = await db
    .select({ id: platformStaffTable.id })
    .from(platformStaffTable)
    .where(and(isNull(platformStaffTable.clerkUserId), eq(platformStaffTable.status, "active")))
    .limit(1);
  return row !== undefined;
}
