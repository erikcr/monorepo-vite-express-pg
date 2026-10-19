import type { Db } from "@repo/db";
import supertest from "supertest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

// A db whose queries fail or hang, controlled per test.
function fakeDb(execute: () => Promise<unknown>) {
  return { execute: vi.fn(execute) } as unknown as Db & { execute: ReturnType<typeof vi.fn> };
}

describe("GET /health", () => {
  let request: ReturnType<typeof supertest>;

  beforeAll(async () => {
    request = supertest(createApp(await createTestDb()));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
  });

  it("returns { status: 'ok' } with a timestamp and db status", async () => {
    const res = await request.get("/health");
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ts).toBe("string");
    expect(new Date(res.body.ts).getTime()).not.toBeNaN();
    expect(res.body.db).toBe("ok");
  });

  it("reports the deployed commit, or null when not on Railway", async () => {
    expect((await request.get("/health")).body.sha).toBeNull();
    vi.stubEnv("RAILWAY_GIT_COMMIT_SHA", "abc123");
    expect((await request.get("/health")).body.sha).toBe("abc123");
  });

  it("stays 200 when the db is down (liveness), reporting db: error", async () => {
    const res = await supertest(createApp(fakeDb(() => Promise.reject(new Error("down"))))).get(
      "/health"
    );
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("error");
  });
});

describe("GET /health/ready", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 200 when the db answers", async () => {
    const res = await supertest(createApp(await createTestDb())).get("/health/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ready", checks: { db: "ok" } });
  });

  it("returns 503 when the db query fails", async () => {
    const res = await supertest(createApp(fakeDb(() => Promise.reject(new Error("down"))))).get(
      "/health/ready"
    );
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: "not_ready", checks: { db: "error" } });
  });

  it("returns 503 when the db hangs, after the timeout", async () => {
    const res = await supertest(createApp(fakeDb(() => new Promise(() => {})))).get(
      "/health/ready"
    );
    expect(res.status).toBe(503);
  });

  it("caches a success for 10s, then checks again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let up = true;
    const db = fakeDb(() => (up ? Promise.resolve() : Promise.reject(new Error("down"))));
    const request = supertest(createApp(db));

    expect((await request.get("/health/ready")).status).toBe(200);
    up = false;
    expect((await request.get("/health/ready")).status).toBe(200); // cached
    expect(db.execute).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + 10_001);
    expect((await request.get("/health/ready")).status).toBe(503);
  });

  it("never caches a failure", async () => {
    let up = false;
    const request = supertest(
      createApp(fakeDb(() => (up ? Promise.resolve() : Promise.reject(new Error("down")))))
    );
    expect((await request.get("/health/ready")).status).toBe(503);
    up = true;
    expect((await request.get("/health/ready")).status).toBe(200);
  });
});
