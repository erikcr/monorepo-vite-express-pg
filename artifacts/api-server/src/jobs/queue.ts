import { PgBoss } from "pg-boss";
import { retryUntilReady } from "../lib/retry.js";
import { logger } from "../logger.js";
import { type JobDefinition, jobs } from "./registry.js";

/** What the API needs from the job system; tests pass a fake. */
export interface JobQueue {
  enqueue<T extends object>(job: JobDefinition<T>, data: T): Promise<void>;
}

/**
 * Starts pg-boss (creating its schema on first run) and every registered queue. A database that
 * can't be reached yet is waited for, up to 5 minutes: a process started while Postgres restarts
 * would otherwise exit, and Railway stops restarting a service after 3 quick failures, leaving it
 * down until the next deploy.
 */
export async function startBoss(
  databaseUrl: string,
  retry?: Parameters<typeof retryUntilReady>[2]
): Promise<PgBoss> {
  return retryUntilReady(
    "starting pg-boss",
    async () => {
      const boss = new PgBoss(databaseUrl);
      boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
      await boss.start();
      await createQueues(boss);
      return boss;
    },
    retry
  );
}

// pg-boss v11+ requires a queue to exist before send() or work().
export async function createQueues(boss: PgBoss): Promise<void> {
  for (const job of jobs) await boss.createQueue(job.name, job.options);
}

export function createJobQueue(boss: PgBoss): JobQueue {
  return {
    async enqueue(job, data) {
      await boss.send(job.name, data);
    },
  };
}
