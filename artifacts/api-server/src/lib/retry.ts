import { setTimeout as sleep } from "node:timers/promises";
import { logger } from "../logger.js";

/**
 * Runs `attempt` until it succeeds, waiting 1s, 2s, 4s… (at most 30s) between tries, and gives up
 * with the last error once `giveUpAfterMs` has passed. For startup steps that need the database.
 */
export async function retryUntilReady<T>(
  what: string,
  attempt: () => Promise<T>,
  { giveUpAfterMs = 5 * 60_000, firstDelayMs = 1000, maxDelayMs = 30_000 } = {}
): Promise<T> {
  const deadline = Date.now() + giveUpAfterMs;
  for (let delay = firstDelayMs; ; delay = Math.min(delay * 2, maxDelayMs)) {
    try {
      return await attempt();
    } catch (err) {
      if (Date.now() + delay > deadline) throw err;
      logger.warn({ err, retryInMs: delay }, `${what} failed; trying again`);
      await sleep(delay);
    }
  }
}
