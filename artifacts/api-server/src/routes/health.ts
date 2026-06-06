import type { Db } from "@repo/db";
import { sql } from "drizzle-orm";
import { Router } from "express";

export function createHealthRouter(db: Db) {
  const router = Router();

  router.get("/", async (_req, res) => {
    let dbStatus: "ok" | "error" = "error";
    try {
      await db.execute(sql`SELECT 1`);
      dbStatus = "ok";
    } catch {
      dbStatus = "error";
    }
    res.json({ status: "ok", ts: new Date().toISOString(), db: dbStatus });
  });

  return router;
}
