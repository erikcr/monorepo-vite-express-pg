import { ListAdminOrgsQueryParams, ListAdminOrgsResponse } from "@repo/api-zod";
import type { Db } from "@repo/db";
import { orgsTable, orgUsersTable } from "@repo/db/schema";
import { and, count, desc, eq, ilike, lt, or } from "drizzle-orm";
import { Router } from "express";
import { decodeCursor, toPage } from "../lib/pagination.js";
import { sendValidated } from "../lib/send-validated.js";
import type { Access } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

// Escape LIKE wildcards so a search for "100%" means the literal text.
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The staff API (/api/admin). Every route requires a staff permission. */
export function createAdminRouter(db: Db, access: Access): Router {
  const router = Router();

  router.get(
    "/orgs",
    access.requireStaff("platform.orgs.read"),
    validate({ query: ListAdminOrgsQueryParams }),
    async (req, res) => {
      const { q, limit, cursor } = req.query;
      const after = cursor ? decodeCursor(cursor) : null;
      if (cursor && !after) {
        res
          .status(400)
          .json({ error: { fieldErrors: { cursor: ["Invalid cursor"] }, formErrors: [] } });
        return;
      }
      const rows = await db
        .select({
          id: orgsTable.id,
          name: orgsTable.name,
          createdAt: orgsTable.createdAt,
          memberCount: count(orgUsersTable.userId),
        })
        .from(orgsTable)
        .leftJoin(orgUsersTable, eq(orgUsersTable.orgId, orgsTable.id))
        .where(
          and(
            q ? ilike(orgsTable.name, `%${likeLiteral(q)}%`) : undefined,
            after
              ? or(
                  lt(orgsTable.createdAt, after.createdAt),
                  and(eq(orgsTable.createdAt, after.createdAt), lt(orgsTable.id, after.id))
                )
              : undefined
          )
        )
        .groupBy(orgsTable.id)
        .orderBy(desc(orgsTable.createdAt), desc(orgsTable.id))
        .limit(limit + 1);
      sendValidated(res, ListAdminOrgsResponse, toPage(rows, limit));
    }
  );

  return router;
}
