// Standalone worker, for running jobs in a separate service: set RUN_WORKER=false on the API
// and start this with `node dist/worker.js` (same image).
import { closeDb, db } from "@repo/db";
import { env } from "@repo/env";
import { startBoss } from "./jobs/queue.js";
import { startWorker } from "./jobs/worker.js";
import { onShutdown } from "./shutdown.js";

const boss = await startBoss(env.DATABASE_URL);
await startWorker(boss, db);

onShutdown([() => boss.stop({ graceful: true, timeout: 20_000 }), closeDb]);
