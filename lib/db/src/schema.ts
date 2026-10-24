import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Timestamps use millisecond precision so they round-trip exactly through JS Dates and JSON
// (keyset pagination cursors depend on it).
const createdAt = () =>
  timestamp("created_at", { withTimezone: true, precision: 3 }).notNull().defaultNow();

// ── Identity and access ─────────────────────────────────────────────────────────────────────
// Clerk proves who someone is; these tables alone decide what they may do. Roles are plain text,
// checked against the permission policy in the API (src/lib/authz/policy.ts): an unknown role
// grants nothing.

/** A person who signs in. Created on their first authenticated request. */
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  /** Primary verified email, from Clerk. */
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  /**
   * Invitations this person has sent since `invitationsWindowStart` (the API caps them per day).
   * Kept here, not counted from org_invitations, so revoking them or deleting the org doesn't
   * reset the count.
   */
  invitationsSent: integer("invitations_sent").notNull().default(0),
  invitationsWindowStart: timestamp("invitations_window_start", {
    withTimezone: true,
    precision: 3,
  }),
  createdAt: createdAt(),
});

/** A tenant: every org-scoped row carries its id. */
export const orgsTable = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  /**
   * The org's address, `/o/<handle>`: chosen at creation, then fixed. Lowercase letters, digits
   * and single hyphens (rules in the API's src/lib/handles.ts). Nullable only until every running
   * API sets it; a later migration makes it NOT NULL.
   */
  handle: text("handle").unique(),
  createdAt: createdAt(),
});

/** A person's role in an org. No row, no access. */
export const orgUsersTable = pgTable(
  "org_users",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("org_users_user_idx").on(t.userId)]
);

/**
 * Staff access to the admin API. Granted by email (`pnpm staff:grant`); linked to the Clerk
 * account whose primary verified email matches, on its first sign-in.
 */
export const platformStaffTable = pgTable(
  "platform_staff",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    clerkUserId: text("clerk_user_id").unique(),
    role: text("role").notNull(),
    /** "active" or "disabled": disabling keeps the record of who had access. */
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("platform_staff_email_idx").on(sql`lower(${t.email})`)]
);

/**
 * An invitation to join an org, pending until accepted (it becomes an org_users row) or revoked:
 * both delete it, so it can be used once. Only a hash of its token is stored; the token itself
 * is only ever in the email. One pending invitation per email per org: inviting again replaces it.
 */
export const orgInvitationsTable = pgTable(
  "org_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    /** SHA-256 (hex) of the token in the invitation link. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => usersTable.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, precision: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("org_invitations_org_email_idx").on(t.orgId, sql`lower(${t.email})`)]
);

// ── Example domain table ────────────────────────────────────────────────────────────────────

export const exampleTable = pgTable("example", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 }).notNull().defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type Org = typeof orgsTable.$inferSelect;
export type OrgUser = typeof orgUsersTable.$inferSelect;
export type PlatformStaff = typeof platformStaffTable.$inferSelect;
export type OrgInvitation = typeof orgInvitationsTable.$inferSelect;
export type Example = typeof exampleTable.$inferSelect;
export type NewExample = typeof exampleTable.$inferInsert;
