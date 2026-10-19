import { Writable } from "node:stream";
import type { Db } from "@repo/db";
import pino from "pino";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { requestLogOptions } from "../middleware/request-logger.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

const uuid = /^[0-9a-f-]{36}$/;

describe("request ids", () => {
  it("returns a fresh x-request-id on every response", async () => {
    const res = await supertest(createApp(await createTestDb(), createFakeQueue())).get("/health");
    expect(res.headers["x-request-id"]).toMatch(uuid);
  });

  it("echoes a plain inbound x-request-id and replaces a malformed one", async () => {
    const request = supertest(createApp(await createTestDb(), createFakeQueue()));
    const kept = await request.get("/health").set("x-request-id", "edge-abc.123");
    expect(kept.headers["x-request-id"]).toBe("edge-abc.123");
    for (const bad of ["has spaces <script>", "x".repeat(129)]) {
      const replaced = await request.get("/health").set("x-request-id", bad);
      expect(replaced.headers["x-request-id"]).toMatch(uuid);
    }
  });
});

describe("unhandled errors", () => {
  it("answer 500 with a generic message and the request id, never the error's details", async () => {
    const db = {
      select: () => {
        throw new Error('relation "secret_table" does not exist');
      },
    } as unknown as Db;
    const res = await supertest(createApp(db, createFakeQueue())).get(
      "/api/example/123e4567-e89b-42d3-a456-426614174000?orgId=org_1"
    );
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: "Internal server error",
      requestId: res.headers["x-request-id"],
    });
    expect(JSON.stringify(res.body)).not.toContain("secret_table");
  });

  it("keep the message for client errors such as malformed JSON", async () => {
    const res = await supertest(createApp(await createTestDb(), createFakeQueue()))
      .post("/api/example")
      .set("content-type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
  });
});

describe("request log lines", () => {
  it("drop query strings from the url and redact auth headers", () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const log = pino(
      { redact: requestLogOptions.redact, serializers: requestLogOptions.serializers },
      sink
    );
    log.info({
      req: {
        id: "r1",
        method: "GET",
        url: "/api/example?orgId=org_1&token=abc",
        headers: {
          authorization: "Bearer secret",
          cookie: "session=secret",
          referer: "https://app.example/orders?token=secret#x",
          accept: "*/*",
        },
      },
    });
    const entry = JSON.parse(lines[0] ?? "{}");
    expect(entry.req.url).toBe("/api/example");
    expect(entry.req.headers.authorization).toBe("[redacted]");
    expect(entry.req.headers.cookie).toBe("[redacted]");
    expect(entry.req.headers.referer).toBe("https://app.example/orders");
    expect(entry.req.headers.accept).toBe("*/*");
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("token=abc");
  });
});
