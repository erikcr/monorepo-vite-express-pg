import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import type { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createJobQueue } from "../jobs/queue.js";
import { exampleCreated, exampleDailyCount } from "../jobs/registry.js";
import { startWorker } from "../jobs/worker.js";
import { logger } from "../logger.js";
import { createOrg } from "../test-helpers/auth.js";
import { createTestBoss } from "../test-helpers/create-test-boss.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { failedQuery } from "../test-helpers/failed-query.js";

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

  it("keeps a failed query's values out of its log line, report and job row", async () => {
    const { queryError, secret } = await failedQuery(db);
    vi.spyOn(exampleCreated, "handler").mockRejectedValue(queryError);
    const error = vi.spyOn(logger, "error");
    await createJobQueue(boss).enqueue(exampleCreated, { exampleId: "ex_3", orgId: "org_1" });
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.anything(), "job failed"), {
      timeout: 10_000,
    });
    const [[logged]] = error.mock.calls as unknown as [[{ err: Error; jobId: string }]];
    const { err, jobId } = logged;
    expect(err.message).toMatch(/^duplicate key value violates unique constraint/);
    expect(`${err.message}${err.stack}`).not.toContain(secret);
    // pg-boss keeps the error the handler rethrew in the job's row.
    const job = await vi.waitFor(
      async () => {
        const found = await boss.getJobById(exampleCreated.name, jobId);
        if (!found?.output) throw new Error("not recorded yet");
        return found;
      },
      { timeout: 10_000 }
    );
    expect(JSON.stringify(job.output)).toContain("duplicate key value");
    expect(JSON.stringify(job.output)).not.toContain(secret);
  });

  it("registers scheduled jobs", async () => {
    const schedules = await boss.getSchedules();
    expect(schedules.map((s) => s.name)).toContain(exampleDailyCount.name);
  });
});

describe("exampleDailyCount", () => {
  it("counts example rows", async () => {
    const db = await createTestDb();
    const [one, two] = [await createOrg(db), await createOrg(db)];
    await db.insert(exampleTable).values([
      { orgId: one.id, name: "A" },
      { orgId: two.id, name: "B" },
    ]);
    const info = vi.spyOn(logger, "info");
    await exampleDailyCount.handler({}, { db, jobId: "job_1" });
    expect(info).toHaveBeenCalledWith({ jobId: "job_1", total: 2 }, "example daily count");
  });
});
