import { CreateExampleBody } from "@repo/api-zod";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";
import type { JobQueue } from "../jobs/queue.js";
import { exampleCreated } from "../jobs/registry.js";

export function createExampleRouter(db: Db, queue: JobQueue): Router {
  const router = Router();

  router.get("/", async (req, res) => {
    const { orgId } = req.query as { orgId?: string };
    // Tenant isolation: orgId is mandatory — never return rows across orgs.
    if (!orgId) {
      res.status(400).json({ error: "orgId query parameter is required" });
      return;
    }
    const rows = await db.select().from(exampleTable).where(eq(exampleTable.orgId, orgId));
    res.json(rows);
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

  return router;
}
