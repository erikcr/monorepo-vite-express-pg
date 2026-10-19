import type { Db } from "@repo/db";
import { env } from "@repo/env";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { JobQueue } from "./jobs/queue.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createClientErrorsRouter } from "./routes/client-errors.js";
import { createDocsRouter } from "./routes/docs.js";
import { createExampleRouter } from "./routes/example.js";
import { createHealthRouter } from "./routes/health.js";

export function createApp(db: Db, queue: JobQueue): Express {
  const app = express();
  // Railway's edge is one proxy hop: trust its X-Forwarded-For so req.ip is the client's address
  // (the rate limiter keys on it). Raise this if you add another proxy (e.g. a CDN) in front.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    })
  );
  if (env.RATE_LIMIT_MAX > 0) {
    app.use(
      rateLimit({
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        limit: env.RATE_LIMIT_MAX,
        standardHeaders: "draft-8",
        legacyHeaders: false,
        // Health probes come from the platform and must never be throttled.
        skip: (req) => req.path.startsWith("/health"),
        message: { error: "Too many requests" },
      })
    );
  }
  // Explicit body size cap (Express's default, stated): larger bodies get 413.
  app.use(express.json({ limit: "100kb" }));

  app.use("/health", createHealthRouter(db));
  app.use("/api/example", createExampleRouter(db, queue));
  app.use("/api/client-errors", createClientErrorsRouter());
  if (env.API_DOCS) app.use("/docs", createDocsRouter());

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
