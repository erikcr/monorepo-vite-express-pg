import { env } from "@repo/env";
import pino from "pino";

export const logger = pino({
  level: "info",
  ...(env.NODE_ENV !== "production"
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, ignore: "pid,hostname" },
        },
      }
    : {}),
});
