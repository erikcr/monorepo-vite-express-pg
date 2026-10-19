import {
  CreateExampleBody,
  CreateExampleResponse,
  GetExampleParams,
  GetExampleQueryParams,
  GetExampleResponse,
  ListExamplesQueryParams,
  ListExamplesResponse,
  UpdateExampleBody,
  UpdateExampleResponse,
} from "@repo/api-zod";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { type Response, Router } from "express";
import type { JobQueue } from "../jobs/queue.js";
import { exampleCreated } from "../jobs/registry.js";
import { decodeCursor, toPage } from "../lib/pagination.js";
import { sendValidated } from "../lib/send-validated.js";
import { validate } from "../middleware/validate.js";

// Single-record routes: path id + orgId query. Tenant isolation: queries match both.
const target = validate({ params: GetExampleParams, query: GetExampleQueryParams });
const byIdAndOrg = (id: string, orgId: string) =>
  and(eq(exampleTable.id, id), eq(exampleTable.orgId, orgId));

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

export function createExampleRouter(db: Db, queue: JobQueue): Router {
  const router = Router();

  // orgId is mandatory (the schema requires it): never return rows across orgs.
  router.get("/", validate({ query: ListExamplesQueryParams }), async (req, res) => {
    const { orgId, limit, cursor } = req.query;
    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) {
      res
        .status(400)
        .json({ error: { fieldErrors: { cursor: ["Invalid cursor"] }, formErrors: [] } });
      return;
    }
    const rows = await db
      .select()
      .from(exampleTable)
      .where(
        and(
          eq(exampleTable.orgId, orgId),
          after
            ? or(
                lt(exampleTable.createdAt, after.createdAt),
                and(eq(exampleTable.createdAt, after.createdAt), lt(exampleTable.id, after.id))
              )
            : undefined
        )
      )
      .orderBy(desc(exampleTable.createdAt), desc(exampleTable.id))
      .limit(limit + 1);
    sendValidated(res, ListExamplesResponse, toPage(rows, limit));
  });

  router.post("/", validate({ body: CreateExampleBody }), async (req, res) => {
    const [row] = await db.insert(exampleTable).values(req.body).returning();
    if (!row) throw new Error("insert returned no row"); // can't happen; narrows the type
    await queue.enqueue(exampleCreated, { exampleId: row.id, orgId: row.orgId });
    sendValidated(res, CreateExampleResponse, row, 201);
  });

  router.get("/:id", target, async (req, res) => {
    const [row] = await db
      .select()
      .from(exampleTable)
      .where(byIdAndOrg(req.params.id, req.query.orgId));
    if (!row) return void notFound(res);
    sendValidated(res, GetExampleResponse, row);
  });

  router.patch("/:id", target, validate({ body: UpdateExampleBody }), async (req, res) => {
    const [row] = await db
      .update(exampleTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(byIdAndOrg(req.params.id, req.query.orgId))
      .returning();
    if (!row) return void notFound(res);
    sendValidated(res, UpdateExampleResponse, row);
  });

  router.delete("/:id", target, async (req, res) => {
    const [row] = await db
      .delete(exampleTable)
      .where(byIdAndOrg(req.params.id, req.query.orgId))
      .returning({ id: exampleTable.id });
    if (!row) return void notFound(res);
    res.status(204).end();
  });

  return router;
}
