import { PgBoss } from "pg-boss";
import { logger } from "../logger.js";
import { type JobDefinition, jobs } from "./registry.js";

/** What the API needs from the job system; tests pass a fake. */
export interface JobQueue {
  enqueue<T extends object>(job: JobDefinition<T>, data: T): Promise<void>;
}

/** Starts pg-boss (creating its schema on first run) and every registered queue. */
export async function startBoss(databaseUrl: string): Promise<PgBoss> {
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err) => logger.error({ err }, "pg-boss error"));
  await boss.start();
  await createQueues(boss);
  return boss;
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
