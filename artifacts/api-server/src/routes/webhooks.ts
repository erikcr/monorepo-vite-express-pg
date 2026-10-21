import type { Db } from "@repo/db";
import { platformStaffTable, usersTable } from "@repo/db/schema";
import { env } from "@repo/env";
import { eq } from "drizzle-orm";
import { type Request, type Response, Router } from "express";
import { ENVIRONMENT_TAG, environmentTagValue, tagValue } from "../lib/email.js";
import { webhookRefusal } from "../lib/webhook-signature.js";
import { publicRoute } from "../middleware/access.js";

// Events from Resend and Clerk. Public routes, but each request must carry the provider's
// signature (src/lib/webhook-signature.ts), checked against the raw body: createApp() parses
// /api/webhooks bodies as bytes, not JSON. A 2xx tells the provider to stop retrying, so an event
// we ignore still gets 200, and only a failure to handle one gets a 5xx.

interface WebhookEvent {
  type?: unknown;
  data?: Record<string, unknown>;
}

/** The verified, parsed event; or null after answering. */
function verifiedEvent(
  req: Request,
  res: Response,
  secret: string | undefined
): WebhookEvent | null {
  const body: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (secret) {
    const refusal = webhookRefusal(secret, req.headers, body);
    if (refusal) {
      req.log.warn({ refusal }, "webhook refused");
      res.status(401).json({ error: refusal });
      return null;
    }
  }
  try {
    const event = JSON.parse(body.toString("utf8")) as WebhookEvent;
    if (typeof event?.type === "string" && event.data && typeof event.data === "object")
      return event;
  } catch {}
  res.status(400).json({ error: "Invalid webhook payload" });
  return null;
}

/** Resend's events that mean an email didn't reach its recipient, or they don't want it. */
const DELIVERY_PROBLEMS = new Set([
  "email.bounced",
  "email.complained",
  "email.failed",
  "email.delivery_delayed",
]);

export function createWebhooksRouter(db: Db): Router {
  const router = Router();

  /**
   * Delivery events of the emails we send. Unsigned events are accepted outside production
   * (for trying it locally); production refuses them until RESEND_WEBHOOK_SECRET is set.
   */
  router.post("/resend", publicRoute, (req, res) => {
    const secret = env.RESEND_WEBHOOK_SECRET;
    if (!secret && env.NODE_ENV === "production") {
      req.log.error("RESEND_WEBHOOK_SECRET is not set: refusing an unsigned webhook");
      res.status(503).json({ error: "Webhook signing is not configured" });
      return;
    }
    const event = verifiedEvent(req, res, secret);
    if (!event) return;

    // Resend sends every event in the account to every webhook in it, so environments sharing
    // an account each receive the others' events. Each email names the environment that sent it;
    // one without the tag wasn't sent by this API.
    if (tagValue(event.data?.tags, ENVIRONMENT_TAG) !== environmentTagValue()) {
      res.json({ received: true, ignored: "another environment's email" });
      return;
    }

    if (DELIVERY_PROBLEMS.has(event.type as string)) {
      // Never the address: the email's id finds it in Resend. Act on these here if the product
      // needs to (e.g. stop emailing an address that bounced for good); Resend itself stops
      // sending to addresses that hard-bounced or complained.
      req.log.warn(
        {
          type: event.type,
          emailId: event.data?.email_id,
          tags: event.data?.tags,
          bounce: (event.data?.bounce as { type?: unknown } | undefined)?.type,
        },
        "email not delivered"
      );
    }
    res.json({ received: true });
  });

  /**
   * Account events from Clerk. They change access, so every one is refused until
   * CLERK_WEBHOOK_SECRET is set, in every environment.
   */
  router.post("/clerk", publicRoute, async (req, res) => {
    const secret = env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      req.log.error("CLERK_WEBHOOK_SECRET is not set: refusing a webhook");
      res.status(503).json({ error: "Webhook signing is not configured" });
      return;
    }
    const event = verifiedEvent(req, res, secret);
    if (!event) return;

    const clerkUserId = event.data?.id;
    if (event.type === "user.deleted" && typeof clerkUserId === "string") {
      await forgetAccount(db, clerkUserId);
      req.log.info({ clerkUserId }, "Clerk account deleted: user and access removed");
    }
    res.json({ received: true });
  });

  return router;
}

/**
 * A deleted Clerk account: its user row goes, and with it every org grant (`org_users` cascades).
 * A staff grant stays as a record, disabled and unlinked, so `pnpm staff:grant` can give the same
 * email access again through a new account. Tables that reference users decide what happens to
 * their rows with their foreign key's `onDelete`; one without it makes this fail (a 500 Clerk
 * retries), and the log says which constraint.
 */
async function forgetAccount(db: Db, clerkUserId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(usersTable).where(eq(usersTable.clerkUserId, clerkUserId));
    await tx
      .update(platformStaffTable)
      .set({ status: "disabled", clerkUserId: null })
      .where(eq(platformStaffTable.clerkUserId, clerkUserId));
  });
}
