import { env } from "@repo/env";
import pino from "pino";
import { withoutQueryValues } from "./lib/error-tracker.js";

/** How every log line writes an `err`: as pino does, without the values a failed query carried. */
export const errSerializer = (err: unknown): object =>
  pino.stdSerializers.err(withoutQueryValues(err) as Error);

// Plain JSON everywhere; `pnpm dev` pipes it through pino-pretty for readable local logs.
// (An in-process pino-pretty transport can't run from the esbuild bundle.) Silent under vitest.
export const logger = pino({
  level: env.NODE_ENV === "test" ? "silent" : "info",
  serializers: { err: errSerializer },
});
