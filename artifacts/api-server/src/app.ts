import type { Db } from "@repo/db";
import { env } from "@repo/env";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type { JobQueue } from "./jobs/queue.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createExampleRouter } from "./routes/example.js";
import { createHealthRouter } from "./routes/health.js";

export function createApp(db: Db, queue: JobQueue): Express {
  const app = express();

  app.use(requestLogger);
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  app.use(express.json());

  app.use("/health", createHealthRouter(db));
  app.use("/api/example", createExampleRouter(db, queue));

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler — must be last and have 4 params. Express 5 forwards rejected async
  // handlers here. 4xx errors (e.g. malformed JSON) keep their message; anything else is logged
  // with the request id and answered generically, so internals (SQL, stack details) never leak.
  // To use an error tracker (Sentry, …), report `err` here.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status ?? 500;
    if (status >= 500) {
      req.log.error({ err }, "unhandled error");
      res.status(status).json({ error: "Internal server error", requestId: req.id });
      return;
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}
