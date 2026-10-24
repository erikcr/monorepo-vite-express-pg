import type { Db, Org, User } from "@repo/db";
import { orgsTable, orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { freeHandle } from "../lib/handles.js";

let seq = 0;

/** A test session token (accepted only under NODE_ENV=test; see src/lib/identity.ts). */
export const testToken = (claims: {
  sub: string;
  email?: string;
  name?: string;
  fva?: [number, number];
}) => `test:${JSON.stringify(claims)}`;

/** `Authorization` header for a test session. */
export const bearer = (claims: Parameters<typeof testToken>[0]) => ({
  authorization: `Bearer ${testToken(claims)}`,
});

async function insertOne<T>(rows: Promise<T[]>): Promise<T> {
  const [row] = await rows;
  if (!row) throw new Error("insert returned no row");
  return row;
}

export const createOrg = async (db: Db, name = `Org ${++seq}`): Promise<Org> =>
  insertOne(
    db
      .insert(orgsTable)
      .values({ name, handle: await freeHandle(db, name) })
      .returning()
  );

/**
 * A signed-in person with `role` in each of `orgs` (a new org when none given), and the headers
 * to act as them. Pass `orgId` in `as(orgId)` to send X-Org-Id.
 */
export async function createMember(
  db: Db,
  { role = "org_admin", orgs }: { role?: string; orgs?: Org[] } = {}
): Promise<{
  user: User;
  orgs: Org[];
  headers: Record<string, string>;
  as(org: Org): Record<string, string>;
}> {
  const n = ++seq;
  const user = await insertOne(
    db
      .insert(usersTable)
      .values({ clerkUserId: `user_${n}`, email: `user${n}@x.test` })
      .returning()
  );
  const memberOf = orgs ?? [await createOrg(db)];
  for (const org of memberOf) {
    await db.insert(orgUsersTable).values({ orgId: org.id, userId: user.id, role });
  }
  const headers = bearer({ sub: user.clerkUserId, email: user.email });
  return { user, orgs: memberOf, headers, as: (org) => ({ ...headers, "x-org-id": org.id }) };
}

/** A staff grant by email, not yet linked to an account (as `pnpm staff:grant` makes it). */
export const grantStaff = (db: Db, email: string, role = "staff_admin", status = "active") =>
  insertOne(db.insert(platformStaffTable).values({ email, role, status }).returning());
