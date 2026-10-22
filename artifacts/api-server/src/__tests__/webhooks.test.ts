import type { Db } from "@repo/db";
import { orgUsersTable, platformStaffTable, usersTable } from "@repo/db/schema";
import { eq } from "drizzle-orm";
import supertest from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { signWebhook, webhookRefusal } from "../lib/webhook-signature.js";
import { logger } from "../logger.js";
import { createMember, grantStaff } from "../test-helpers/auth.js";
import { createTestDb } from "../test-helpers/create-test-db.js";
import { createFakeQueue } from "../test-helpers/fake-queue.js";

const SECRET = `whsec_${Buffer.from("a test signing secret").toString("base64")}`;

/** Headers a provider sends with `body`, signed with `secret` at `sentAt` (seconds). */
function signed(body: string, secret = SECRET, sentAt = Math.floor(Date.now() / 1000)) {
  const id = "msg_1";
  const signature = signWebhook(secret, id, String(sentAt), Buffer.from(body)).toString("base64");
  return {
    "content-type": "application/json",
    "svix-id": id,
    "svix-timestamp": String(sentAt),
    "svix-signature": `v1,${signature}`,
  };
}

/** The pino-http request logger's warnings, captured. */
function captureRequestWarnings(): unknown[][] {
  const lines: unknown[][] = [];
  vi.spyOn(logger, "child").mockImplementation(function (this: typeof logger) {
    const child = Object.create(this);
    child.warn = (...args: unknown[]) => lines.push(args);
    child.info = () => {};
    child.error = () => {};
    return child;
  });
  return lines;
}

let db: Db;
let request: ReturnType<typeof supertest>;

beforeEach(async () => {
  db = await createTestDb();
  request = supertest(createApp(db, createFakeQueue()));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("webhook signatures", () => {
  const body = Buffer.from('{"type":"x","data":{}}');
  const headers = (over: Record<string, string> = {}) => ({ ...signed(body.toString()), ...over });

  it("accepts the provider's signature, also among others during a secret rotation", () => {
    expect(webhookRefusal(SECRET, headers(), body)).toBeNull();
    const rotated = headers({ "svix-signature": `v1,b3RoZXI= ${headers()["svix-signature"]}` });
    expect(webhookRefusal(SECRET, rotated, body)).toBeNull();
  });

  it("refuses a missing, wrong or stale signature, or a changed body", () => {
    expect(webhookRefusal(SECRET, {}, body)).toBe("Missing signature headers");
    expect(
      webhookRefusal(`whsec_${Buffer.from("other").toString("base64")}`, headers(), body)
    ).toBe("Invalid signature");
    expect(webhookRefusal(SECRET, headers(), Buffer.from('{"type":"y","data":{}}'))).toBe(
      "Invalid signature"
    );
    expect(
      webhookRefusal(
        SECRET,
        headers({ "svix-signature": headers()["svix-signature"].replace("v1,", "v2,") }),
        body
      )
    ).toBe("Invalid signature");
    const sixMinutesLater = Date.now() + 6 * 60 * 1000;
    expect(webhookRefusal(SECRET, headers(), body, sixMinutesLater)).toBe(
      "Timestamp too old or invalid"
    );
    expect(webhookRefusal(SECRET, headers({ "svix-timestamp": "soon" }), body)).toBe(
      "Timestamp too old or invalid"
    );
  });
});

describe("POST /api/webhooks/resend", () => {
  const event = (tags: unknown, type = "email.bounced") =>
    JSON.stringify({
      type,
      data: { email_id: "em_1", to: ["ann@x.test"], tags, bounce: { type: "Permanent" } },
    });

  it("logs a delivery problem of this environment's email, without the address", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const warnings = captureRequestWarnings();
    const body = event({ environment: "test", kind: "invite" });
    const res = await request.post("/api/webhooks/resend").set(signed(body)).send(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
    expect(warnings).toEqual([
      [
        {
          type: "email.bounced",
          emailId: "em_1",
          tags: { environment: "test", kind: "invite" },
          bounce: "Permanent",
        },
        "email not delivered",
      ],
    ]);
    expect(JSON.stringify(warnings)).not.toContain("ann@x.test");
  });

  it("ignores another environment's email, or one this API didn't send, with a 200", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const warnings = captureRequestWarnings();
    for (const tags of [[{ name: "environment", value: "staging" }], undefined]) {
      const body = event(tags);
      const res = await request.post("/api/webhooks/resend").set(signed(body)).send(body);
      expect(res.body).toEqual({ received: true, ignored: "another environment's email" });
    }
    expect(warnings).toEqual([]);
  });

  it("acknowledges delivered emails without logging them", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const warnings = captureRequestWarnings();
    const body = event({ environment: "test" }, "email.delivered");
    const res = await request.post("/api/webhooks/resend").set(signed(body)).send(body);
    expect(res.body).toEqual({ received: true });
    expect(warnings).toEqual([]);
  });

  it("refuses a bad signature with 401, and a payload that isn't an event with 400", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
    const body = event({ environment: "test" });
    const forged = await request
      .post("/api/webhooks/resend")
      .set(signed(body, `whsec_${Buffer.from("guess").toString("base64")}`))
      .send(body);
    expect(forged.status).toBe(401);
    expect(forged.body).toEqual({ error: "Invalid signature" });
    for (const bad of ["not json", '{"type":"email.sent"}']) {
      const res = await request.post("/api/webhooks/resend").set(signed(bad)).send(bad);
      expect(res.status).toBe(400);
    }
  });

  it("accepts unsigned events without a secret, except in production", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", undefined);
    const body = event({ environment: "test" }, "email.delivered");
    const local = await request
      .post("/api/webhooks/resend")
      .set("content-type", "application/json")
      .send(body);
    expect(local.status).toBe(200);
    vi.stubEnv("NODE_ENV", "production");
    vi.spyOn(logger, "child").mockReturnValue(Object.assign(Object.create(logger), { error() {} }));
    const production = await request
      .post("/api/webhooks/resend")
      .set("content-type", "application/json")
      .send(body);
    expect(production.status).toBe(503);
  });
});

describe("POST /api/webhooks/clerk", () => {
  const deleted = (id: string) =>
    JSON.stringify({ type: "user.deleted", data: { id, deleted: true } });

  it("removes a deleted account's user and org grants, and unlinks and disables its staff grant", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
    const ann = await createMember(db);
    const bob = await createMember(db, { orgs: ann.orgs });
    await grantStaff(db, ann.user.email);
    await db
      .update(platformStaffTable)
      .set({ clerkUserId: ann.user.clerkUserId })
      .where(eq(platformStaffTable.email, ann.user.email));

    const body = deleted(ann.user.clerkUserId);
    const res = await request.post("/api/webhooks/clerk").set(signed(body)).send(body);

    expect(res.status).toBe(200);
    expect(await db.select().from(usersTable)).toEqual([bob.user]);
    expect(await db.select({ userId: orgUsersTable.userId }).from(orgUsersTable)).toEqual([
      { userId: bob.user.id },
    ]);
    const [staff] = await db.select().from(platformStaffTable);
    expect(staff).toMatchObject({ email: ann.user.email, status: "disabled", clerkUserId: null });
  });

  describe("user.updated", () => {
    const updated = (id: string, primaryStatus: string) =>
      JSON.stringify({
        type: "user.updated",
        data: {
          id,
          first_name: "Ann",
          last_name: "Lee",
          primary_email_address_id: "idn_2",
          email_addresses: [
            { id: "idn_1", email_address: "old@x.test", verification: { status: "verified" } },
            { id: "idn_2", email_address: "new@x.test", verification: { status: primaryStatus } },
          ],
        },
      });
    const userRow = async (clerkUserId: string) =>
      (await db.select().from(usersTable).where(eq(usersTable.clerkUserId, clerkUserId)))[0];

    it("updates the account's name and its new primary email once it's verified", async () => {
      vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
      const ann = await createMember(db);
      const body = updated(ann.user.clerkUserId, "verified");
      const res = await request.post("/api/webhooks/clerk").set(signed(body)).send(body);
      expect(res.status).toBe(200);
      expect(await userRow(ann.user.clerkUserId)).toMatchObject({
        email: "new@x.test",
        name: "Ann Lee",
      });
    });

    it("keeps the last verified email while the new primary is unverified", async () => {
      vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
      const ann = await createMember(db);
      const body = updated(ann.user.clerkUserId, "unverified");
      await request.post("/api/webhooks/clerk").set(signed(body)).send(body);
      expect(await userRow(ann.user.clerkUserId)).toMatchObject({
        email: ann.user.email,
        name: "Ann Lee",
      });
    });

    it("ignores an account that hasn't signed in yet: its row is made on first sign-in", async () => {
      vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
      const body = updated("user_never_seen", "verified");
      const res = await request.post("/api/webhooks/clerk").set(signed(body)).send(body);
      expect(res.status).toBe(200);
      expect(await db.select().from(usersTable)).toEqual([]);
    });
  });

  it("acknowledges other events and changes nothing", async () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
    const ann = await createMember(db);
    const body = JSON.stringify({ type: "session.created", data: { id: "sess_1" } });
    const res = await request.post("/api/webhooks/clerk").set(signed(body)).send(body);
    expect(res.body).toEqual({ received: true });
    expect(await db.select().from(usersTable)).toEqual([ann.user]);
  });

  it("refuses everything until CLERK_WEBHOOK_SECRET is set, and a bad signature after", async () => {
    vi.spyOn(logger, "child").mockReturnValue(
      Object.assign(Object.create(logger), { error() {}, warn() {} })
    );
    const ann = await createMember(db);
    const body = deleted(ann.user.clerkUserId);
    vi.stubEnv("CLERK_WEBHOOK_SECRET", undefined);
    const unset = await request.post("/api/webhooks/clerk").set(signed(body)).send(body);
    expect(unset.status).toBe(503);
    vi.stubEnv("CLERK_WEBHOOK_SECRET", SECRET);
    const forged = await request
      .post("/api/webhooks/clerk")
      .set(signed(body, `whsec_${Buffer.from("guess").toString("base64")}`))
      .send(body);
    expect(forged.status).toBe(401);
    expect(await db.select().from(usersTable)).toEqual([ann.user]);
  });
});
