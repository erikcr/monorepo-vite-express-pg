import { Router } from "express";
import { exampleTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import type { Db } from "@repo/db";

export function createExampleRouter(db: Db) {
  const router = Router();

  router.get("/", async (req, res) => {
    const { orgId } = req.query as { orgId?: string };
    const rows = orgId
      ? await db.select().from(exampleTable).where(eq(exampleTable.orgId, orgId))
      : await db.select().from(exampleTable);
    res.json(rows);
  });

  router.post("/", async (req, res) => {
    const { orgId, name } = req.body as { orgId: string; name: string };
    const [row] = await db.insert(exampleTable).values({ orgId, name }).returning();
    res.status(201).json(row);
  });

  return router;
}
