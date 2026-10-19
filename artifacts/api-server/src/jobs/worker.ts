import type { Db } from "@repo/db";
import type { PgBoss } from "pg-boss";
import { logger } from "../logger.js";
import { jobs } from "./registry.js";

/** Subscribes to every registered queue and registers schedules. Queues must already exist. */
export async function startWorker(boss: PgBoss, db: Db): Promise<void> {
  for (const job of jobs) {
    await boss.work(job.name, async (batch) => {
      for (const { id, data } of batch) {
        try {
          await job.handler(data, { db, jobId: id });
        } catch (err) {
          // Log with context, then rethrow so pg-boss records the failure and retries.
          logger.error({ err, job: job.name, jobId: id }, "job failed");
          throw err;
        }
      }
    });
    if (job.schedule) await boss.schedule(job.name, job.schedule);
  }
  logger.info({ queues: jobs.map((j) => j.name) }, "worker started");
}
