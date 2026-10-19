import type { Server } from "node:http";
import { closeDb, db } from "@repo/db";
import { env } from "@repo/env";
import { createApp } from "./app.js";
import { createJobQueue, startBoss } from "./jobs/queue.js";
import { startWorker } from "./jobs/worker.js";
import { logger } from "./logger.js";
import { onShutdown } from "./shutdown.js";

const boss = await startBoss(env.DATABASE_URL);
// The worker runs in this process unless RUN_WORKER=false (then run dist/worker.js separately).
if (env.RUN_WORKER) await startWorker(boss, db);

const app = createApp(db, createJobQueue(boss));
const port = Number(env.PORT ?? 3000);

const server = app.listen(port, () => {
  logger.info({ port }, "api-server started");
});

const closeServer = (s: Server) =>
  new Promise<void>((resolve, reject) => s.close((err) => (err ? reject(err) : resolve())));

// Stop taking requests (in-flight ones finish), let active jobs finish, then close the DB pool.
onShutdown([
  () => closeServer(server),
  () => boss.stop({ graceful: true, timeout: 20_000 }),
  closeDb,
]);
