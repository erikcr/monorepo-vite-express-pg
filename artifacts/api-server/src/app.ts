import type { Db } from "@repo/db";
import { env } from "@repo/env";
import cors from "cors";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
  type Router,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import type { JobQueue } from "./jobs/queue.js";
import { trackError } from "./lib/error-tracker.js";
import { createAccess } from "./middleware/access.js";
import { requestLogger } from "./middleware/request-logger.js";
import { createMeRouter, createOrgsRouter } from "./routes/account.js";
import { createAdminRouter } from "./routes/admin.js";
import { createClientErrorsRouter } from "./routes/client-errors.js";
import { createDocsRouter } from "./routes/docs.js";
import { createExampleRouter } from "./routes/example.js";
import { createHealthRouter } from "./routes/health.js";
import { createWebhooksRouter } from "./routes/webhooks.js";

/**
 * Every router the API mounts, by path. Each route in them declares one access rule
 * (src/middleware/access.ts); src/__tests__/route-access.test.ts walks this list to prove it.
 */
export function createRouters(db: Db, queue: JobQueue): Record<string, Router> {
  const access = createAccess(db);
  return {
    "/health": createHealthRouter(db),
    "/api/me": createMeRouter(db, access),
    "/api/orgs": createOrgsRouter(db, access),
    "/api/admin": createAdminRouter(db, access),
    "/api/example": createExampleRouter(db, queue, access),
    "/api/client-errors": createClientErrorsRouter(),
    "/api/webhooks": createWebhooksRouter(db),
    ...(env.API_DOCS ? { "/docs": createDocsRouter() } : {}),
  };
}

export function createApp(db: Db, queue: JobQueue): Express {
  const app = express();
  // Railway's edge is one proxy hop: trust its X-Forwarded-For so req.ip is the client's address
  // (the rate limiter keys on it). Raise this if you add another proxy (e.g. a CDN) in front.
  app.set("trust proxy", 1);

  app.use(requestLogger);
  app.use(helmet());
  // Responses can carry an org's data, so no browser or proxy keeps a copy of any of them.
  app.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
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
  // Explicit body size cap (Express's default, stated): larger bodies get 413. Webhook bodies stay
  // bytes, which their signatures are checked against; express.json then leaves them alone.
  app.use("/api/webhooks", express.raw({ type: () => true, limit: "100kb" }));
  app.use(express.json({ limit: "100kb" }));

  for (const [path, router] of Object.entries(createRouters(db, queue))) app.use(path, router);

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler — must be last and have 4 params. Express 5 forwards rejected async
  // handlers here. Errors meant for the client (`expose`, e.g. body-parser's malformed JSON or
  // 413) keep their status and message; anything else is logged with the request id (and reported
  // to Sentry, if on) and answered generically, so internals (SQL, stack details) never leak. A
  // dependency's error can carry a status of its own (Clerk's 429), which is still our 500.
  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    const { status, expose } = err as { status?: number; expose?: boolean };
    if (!expose || !status || status >= 500) {
      req.log.error({ err }, "unhandled error");
      trackError(err, {
        tags: { requestId: String(req.id), method: req.method, path: req.path },
      });
      res.status(500).json({ error: "Internal server error", requestId: req.id });
      return;
    }
    res.status(status).json({ error: err.message });
  });

  return app;
}
