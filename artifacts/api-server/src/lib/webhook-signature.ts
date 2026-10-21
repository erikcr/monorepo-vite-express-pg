import { createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";

// Resend and Clerk sign their webhooks the same way (Svix): an HMAC-SHA256 of
// `<svix-id>.<svix-timestamp>.<raw body>`, keyed with the base64 part of the `whsec_` secret. The
// signature header holds one or more space-separated `v1,<base64>` entries (more during a secret
// rotation). The timestamp must be recent, so a captured request can't be replayed later.

const TOLERANCE_SECONDS = 5 * 60;

/** Why a webhook request isn't genuinely from the provider, or null if it is. */
export function webhookRefusal(
  secret: string,
  headers: IncomingHttpHeaders,
  body: Buffer,
  now = Date.now()
): string | null {
  const id = headers["svix-id"];
  const timestamp = headers["svix-timestamp"];
  const signatures = headers["svix-signature"];
  if (typeof id !== "string" || typeof timestamp !== "string" || typeof signatures !== "string") {
    return "Missing signature headers";
  }
  const sentAt = Number(timestamp);
  if (!Number.isInteger(sentAt) || Math.abs(now / 1000 - sentAt) > TOLERANCE_SECONDS) {
    return "Timestamp too old or invalid";
  }
  const expected = signWebhook(secret, id, timestamp, body);
  const valid = signatures.split(" ").some((entry) => {
    const [version, signature] = entry.split(",");
    if (version !== "v1" || !signature) return false;
    const given = Buffer.from(signature, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  return valid ? null : "Invalid signature";
}

/** The signature a provider sends for `body` (also how tests sign their requests). */
export function signWebhook(secret: string, id: string, timestamp: string, body: Buffer): Buffer {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.`).update(body).digest();
}
