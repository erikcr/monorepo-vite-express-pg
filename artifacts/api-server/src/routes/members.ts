import { createHash, randomBytes } from "node:crypto";
import {
  AcceptInvitationBody,
  AcceptInvitationResponse,
  CreateInvitationBody,
  CreateInvitationResponse,
  ListInvitationsQueryParams,
  ListInvitationsResponse,
  ListOrgMembersQueryParams,
  ListOrgMembersResponse,
  RemoveOrgMemberParams,
  RevokeInvitationParams,
  UpdateOrgMemberBody,
  UpdateOrgMemberParams,
  UpdateOrgMemberResponse,
} from "@repo/api-zod";
import type { Db, Org, User } from "@repo/db";
import { orgInvitationsTable, orgsTable, orgUsersTable, usersTable } from "@repo/db/schema";
import { env } from "@repo/env";
import { and, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { type Request, type Response, Router } from "express";
import type { JobQueue } from "../jobs/queue.js";
import { sendEmailJob } from "../jobs/registry.js";
import { ORG_ROLES, type OrgRole } from "../lib/authz/policy.js";
import { type Email, html } from "../lib/email.js";
import { changeMembership, LAST_ORG_ADMIN, lockOrg } from "../lib/memberships.js";
import { type Cursor, decodeCursor, toPage } from "../lib/pagination.js";
import { sendValidated } from "../lib/send-validated.js";
import type { Access } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

// The org's members and its invitations (/api/orgs/current/…, the org from X-Org-Id), and
// accepting an invitation (/api/invitations/accept). Every member may see both lists; changing
// them takes org.members.manage.

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

const currentOrg = (req: Pick<Request, "ctx">): Org => {
  if (!req.ctx) throw new Error("requireOrg must run before this handler");
  return req.ctx.org;
};
const signedInUser = (req: Pick<Request, "user">): User => {
  if (!req.user) throw new Error("signedIn must run before this handler");
  return req.user;
};

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });
const badCursor = (res: Response) =>
  res.status(400).json({ error: { fieldErrors: { cursor: ["Invalid cursor"] }, formErrors: [] } });

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const sameEmail = (
  column: typeof usersTable.email | typeof orgInvitationsTable.email,
  email: string
) => sql`lower(${column}) = lower(${email})`;

/** Rows after `cursor` in (createdAt desc, id desc) order: the next page's condition. */
const after = (columns: { createdAt: AnyPgColumn; id: AnyPgColumn }, cursor: Cursor | null) =>
  cursor
    ? or(
        lt(columns.createdAt, cursor.createdAt),
        and(eq(columns.createdAt, cursor.createdAt), lt(columns.id, cursor.id))
      )
    : undefined;

export function createMembersRouter(db: Db, queue: JobQueue, access: Access): Router {
  const router = Router();
  const read = access.requireOrg("org.members.read");
  const manage = access.requireOrg("org.members.manage");

  /** A member of the org, as the API shows them. */
  const member = async (orgId: string, userId: string) => {
    const [row] = await db
      .select({
        userId: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: orgUsersTable.role,
        joinedAt: orgUsersTable.createdAt,
      })
      .from(orgUsersTable)
      .innerJoin(usersTable, eq(usersTable.id, orgUsersTable.userId))
      .where(and(eq(orgUsersTable.orgId, orgId), eq(orgUsersTable.userId, userId)));
    if (!row) throw new Error("not a member"); // can't happen after a change; narrows the type
    return row;
  };

  router.get("/members", read, validate({ query: ListOrgMembersQueryParams }), async (req, res) => {
    const { limit, cursor } = req.query;
    const from = cursor ? decodeCursor(cursor) : null;
    if (cursor && !from) return void badCursor(res);
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: orgUsersTable.role,
        createdAt: orgUsersTable.createdAt,
      })
      .from(orgUsersTable)
      .innerJoin(usersTable, eq(usersTable.id, orgUsersTable.userId))
      .where(
        and(
          eq(orgUsersTable.orgId, currentOrg(req).id),
          // An unknown role grants nothing (src/lib/authz/policy.ts), so it isn't a membership.
          inArray(orgUsersTable.role, ORG_ROLES),
          after({ createdAt: orgUsersTable.createdAt, id: usersTable.id }, from)
        )
      )
      .orderBy(desc(orgUsersTable.createdAt), desc(usersTable.id))
      .limit(limit + 1);
    const page = toPage(rows, limit);
    sendValidated(res, ListOrgMembersResponse, {
      items: page.items.map(({ id, createdAt, ...m }) => ({
        ...m,
        userId: id,
        joinedAt: createdAt,
      })),
      nextCursor: page.nextCursor,
    });
  });

  router.patch(
    "/members/:userId",
    manage,
    validate({ params: UpdateOrgMemberParams, body: UpdateOrgMemberBody }),
    async (req, res) => {
      const orgId = currentOrg(req).id;
      const result = await changeMembership(db, orgId, req.params.userId, { role: req.body.role });
      if (result === "not_found") return void notFound(res);
      if (result === "last_org_admin") return void res.status(409).json(LAST_ORG_ADMIN);
      sendValidated(res, UpdateOrgMemberResponse, await member(orgId, req.params.userId));
    }
  );

  router.delete(
    "/members/:userId",
    manage,
    validate({ params: RemoveOrgMemberParams }),
    async (req, res) => {
      const result = await changeMembership(db, currentOrg(req).id, req.params.userId, {
        remove: true,
      });
      if (result === "not_found") return void notFound(res);
      if (result === "last_org_admin") return void res.status(409).json(LAST_ORG_ADMIN);
      res.status(204).end();
    }
  );

  router.get(
    "/invitations",
    read,
    validate({ query: ListInvitationsQueryParams }),
    async (req, res) => {
      const { limit, cursor } = req.query;
      const from = cursor ? decodeCursor(cursor) : null;
      if (cursor && !from) return void badCursor(res);
      const rows = await db
        .select()
        .from(orgInvitationsTable)
        .where(
          and(
            eq(orgInvitationsTable.orgId, currentOrg(req).id),
            after({ createdAt: orgInvitationsTable.createdAt, id: orgInvitationsTable.id }, from)
          )
        )
        .orderBy(desc(orgInvitationsTable.createdAt), desc(orgInvitationsTable.id))
        .limit(limit + 1);
      sendValidated(res, ListInvitationsResponse, toPage(rows, limit));
    }
  );

  router.post(
    "/invitations",
    manage,
    validate({ body: CreateInvitationBody }),
    async (req, res) => {
      const org = currentOrg(req);
      const inviter = signedInUser(req);
      const { email, role } = req.body;
      const webUrl = env.WEB_URL;
      // Unset only in production, where the API warns at startup (src/index.ts).
      if (!webUrl) throw new Error("WEB_URL is not set: invitation links can't be made");

      const token = randomBytes(32).toString("base64url");
      const invitation = await db.transaction(async (tx) => {
        // One membership change per org at a time (src/lib/memberships.ts): two invitations for
        // the same email can't race each other.
        await lockOrg(tx, org.id);
        const [existing] = await tx
          .select({ userId: orgUsersTable.userId })
          .from(orgUsersTable)
          .innerJoin(usersTable, eq(usersTable.id, orgUsersTable.userId))
          .where(and(eq(orgUsersTable.orgId, org.id), sameEmail(usersTable.email, email)));
        if (existing) return null;
        // A pending invitation for the same email is replaced: its link stops working.
        await tx
          .delete(orgInvitationsTable)
          .where(
            and(eq(orgInvitationsTable.orgId, org.id), sameEmail(orgInvitationsTable.email, email))
          );
        const [created] = await tx
          .insert(orgInvitationsTable)
          .values({
            orgId: org.id,
            email,
            role,
            tokenHash: hashToken(token),
            invitedBy: inviter.id,
            expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
          })
          .returning();
        return created;
      });
      if (!invitation) {
        res.status(409).json({ error: "They're already a member", code: "already_member" });
        return;
      }
      await queue.enqueue(
        sendEmailJob,
        invitationEmail({
          to: email,
          orgName: org.name,
          inviter: inviter.name || inviter.email,
          role,
          link: `${webUrl}/invite#${token}`,
        })
      );
      sendValidated(res, CreateInvitationResponse, invitation, 201);
    }
  );

  router.delete(
    "/invitations/:id",
    manage,
    validate({ params: RevokeInvitationParams }),
    async (req, res) => {
      const [revoked] = await db
        .delete(orgInvitationsTable)
        .where(
          and(
            eq(orgInvitationsTable.id, req.params.id),
            eq(orgInvitationsTable.orgId, currentOrg(req).id)
          )
        )
        .returning({ id: orgInvitationsTable.id });
      if (!revoked) return void notFound(res);
      res.status(204).end();
    }
  );

  return router;
}

/** POST /api/invitations/accept: the signed-in person joins the org they were invited to. */
export function createInvitationsRouter(db: Db, access: Access): Router {
  const router = Router();

  router.post(
    "/accept",
    access.signedIn,
    validate({ body: AcceptInvitationBody }),
    async (req, res) => {
      const user = signedInUser(req);
      const result = await db.transaction(async (tx) => {
        // Locked, so the same token can't be accepted twice at once.
        const [invitation] = await tx
          .select()
          .from(orgInvitationsTable)
          .where(eq(orgInvitationsTable.tokenHash, hashToken(req.body.token)))
          .for("update");
        if (!invitation) return "not_found" as const;
        if (invitation.expiresAt.getTime() <= Date.now()) return "expired" as const;
        // users.email is the account's primary verified email (src/lib/authz/access.ts).
        if (invitation.email.toLowerCase() !== user.email.toLowerCase()) return "mismatch" as const;
        await tx.delete(orgInvitationsTable).where(eq(orgInvitationsTable.id, invitation.id));
        // Someone who already belongs keeps their role.
        await tx
          .insert(orgUsersTable)
          .values({ orgId: invitation.orgId, userId: user.id, role: invitation.role })
          .onConflictDoNothing();
        const [membership] = await tx
          .select({ id: orgsTable.id, name: orgsTable.name, role: orgUsersTable.role })
          .from(orgUsersTable)
          .innerJoin(orgsTable, eq(orgsTable.id, orgUsersTable.orgId))
          .where(and(eq(orgUsersTable.orgId, invitation.orgId), eq(orgUsersTable.userId, user.id)));
        if (!membership) throw new Error("membership not created"); // can't happen; narrows the type
        return membership;
      });

      if (result === "not_found") {
        res.status(404).json({
          error: "This invitation isn't valid: it may have been used, revoked or replaced",
          code: "invitation_not_found",
        });
      } else if (result === "expired") {
        res.status(410).json({
          error: "This invitation has expired: ask for a new one",
          code: "invitation_expired",
        });
      } else if (result === "mismatch") {
        res.status(403).json({
          error: "This invitation is for a different email address",
          code: "invitation_email_mismatch",
        });
      } else {
        sendValidated(res, AcceptInvitationResponse, result);
      }
    }
  );

  return router;
}

const ROLE_NAMES: Record<OrgRole, string> = { org_admin: "an admin", org_member: "a member" };

/** The invitation email: plain text, and HTML with everything inserted escaped. */
export function invitationEmail(i: {
  to: string;
  orgName: string;
  inviter: string;
  role: OrgRole;
  link: string;
}): Email {
  const intro = `${i.inviter} invited you to join ${i.orgName} as ${ROLE_NAMES[i.role]}.`;
  const outro =
    "The link works for 7 days. If you weren't expecting this, you can ignore this email.";
  return {
    to: i.to,
    subject: `Join ${i.orgName}`,
    text: `${intro}\n\nAccept the invitation: ${i.link}\n\n${outro}\n`,
    html: String(html`<p>${intro}</p>
<p><a href="${i.link}">Accept the invitation</a></p>
<p>${outro}</p>`),
    tags: { kind: "invitation" },
  };
}
