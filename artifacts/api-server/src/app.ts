import express, { type Express } from "express";
import { healthRouter } from "./routes/health.js";
import { createExampleRouter } from "./routes/example.js";
import type { Db } from "@repo/db";

export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());
  app.use("/health", healthRouter);
  app.use("/api/example", createExampleRouter(db));
  return app;
}
