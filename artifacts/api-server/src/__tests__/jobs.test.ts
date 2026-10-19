import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import type { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createJobQueue } from "../jobs/queue.js";
import { exampleCreated, exampleDailyCount } from "../jobs/registry.js";
import { startWorker } from "../jobs/worker.js";
import { logger } from "../logger.js";
import { createTestBoss } from "../test-helpers/create-test-boss.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

describe("worker (pg-boss on PGlite)", () => {
  let boss: PgBoss;
  let db: Db;

  beforeAll(async () => {
    const client = new PGlite();
    db = await createTestDb(client);
    boss = await createTestBoss(client);
    await startWorker(boss, db);
  });

  afterAll(async () => {
    await boss.stop({ graceful: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("processes an enqueued job with its payload", async () => {
    const handler = vi.spyOn(exampleCreated, "handler").mockResolvedValue();
    await createJobQueue(boss).enqueue(exampleCreated, { exampleId: "ex_1", orgId: "org_1" });
    await vi.waitFor(() => expect(handler).toHaveBeenCalled(), { timeout: 10_000 });
    expect(handler.mock.calls[0]?.[0]).toEqual({ exampleId: "ex_1", orgId: "org_1" });
  });

  it("logs a failing job with its name and id, so pg-boss can retry it", async () => {
    vi.spyOn(exampleCreated, "handler").mockRejectedValue(new Error("boom"));
    const error = vi.spyOn(logger, "error");
    await createJobQueue(boss).enqueue(exampleCreated, { exampleId: "ex_2", orgId: "org_1" });
    await vi.waitFor(
      () =>
        expect(error).toHaveBeenCalledWith(
          expect.objectContaining({ job: "example-created", jobId: expect.any(String) }),
          "job failed"
        ),
      { timeout: 10_000 }
    );
  });

  it("registers scheduled jobs", async () => {
    const schedules = await boss.getSchedules();
    expect(schedules.map((s) => s.name)).toContain(exampleDailyCount.name);
  });
});

describe("exampleDailyCount", () => {
  it("counts example rows", async () => {
    const db = await createTestDb();
    await db.insert(exampleTable).values([
      { orgId: "org_1", name: "A" },
      { orgId: "org_2", name: "B" },
    ]);
    const info = vi.spyOn(logger, "info");
    await exampleDailyCount.handler({}, { db, jobId: "job_1" });
    expect(info).toHaveBeenCalledWith({ jobId: "job_1", total: 2 }, "example daily count");
  });
});
