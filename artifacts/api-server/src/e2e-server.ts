// Backend for the full-stack E2E tests (e2e/): the real app and job worker on an in-process
// Postgres (PGlite), migrated from the real migration files. Fresh, empty data on every start.
import { PGlite } from "@electric-sql/pglite";
import { env } from "@repo/env";
import { createApp } from "./app.js";
import { createJobQueue } from "./jobs/queue.js";
import { startWorker } from "./jobs/worker.js";
import { grantStaff } from "./lib/grants.js";
import { logger } from "./logger.js";
import { createTestBoss } from "./test-helpers/create-test-boss.js";
import { createTestDb } from "./test-helpers/create-test-db.js";

const client = new PGlite();
const db = await createTestDb(client);
const boss = await createTestBoss(client);
await startWorker(boss, db);

// `--staff <email>`: grant that email staff access in this run's (fresh) database.
const staffFlag = process.argv.indexOf("--staff");
const staffEmail = staffFlag === -1 ? undefined : process.argv[staffFlag + 1];
if (staffEmail) await grantStaff(db, staffEmail, "staff_admin");

createApp(db, createJobQueue(boss)).listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "e2e api-server started");
});
