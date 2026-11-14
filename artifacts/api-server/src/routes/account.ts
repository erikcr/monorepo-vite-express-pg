import {
  CheckOrgHandleQueryParams,
  CheckOrgHandleResponse,
  CreateOrgBody,
  CreateOrgResponse,
  DeleteCurrentOrgBody,
  GetMeResponse,
} from "@repo/api-zod";
import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable, usersTable } from "@repo/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { type Request, Router } from "express";
import { isOrgRole } from "../lib/authz/policy.js";
import {
  freeHandle,
  HANDLE_PROBLEM_MESSAGES,
  HANDLE_TAKEN,
  handleProblem,
  handleTaken,
} from "../lib/handles.js";
import { changeMembership, LAST_ORG_ADMIN } from "../lib/memberships.js";
import { sendValidated } from "../lib/send-validated.js";
import type { Access } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

const signedInUser = (req: Pick<Request, "user">) => {
  if (!req.user) throw new Error("signedIn must run before this handler");
  return req.user;
};

const currentOrg = (req: Pick<Request, "ctx">) => {
  if (!req.ctx) throw new Error("requireOrg must run before this handler");
  return req.ctx.org;
};

/** GET /api/me: who's signed in, and every org they can act in (send its id as X-Org-Id). */
export function createMeRouter(db: Db, access: Access): Router {
  const router = Router();
  router.get("/", access.signedIn, async (req, res) => {
    const user = signedInUser(req);
    const memberships = await db
      .select({
        id: orgsTable.id,
        name: orgsTable.name,
        handle: orgsTable.handle,
        role: orgUsersTable.role,
      })
      .from(orgUsersTable)
      .innerJoin(orgsTable, eq(orgsTable.id, orgUsersTable.orgId))
      .where(eq(orgUsersTable.userId, user.id))
      .orderBy(asc(orgsTable.name));
    sendValidated(res, GetMeResponse, {
      user: { id: user.id, email: user.email, name: user.name },
      // Unknown roles grant nothing, so they aren't memberships either.
      orgs: memberships.filter((m) => isOrgRole(m.role)),
    });
  });
  return router;
}

/**
 * The most orgs one person can belong to and still create another. Without a limit one account
 * can fill the table with orgs and take handles nobody else can then use.
 */
export const MAX_ORGS_PER_PERSON = 20;

/**
 * /api/orgs: self-serve org creation (the creator becomes its org_admin); deleting the current
 * org (X-Org-Id) and leaving it.
 */
export function createOrgsRouter(db: Db, access: Access): Router {
  const router = Router();
  router.post("/", access.signedIn, validate({ body: CreateOrgBody }), async (req, res) => {
    const user = signedInUser(req);
    const chosen = req.body.handle?.toLowerCase();
    const problem = chosen === undefined ? undefined : handleProblem(chosen);
    if (problem) {
      res.status(400).json({
        error: { fieldErrors: { handle: [HANDLE_PROBLEM_MESSAGES[problem]] }, formErrors: [] },
      });
      return;
    }
    const org = await db.transaction(async (tx) => {
      // Locks the person's row, so their requests are counted one at a time.
      await tx
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.id, user.id))
        .for("update");
      const [memberships] = await tx
        .select({ total: count() })
        .from(orgUsersTable)
        .where(eq(orgUsersTable.userId, user.id));
      if ((memberships?.total ?? 0) >= MAX_ORGS_PER_PERSON) return "limit" as const;
      // Without a chosen handle (a client from before handles), one from the name.
      const handle = chosen ?? (await freeHandle(tx, req.body.name));
      const [created] = await tx
        .insert(orgsTable)
        .values({ name: req.body.name, handle })
        .onConflictDoNothing({ target: orgsTable.handle })
        .returning();
      if (!created) return undefined;
      await tx
        .insert(orgUsersTable)
        .values({ orgId: created.id, userId: user.id, role: "org_admin" });
      return created;
    });
    if (org === "limit") {
      res.status(409).json({
        error: `You belong to ${MAX_ORGS_PER_PERSON} organizations, the most that can create another: leave or delete one first`,
        code: "org_limit",
      });
      return;
    }
    if (!org) {
      res.status(409).json(HANDLE_TAKEN);
      return;
    }
    sendValidated(
      res,
      CreateOrgResponse,
      { id: org.id, name: org.name, handle: org.handle, role: "org_admin" },
      201
    );
  });

  router.get(
    "/handle-available",
    access.signedIn,
    validate({ query: CheckOrgHandleQueryParams }),
    async (req, res) => {
      const handle = req.query.handle.toLowerCase();
      const reason =
        handleProblem(handle) ?? ((await handleTaken(db, handle)) ? "taken" : undefined);
      sendValidated(res, CheckOrgHandleResponse, { handle, available: !reason, reason });
    }
  );

  router.delete(
    "/current",
    access.requireOrg("org.delete"),
    validate({ body: DeleteCurrentOrgBody }),
    async (req, res) => {
      const org = currentOrg(req);
      if (req.body.confirmName !== org.name) {
        res.status(400).json({
          error: {
            fieldErrors: { confirmName: ["Doesn't match the organization's name"] },
            formErrors: [],
          },
        });
        return;
      }
      // Every org-scoped table references orgs ON DELETE CASCADE (tenancy-schema.test.ts), so
      // the org's memberships and records go with it.
      await db.delete(orgsTable).where(eq(orgsTable.id, org.id));
      req.log.info({ orgId: org.id }, "org deleted");
      res.status(204).end();
    }
  );

  router.delete("/current/membership", access.requireOrg("org.leave"), async (req, res) => {
    const result = await changeMembership(db, currentOrg(req).id, signedInUser(req).id, {
      remove: true,
    });
    if (result === "last_org_admin") {
      res.status(409).json(LAST_ORG_ADMIN);
      return;
    }
    res.status(204).end();
  });
  return router;
}
