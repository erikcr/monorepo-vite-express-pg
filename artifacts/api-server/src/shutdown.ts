import { logger } from "./logger.js";

/**
 * Runs `steps` in order on SIGTERM/SIGINT, then exits. Railway sends SIGTERM on every redeploy
 * and SIGKILL after `drainingSeconds` (.railway/railway.ts), so the timeout must stay below that.
 */
export function onShutdown(steps: Array<() => Promise<unknown>>, timeoutMs = 25_000): void {
  let started = false;
  const shutdown = async (signal: string) => {
    if (started) return;
    started = true;
    logger.info({ signal }, "shutting down");
    setTimeout(() => {
      logger.error({ timeoutMs }, "shutdown timed out, forcing exit");
      process.exit(1);
    }, timeoutMs).unref();
    try {
      for (const step of steps) await step();
      logger.info("shutdown complete");
      process.exit(0);
    } catch (err) {
      logger.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
