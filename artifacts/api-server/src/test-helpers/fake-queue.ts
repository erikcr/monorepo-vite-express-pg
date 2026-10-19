import type { JobQueue } from "../jobs/queue.js";

/** A JobQueue that records what was enqueued instead of sending it. */
export function createFakeQueue(): JobQueue & { enqueued: { name: string; data: object }[] } {
  const enqueued: { name: string; data: object }[] = [];
  return {
    enqueued,
    async enqueue(job, data) {
      enqueued.push({ name: job.name, data });
    },
  };
}
