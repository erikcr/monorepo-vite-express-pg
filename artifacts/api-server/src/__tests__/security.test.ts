import supertest from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

const app = async () => createApp(await createTestDb(), createFakeQueue());

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
    const request = supertest(await app());
    for (let i = 0; i < 5; i++) {
      expect((await request.get("/api/example?orgId=org_1")).status).toBe(200);
    }
  });

  it("answers 429 past the limit, per client IP, and never limits health probes", async () => {
    vi.stubEnv("RATE_LIMIT_MAX", "2");
    const request = supertest(await app());
    const from = (ip: string) => request.get("/api/example?orgId=org_1").set("x-forwarded-for", ip);

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
    const res = await supertest(await app())
      .post("/api/example")
      .send({ orgId: "org_1", name: "x".repeat(110_000) });
    expect(res.status).toBe(413);
  });
});
