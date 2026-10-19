import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createMember } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

const app = async () => createApp(await createTestDb(), createFakeQueue());

// A signed-in member and an app sharing their database, for routes behind requireOrg.
async function memberApp() {
  const db = await createTestDb();
  const member = await createMember(db);
  return { request: supertest(createApp(db, createFakeQueue())), headers: member.headers };
}

describe("security headers", () => {
  it("sets helmet's headers and hides x-powered-by", async () => {
    const res = await supertest(await app()).get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off under tests by default", async () => {
    const { request, headers } = await memberApp();
    for (let i = 0; i < 5; i++) {
      expect((await request.get("/api/example").set(headers)).status).toBe(200);
    }
  });

  it("answers 429 past the limit, per client IP, and never limits health probes", async () => {
    vi.stubEnv("RATE_LIMIT_MAX", "2");
    const { request, headers } = await memberApp();
    const from = (ip: string) =>
      request.get("/api/example").set(headers).set("x-forwarded-for", ip);

    expect((await from("203.0.113.1")).status).toBe(200);
    expect((await from("203.0.113.1")).status).toBe(200);
    const limited = await from("203.0.113.1");
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: "Too many requests" });
    expect(limited.headers.ratelimit).toBeDefined();

    expect((await from("203.0.113.2")).status).toBe(200); // a different client
    for (let i = 0; i < 4; i++) expect((await request.get("/health")).status).toBe(200);
  });
});

describe("request body limit", () => {
  it("rejects JSON bodies over 100kb with 413", async () => {
    const { request, headers } = await memberApp();
    const res = await request
      .post("/api/example")
      .set(headers)
      .send({ name: "x".repeat(110_000) });
    expect(res.status).toBe(413);
  });
});
