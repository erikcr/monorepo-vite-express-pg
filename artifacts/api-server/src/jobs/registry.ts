import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { count } from "drizzle-orm";
import type { QueueOptions } from "pg-boss";
import { logger } from "../logger.js";

export interface JobContext {
  db: Db;
  jobId: string;
}

export interface JobDefinition<T extends object> {
  /** Queue name: letters, numbers, hyphens, underscores or periods. */
  name: string;
  /** Cron expression (UTC). Omit for jobs that are only enqueued. */
  schedule?: string;
  /** Per-queue settings such as retryLimit and retryBackoff. */
  options?: QueueOptions;
  handler: (data: T, ctx: JobContext) => Promise<void>;
}

function defineJob<T extends object>(definition: JobDefinition<T>): JobDefinition<T> {
  return definition;
}

// Enqueued by POST /api/example. Replace the body with real follow-up work (emails, webhooks, …).
export const exampleCreated = defineJob<{ exampleId: string; orgId: string }>({
  name: "example-created",
  options: { retryLimit: 3, retryBackoff: true },
  handler: async ({ exampleId, orgId }, { jobId }) => {
    logger.info({ jobId, exampleId, orgId }, "example created");
  },
});

// Runs on a schedule; shows a job that reads the database.
export const exampleDailyCount = defineJob<Record<string, never>>({
  name: "example-daily-count",
  schedule: "0 3 * * *",
  handler: async (_data, { db, jobId }) => {
    const [row] = await db.select({ total: count() }).from(exampleTable);
    logger.info({ jobId, total: row?.total ?? 0 }, "example daily count");
  },
});

// Every job the worker runs. A job missing from this list is never processed.
// biome-ignore lint/suspicious/noExplicitAny: handlers take different payload types
export const jobs: JobDefinition<any>[] = [exampleCreated, exampleDailyCount];
