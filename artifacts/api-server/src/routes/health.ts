import { GetHealthResponse, GetReadyResponse } from "@repo/api-zod";
import type { Db } from "@repo/db";
import { env } from "@repo/env";
import { sql } from "drizzle-orm";
import { Router } from "express";
import { sendValidated } from "../lib/send-validated.js";
import { publicRoute } from "../middleware/access.js";

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
  let checking: Promise<boolean> | undefined;

  // Probes are public and never rate limited, so they share one check: concurrent probes wait for
  // the same query, and a success answers every probe for READY_CACHE_MS.
  const checkDb = (): Promise<boolean> => {
    if (Date.now() < readyUntil) return Promise.resolve(true);
    checking ??= pingDb(db, READY_TIMEOUT_MS)
      .then((ok) => {
        if (ok) readyUntil = Date.now() + READY_CACHE_MS;
        return ok;
      })
      .finally(() => {
        checking = undefined;
      });
    return checking;
  };

  // Liveness: 200 while the process is up. Reports DB status for dashboards, and the deployed commit.
  router.get("/", publicRoute, async (_req, res) => {
    const dbOk = await checkDb();
    sendValidated(res, GetHealthResponse, {
      status: "ok",
      ts: new Date().toISOString(),
      db: dbOk ? "ok" : "error",
      sha: env.COMMIT_SHA,
    });
  });

  // Readiness: 503 when the DB is unreachable, so the platform holds traffic (Railway healthcheckPath).
  router.get("/ready", publicRoute, async (_req, res) => {
    const dbOk = await checkDb();
    sendValidated(
      res,
      GetReadyResponse,
      { status: dbOk ? "ready" : "not_ready", checks: { db: dbOk ? "ok" : "error" } },
      dbOk ? 200 : 503
    );
  });

  return router;
}
