import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@repo/db";
import type { ErrorEvent } from "@sentry/node";
import type { PgBoss } from "pg-boss";
import supertest from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createJobQueue } from "../jobs/queue.js";
import { exampleCreated } from "../jobs/registry.js";
import { startWorker } from "../jobs/worker.js";
import { flushErrorTracker, initErrorTracker, trackError } from "../lib/error-tracker.js";
import { bearer } from "../test-helpers/auth.js";
import { createTestBoss } from "../test-helpers/create-test-boss.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

// The real Sentry SDK with a well-formed but fake DSN; beforeSend records each event and drops it,
// so nothing leaves the machine.
const events: ErrorEvent[] = [];
const record = (event: ErrorEvent) => {
  events.push(event);
  return null;
};
const sent = async () => {
  await flushErrorTracker();
  return events;
};

const failingDb = {
  select: () => {
    throw new Error("db down");
  },
} as unknown as Db;

describe("without SENTRY_DSN", () => {
  it("stays off, and reporting is a no-op", async () => {
    vi.stubEnv("SENTRY_DSN", undefined);
    expect(initErrorTracker({ beforeSend: record })).toBe(false);
    trackError(new Error("ignored"));
    expect(await sent()).toEqual([]);
    vi.unstubAllEnvs();
  });
});

describe("with SENTRY_DSN", () => {
  beforeAll(() => {
    vi.stubEnv("SENTRY_DSN", "https://public@o1.ingest.sentry.io/1");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "abc123");
    expect(initErrorTracker({ beforeSend: record })).toBe(true);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    events.length = 0;
  });

  it("reports a 500 with its request id, method and path, tagged with environment and release", async () => {
    const res = await supertest(createApp(failingDb, createFakeQueue()))
      .get("/api/example/123e4567-e89b-42d3-a456-426614174000?token=secret")
      .set(bearer({ sub: "user_x", email: "x@x.test" }));
    expect(res.status).toBe(500);
    const [event, ...rest] = await sent();
    expect(rest).toEqual([]);
    expect(event?.exception?.values?.[0]).toMatchObject({ type: "Error", value: "db down" });
    expect(event?.tags).toEqual({
      requestId: res.headers["x-request-id"],
      method: "GET",
      path: "/api/example/123e4567-e89b-42d3-a456-426614174000",
    });
    expect(event).toMatchObject({ environment: "staging", release: "abc123" });
    // Nothing from the request itself: no headers, query string or address.
    expect(event?.request).toBeUndefined();
    expect(event?.user).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("token");
  });

  it("doesn't report 4xx answers", async () => {
    const res = await supertest(createApp(await createTestDb(), createFakeQueue()))
      .post("/api/example")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(await sent()).toEqual([]);
  });

  it("reports a browser crash by its type, stack and app, with the page's path only", async () => {
    const res = await supertest(createApp(await createTestDb(), createFakeQueue()))
      .post("/api/client-errors")
      .send({
        app: "admin",
        message: "x is undefined",
        stack:
          "TypeError: x is undefined\n    at render (https://admin.example/assets/index-abc.js:1:2345)",
        componentStack: "\n    at OrgsPage",
        url: "https://admin.example/orgs?q=private#frag",
      });
    expect(res.status).toBe(204);
    const [event] = await sent();
    const exception = event?.exception?.values?.[0];
    expect(exception).toMatchObject({ type: "TypeError", value: "x is undefined" });
    expect(exception?.stacktrace?.frames?.at(-1)).toMatchObject({
      function: "render",
      lineno: 1,
      colno: 2345,
    });
    expect(event?.tags).toEqual({ source: "browser", app: "admin", path: "/orgs" });
    expect(event?.extra).toEqual({ componentStack: "\n    at OrgsPage" });
    expect(event?.request).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("private");
  });

  it("reports a crash without a stack or a parseable url as a plain Error", async () => {
    await supertest(createApp(await createTestDb(), createFakeQueue()))
      .post("/api/client-errors")
      .send({ app: "web", message: "Loading chunk 3 failed", url: "not a url" });
    const [event] = await sent();
    expect(event?.exception?.values?.[0]).toMatchObject({
      type: "Error",
      value: "Loading chunk 3 failed",
    });
    expect(event?.tags).toEqual({ source: "browser", app: "web" });
    expect(event?.extra).toBeUndefined();
  });

  describe("a failing job", () => {
    let boss: PgBoss;
    beforeAll(async () => {
      const client = new PGlite();
      const db = await createTestDb(client);
      boss = await createTestBoss(client);
      await startWorker(boss, db);
    });
    afterAll(async () => {
      await boss.stop({ graceful: false });
    });

    it("is reported with the job's name and id", async () => {
      vi.spyOn(exampleCreated, "handler").mockRejectedValueOnce(new Error("job boom"));
      await createJobQueue(boss).enqueue(exampleCreated, { exampleId: "ex_1", orgId: "org_1" });
      await vi.waitFor(async () => expect(await sent()).toHaveLength(1), { timeout: 10_000 });
      expect(events[0]?.exception?.values?.[0]?.value).toBe("job boom");
      expect(events[0]?.tags).toEqual({ job: "example-created", jobId: expect.any(String) });
    });
  });
});
