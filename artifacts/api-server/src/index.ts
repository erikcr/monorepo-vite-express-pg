import "./validate-env.js";
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

if (env.NODE_ENV === "production" && env.CORS_ORIGIN.length === 0) {
  logger.warn(
    "CORS_ORIGIN is not set: browsers on other origins can't call this API, and session tokens' origin isn't checked"
  );
}

const app = createApp(db, createJobQueue(boss));
const port = env.PORT;

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
