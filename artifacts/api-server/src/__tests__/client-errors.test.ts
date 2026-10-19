import supertest from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { logger } from "../logger.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

describe("POST /api/client-errors", () => {
  it("logs the report without the page's query string and answers 204", async () => {
    const lines: unknown[] = [];
    // pino-http logs through a child of the app logger; capture what reaches it.
    const write = vi.spyOn(logger, "child").mockImplementation(function (this: typeof logger) {
      const child = Object.create(this);
      child.error = (obj: unknown) => lines.push(obj);
      child.info = () => {};
      child.warn = () => {};
      return child;
    });
    const res = await supertest(createApp(await createTestDb(), createFakeQueue()))
      .post("/api/client-errors")
      .send({
        app: "web",
        message: "Cannot read properties of undefined",
        stack: "TypeError: …",
        url: "https://app.example/orders?token=secret#frag",
      });
    write.mockRestore();
    expect(res.status).toBe(204);
    expect(lines).toContainEqual({
      clientError: {
        app: "web",
        message: "Cannot read properties of undefined",
        stack: "TypeError: …",
        url: "https://app.example/orders",
      },
    });
  });

  it("rejects reports that are missing fields or too large", async () => {
    const request = supertest(createApp(await createTestDb(), createFakeQueue()));
    expect((await request.post("/api/client-errors").send({ app: "web" })).status).toBe(400);
    expect(
      (await request.post("/api/client-errors").send({ app: "web", message: "x".repeat(2001) }))
        .status
    ).toBe(400);
    expect(
      (await request.post("/api/client-errors").send({ app: "other", message: "boom" })).status
    ).toBe(400);
  });
});
