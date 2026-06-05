import { env } from "@repo/env";
import PgBoss from "pg-boss";
import { logger } from "./logger.js";

const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

await boss.start();

await boss.work("example-job", async (jobs) => {
  for (const job of jobs) {
    logger.info({ jobId: job.id }, "processing job");
  }
});

logger.info("worker started");
