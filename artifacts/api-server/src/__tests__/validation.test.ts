import express from "express";
import supertest from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { sendValidated } from "../lib/send-validated.js";
import { validate } from "../middleware/validate.js";

const Row = z.object({ id: z.string(), createdAt: z.iso.datetime() });

function appWith(handler: express.RequestHandler) {
  const app = express();
  app.use(express.json());
  app.post("/items/:id", handler);
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(500).json({ error: err.message })
  );
  return supertest(app);
}

describe("validate()", () => {
  const handler = [
    validate({
      params: z.object({ id: z.uuid() }),
      query: z.object({ limit: z.coerce.number().int().max(10) }),
      body: z.object({ name: z.string().min(1) }),
    }),
    (req: express.Request, res: express.Response) =>
      res.json({ params: req.params, query: req.query, body: req.body }),
  ] as unknown as express.RequestHandler;

  it("passes parsed, coerced values to the handler", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    const app = express();
    app.use(express.json());
    app.post("/items/:id", handler);
    const res = await supertest(app).post(`/items/${id}?limit=5`).send({ name: "A", extra: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ params: { id }, query: { limit: 5 }, body: { name: "A" } });
  });

  it("collects errors from params, query and body into one 400", async () => {
    const app = express();
    app.use(express.json());
    app.post("/items/:id", handler);
    const res = await supertest(app).post("/items/not-a-uuid?limit=50").send({ name: "" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fieldErrors).sort()).toEqual(["id", "limit", "name"]);
    expect(res.body.error.formErrors).toEqual([]);
  });
});

describe("sendValidated()", () => {
  it("strips fields the response schema doesn't declare", async () => {
    const res = await appWith((_req, res) =>
      sendValidated(res, Row, { id: "a", createdAt: new Date(0), passwordHash: "secret" })
    ).post("/items/a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: "a", createdAt: "1970-01-01T00:00:00.000Z" });
  });

  it("refuses to send a response that breaks the spec (500)", async () => {
    const res = await appWith((_req, res) => sendValidated(res, Row, { id: 1 })).post("/items/a");
    expect(res.status).toBe(500);
  });

  it("uses the given status", async () => {
    const res = await appWith((_req, res) =>
      sendValidated(res, Row, { id: "a", createdAt: new Date(0) }, 201)
    ).post("/items/a");
    expect(res.status).toBe(201);
  });
});
