import type { Db } from "@repo/db";
import { env } from "@repo/env";
import { sql } from "drizzle-orm";
import { Router } from "express";

const READY_TIMEOUT_MS = 2_000;
// Only successes are cached: probes can't hammer a healthy DB, and recovery shows up immediately.
const READY_CACHE_MS = 10_000;

async function pingDb(db: Db, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([db.execute(sql`SELECT 1`).then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthRouter(db: Db): Router {
  const router = Router();
  let readyUntil = 0;

  // Liveness: 200 while the process is up. Reports DB status for dashboards, and the deployed commit.
  router.get("/", async (_req, res) => {
    const dbOk = await pingDb(db, READY_TIMEOUT_MS);
    res.json({
      status: "ok",
      ts: new Date().toISOString(),
      db: dbOk ? "ok" : "error",
      sha: env.COMMIT_SHA,
    });
  });

  // Readiness: 503 when the DB is unreachable, so the platform holds traffic (Railway healthcheckPath).
  router.get("/ready", async (_req, res) => {
    let dbOk = Date.now() < readyUntil;
    if (!dbOk) {
      dbOk = await pingDb(db, READY_TIMEOUT_MS);
      if (dbOk) readyUntil = Date.now() + READY_CACHE_MS;
    }
    res
      .status(dbOk ? 200 : 503)
      .json({ status: dbOk ? "ready" : "not_ready", checks: { db: dbOk ? "ok" : "error" } });
  });

  return router;
}
