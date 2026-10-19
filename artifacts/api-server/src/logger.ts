import { env } from "@repo/env";
import pino from "pino";

// Plain JSON everywhere; `pnpm dev` pipes it through pino-pretty for readable local logs.
// (An in-process pino-pretty transport can't run from the esbuild bundle.) Silent under vitest.
export const logger = pino({ level: env.NODE_ENV === "test" ? "silent" : "info" });
