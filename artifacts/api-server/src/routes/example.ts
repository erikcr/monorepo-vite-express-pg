import {
  CreateExampleBody,
  CreateExampleResponse,
  GetExampleParams,
  GetExampleResponse,
  ListExamplesQueryParams,
  ListExamplesResponse,
  UpdateExampleBody,
  UpdateExampleResponse,
} from "@repo/api-zod";
import type { Db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import type { JobQueue } from "../jobs/queue.js";
import { exampleCreated } from "../jobs/registry.js";
import { decodeCursor, toPage } from "../lib/pagination.js";
import { sendValidated } from "../lib/send-validated.js";
import type { Access } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

const byId = validate({ params: GetExampleParams });
const notFound = (res: Response) => res.status(404).json({ error: "Not found" });

// The org comes from requireOrg (req.ctx), never from the request. Single records match both id
// and org, so another org's record is indistinguishable from a missing one (404).
const orgId = (req: Pick<Request, "ctx">) => {
  if (!req.ctx) throw new Error("requireOrg must run before this handler");
  return req.ctx.org.id;
};
const inOrg = (req: Pick<Request, "ctx">, id: string) =>
  and(eq(exampleTable.id, id), eq(exampleTable.orgId, orgId(req)));

export function createExampleRouter(db: Db, queue: JobQueue, access: Access): Router {
  const router = Router();
  const read = access.requireOrg("example.read");
  const write = access.requireOrg("example.write");

  router.get("/", read, validate({ query: ListExamplesQueryParams }), async (req, res) => {
    const { limit, cursor } = req.query;
    const after = cursor ? decodeCursor(cursor) : null;
    if (cursor && !after) {
      res
        .status(400)
        .json({ error: { fieldErrors: { cursor: ["Invalid cursor"] }, formErrors: [] } });
      return;
    }
    const rows = await db
      .select()
      .from(exampleTable)
      .where(
        and(
          eq(exampleTable.orgId, orgId(req)),
          after
            ? or(
                lt(exampleTable.createdAt, after.createdAt),
                and(eq(exampleTable.createdAt, after.createdAt), lt(exampleTable.id, after.id))
              )
            : undefined
        )
      )
      .orderBy(desc(exampleTable.createdAt), desc(exampleTable.id))
      .limit(limit + 1);
    sendValidated(res, ListExamplesResponse, toPage(rows, limit));
  });

  router.post("/", write, validate({ body: CreateExampleBody }), async (req, res) => {
    const [row] = await db
      .insert(exampleTable)
      .values({ ...req.body, orgId: orgId(req) })
      .returning();
    if (!row) throw new Error("insert returned no row"); // can't happen; narrows the type
    await queue.enqueue(exampleCreated, { exampleId: row.id, orgId: row.orgId });
    sendValidated(res, CreateExampleResponse, row, 201);
  });

  router.get("/:id", read, byId, async (req, res) => {
    const [row] = await db.select().from(exampleTable).where(inOrg(req, req.params.id));
    if (!row) return void notFound(res);
    sendValidated(res, GetExampleResponse, row);
  });

  router.patch("/:id", write, byId, validate({ body: UpdateExampleBody }), async (req, res) => {
    const [row] = await db
      .update(exampleTable)
      .set({ ...req.body, updatedAt: new Date() })
      .where(inOrg(req, req.params.id))
      .returning();
    if (!row) return void notFound(res);
    sendValidated(res, UpdateExampleResponse, row);
  });

  router.delete("/:id", write, byId, async (req, res) => {
    const [row] = await db
      .delete(exampleTable)
      .where(inOrg(req, req.params.id))
      .returning({ id: exampleTable.id });
    if (!row) return void notFound(res);
    res.status(204).end();
  });

  return router;
}
