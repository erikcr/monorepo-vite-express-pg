import { Router } from "express";
import { db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";

export const exampleRouter = Router();

exampleRouter.get("/", async (req, res) => {
  const { orgId } = req.query as { orgId?: string };
  const rows = orgId
    ? await db.select().from(exampleTable).where(eq(exampleTable.orgId, orgId))
    : await db.select().from(exampleTable);
  res.json(rows);
});

exampleRouter.post("/", async (req, res) => {
  const { orgId, name } = req.body as { orgId: string; name: string };
  const [row] = await db.insert(exampleTable).values({ orgId, name }).returning();
  res.status(201).json(row);
});
