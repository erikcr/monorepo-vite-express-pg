import PgBoss from "pg-boss";
import { env } from "@repo/env";

const boss = new PgBoss(env.DATABASE_URL);

boss.on("error", (err) => console.error("pg-boss error:", err));

await boss.start();

await boss.work("example-job", async (job) => {
  console.log("processing job:", job.id, job.data);
  // TODO: add job handlers
});

console.log("worker started");
