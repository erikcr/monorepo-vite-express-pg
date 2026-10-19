import pino from "pino";

// Plain JSON everywhere; `pnpm dev` pipes it through pino-pretty for readable local logs.
// (An in-process pino-pretty transport can't run from the esbuild bundle.)
export const logger = pino({ level: "info" });
