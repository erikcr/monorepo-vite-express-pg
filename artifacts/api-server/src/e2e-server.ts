// Backend for the full-stack E2E tests (e2e/): the real app and job worker on an in-process
// Postgres (PGlite), migrated from the real migration files. Fresh, empty data on every start.
import { PGlite } from "@electric-sql/pglite";
import { env } from "@repo/env";
import express from "express";
import { createApp } from "./app.js";
import { createJobQueue } from "./jobs/queue.js";
import { startWorker } from "./jobs/worker.js";
import { grantStaff } from "./lib/grants.js";
import { logger } from "./logger.js";
import { createTestBoss } from "./test-helpers/create-test-boss.js";
import { createTestDb } from "./test-helpers/create-test-db.js";

// Resend, stood in for: the API's real email code runs up to the network, and each email it
// would send is kept here, so a test can follow the link in it (GET /__e2e/emails below).
const sent: { to: string[]; subject: string; text: string }[] = [];
process.env.RESEND_API_KEY = "re_e2e_stand_in";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) === "https://api.resend.com/emails") {
    const email = JSON.parse(String(init?.body));
    sent.push({ to: [email.to].flat(), subject: email.subject, text: email.text });
    return Response.json({ id: `e2e_${sent.length}` });
  }
  return realFetch(input, init);
};

const client = new PGlite();
const db = await createTestDb(client);
const boss = await createTestBoss(client);
await startWorker(boss, db);

// `--staff <email>`: grant that email staff access in this run's (fresh) database.
const staffFlag = process.argv.indexOf("--staff");
const staffEmail = staffFlag === -1 ? undefined : process.argv[staffFlag + 1];
if (staffEmail) await grantStaff(db, staffEmail, "staff_admin");

const app = express();
// The latest email to ?to=<address>, or null. Only this E2E server has it.
app.get("/__e2e/emails", (req, res) => {
  res.json(sent.filter((email) => email.to.includes(String(req.query.to))).at(-1) ?? null);
});
app.use(createApp(db, createJobQueue(boss)));
app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "e2e api-server started");
});
