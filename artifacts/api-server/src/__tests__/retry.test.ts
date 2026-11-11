import { describe, expect, it, vi } from "vitest";
import { startBoss } from "../jobs/queue.js";
import { retryUntilReady } from "../lib/retry.js";
import { logger } from "../logger.js";

// startBoss waits this way for a database that can't be reached yet (src/jobs/queue.ts).
describe("retryUntilReady", () => {
  const fast = { firstDelayMs: 1, maxDelayMs: 4 };

  it("tries again until the attempt succeeds", async () => {
    const attempt = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValue("started");
    await expect(retryUntilReady("starting", attempt, fast)).resolves.toBe("started");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("gives up with the last error once its time is up", async () => {
    let tries = 0;
    const attempt = async () => {
      tries++;
      throw new Error(`refused ${tries}`);
    };
    const started = Date.now();
    const err = await retryUntilReady("starting", attempt, { ...fast, giveUpAfterMs: 50 }).catch(
      (e: unknown) => e
    );
    expect(err).toEqual(new Error(`refused ${tries}`));
    expect(tries).toBeGreaterThan(2);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("is how pg-boss starts, so the API waits for a database it can't reach yet", async () => {
    const warn = vi.spyOn(logger, "warn");
    // Nothing listens on port 1: every connection is refused at once.
    await expect(
      startBoss("postgres://u:p@127.0.0.1:1/none", { firstDelayMs: 1, giveUpAfterMs: 100 })
    ).rejects.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ retryInMs: expect.any(Number) }),
      "starting pg-boss failed; trying again"
    );
  });
});
