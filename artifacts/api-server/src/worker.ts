import PgBoss from "pg-boss";
import { env } from "@repo/env";
import { logger } from "./logger.js";

const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err) => logger.error({ err }, "pg-boss error"));

await boss.start();

await boss.work("example-job", async (job) => {
  logger.info({ jobId: job.id }, "processing job");
  // TODO: add job handlers
});

logger.info("worker started");
