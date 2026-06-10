import { createExampleBody } from "@repo/api-zod";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import { Router } from "express";

export function createExampleRouter(db: Db) {
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
    const parsed = createExampleBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const [row] = await db.insert(exampleTable).values(parsed.data).returning();
    res.status(201).json(row);
  });

  return router;
}
