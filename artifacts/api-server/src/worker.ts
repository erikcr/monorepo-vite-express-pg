// Standalone worker, for running jobs in a separate service: set RUN_WORKER=false on the API
// and start this with `node dist/worker.js` (same image).
import "./validate-env.js";
import { closeDb, db } from "@repo/db";
import { env } from "@repo/env";
import { startBoss } from "./jobs/queue.js";
import { startWorker } from "./jobs/worker.js";
import { flushErrorTracker, initErrorTracker } from "./lib/error-tracker.js";
import { onShutdown } from "./shutdown.js";

initErrorTracker();
const boss = await startBoss(env.DATABASE_URL);
await startWorker(boss, db);

onShutdown([() => boss.stop({ graceful: true, timeout: 20_000 }), closeDb, flushErrorTracker]);
