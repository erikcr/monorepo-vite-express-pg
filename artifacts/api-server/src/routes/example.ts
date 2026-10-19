import {
  CreateExampleBody,
  GetExampleParams,
  GetExampleQueryParams,
  ListExamplesQueryParams,
  UpdateExampleBody,
} from "@repo/api-zod";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import type { JobQueue } from "../jobs/queue.js";
import { exampleCreated } from "../jobs/registry.js";
import { decodeCursor, toPage } from "../lib/pagination.js";

// Path id + orgId query: shared by the single-record routes. Responds 400 and returns null when invalid.
function parseTarget(req: Request, res: Response) {
  const params = GetExampleParams.safeParse(req.params);
  const query = GetExampleQueryParams.safeParse(req.query);
  if (!params.success || !query.success) {
    res.status(400).json({ error: (params.error ?? query.error)?.flatten() });
    return null;
  }
  // Tenant isolation: every query matches both the id and the org.
  return and(eq(exampleTable.id, params.data.id), eq(exampleTable.orgId, query.data.orgId));
}

const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

export function createExampleRouter(db: Db, queue: JobQueue): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    // Tenant isolation: orgId is mandatory — never return rows across orgs.
    const parsed = ListExamplesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const { orgId, limit, cursor } = parsed.data;
    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) {
      res.status(400).json({ error: "Invalid cursor" });
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
    res.json(toPage(rows, limit));
  });

  router.post("/", async (req, res) => {
    const parsed = CreateExampleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const [row] = await db.insert(exampleTable).values(parsed.data).returning();
    await queue.enqueue(exampleCreated, { exampleId: row.id, orgId: row.orgId });
    res.status(201).json(row);
  });

  router.get("/:id", async (req, res) => {
    const target = parseTarget(req, res);
    if (!target) return;
    const [row] = await db.select().from(exampleTable).where(target);
    if (!row) return void notFound(res);
    res.json(row);
  });

  router.patch("/:id", async (req, res) => {
    const target = parseTarget(req, res);
    if (!target) return;
    const body = UpdateExampleBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.flatten() });
      return;
    }
    const [row] = await db
      .update(exampleTable)
      .set({ ...body.data, updatedAt: new Date() })
      .where(target)
      .returning();
    if (!row) return void notFound(res);
    res.json(row);
  });

  router.delete("/:id", async (req, res) => {
    const target = parseTarget(req, res);
    if (!target) return;
    const [row] = await db.delete(exampleTable).where(target).returning({ id: exampleTable.id });
    if (!row) return void notFound(res);
    res.status(204).end();
  });

  return router;
}
