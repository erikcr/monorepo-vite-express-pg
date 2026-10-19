import { CreateOrgBody, CreateOrgResponse, GetMeResponse } from "@repo/api-zod";
import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable } from "@repo/db/schema";
import { asc, eq } from "drizzle-orm";
import { type Request, Router } from "express";
import { isOrgRole } from "../lib/authz/policy.js";
import { sendValidated } from "../lib/send-validated.js";
import type { Access } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

const signedInUser = (req: Pick<Request, "user">) => {
  if (!req.user) throw new Error("signedIn must run before this handler");
  return req.user;
};

/** GET /api/me: who's signed in, and every org they can act in (send its id as X-Org-Id). */
export function createMeRouter(db: Db, access: Access): Router {
  const router = Router();
  router.get("/", access.signedIn, async (req, res) => {
    const user = signedInUser(req);
    const memberships = await db
      .select({ id: orgsTable.id, name: orgsTable.name, role: orgUsersTable.role })
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

/** POST /api/orgs: self-serve org creation; the creator becomes its org_admin. */
export function createOrgsRouter(db: Db, access: Access): Router {
  const router = Router();
  router.post("/", access.signedIn, validate({ body: CreateOrgBody }), async (req, res) => {
    const user = signedInUser(req);
    const org = await db.transaction(async (tx) => {
      const [created] = await tx.insert(orgsTable).values({ name: req.body.name }).returning();
      if (!created) throw new Error("insert returned no row");
      await tx
        .insert(orgUsersTable)
        .values({ orgId: created.id, userId: user.id, role: "org_admin" });
      return created;
    });
    sendValidated(res, CreateOrgResponse, { id: org.id, name: org.name, role: "org_admin" }, 201);
  });
  return router;
}
