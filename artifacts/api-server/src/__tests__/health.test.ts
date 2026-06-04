import { describe, it, expect, beforeAll } from "vitest";
import supertest from "supertest";
import { createApp } from "../app.js";
import { createTestDb } from "../test-helpers/create-test-db.js";

describe("GET /health", () => {
  let request: ReturnType<typeof supertest>;

  beforeAll(() => {
    request = supertest(createApp(createTestDb()));
  });

  it("returns 200", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
  });

  it("returns { status: 'ok' } with a timestamp", async () => {
    const res = await request.get("/health");
    expect(res.body.status).toBe("ok");
    expect(typeof res.body.ts).toBe("string");
    expect(new Date(res.body.ts).getTime()).not.toBeNaN();
  });
});
