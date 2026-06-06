import type { Db } from "@repo/db";
import { env } from "@repo/env";
import cors from "cors";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { logger } from "./logger.js";
import { createExampleRouter } from "./routes/example.js";
import { createHealthRouter } from "./routes/health.js";

export function createApp(db: Db): Express {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()),
      credentials: true,
    })
  );
  app.use(express.json());

  app.use("/health", createHealthRouter(db));
  app.use("/api/example", createExampleRouter(db));

  // 404
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Global error handler — must be last and have 4 params
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = (err as { status?: number }).status ?? 500;
    logger.error({ err, status }, "unhandled error");
    res.status(status).json({ error: err.message ?? "Internal server error" });
  });

  return app;
}
