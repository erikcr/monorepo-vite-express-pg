import { env } from "@repo/env";
import { logger } from "../logger.js";

// Email through Resend's API, sent only by the send-email job (src/jobs/registry.ts): routes
// enqueue it, so a request never waits on Resend and a failed send is retried. Without
// RESEND_API_KEY, emails are logged instead of sent.

export interface Email {
  to: string | string[];
  /** One line: line breaks and runs of whitespace are collapsed (Resend refuses a line break). */
  subject: string;
  /** The plain-text version. Every email has one. */
  text: string;
  /** The HTML version, built with the `html` tag below so what it inserts is escaped. */
  html?: string;
  /**
   * Labels Resend returns with the email's delivery events (POST /api/webhooks/resend), e.g.
   * `{ kind: "invite" }`. Values may only hold letters, digits, `_` and `-`; others become `_`.
   */
  tags?: Record<string, string>;
}

/** The tag every email carries: the environment that sent it (see the Resend webhook). */
export const ENVIRONMENT_TAG = "environment";

/** This environment's value of ENVIRONMENT_TAG. */
export const environmentTagValue = () => tagSafe(env.DEPLOY_ENVIRONMENT);

const RESEND_URL = "https://api.resend.com/emails";

/** A send Resend refused, or couldn't take. The job fails with it, so pg-boss retries. */
export class EmailError extends Error {
  override name = "EmailError";
}

/**
 * Sends one email; returns Resend's id for it (null when only logged). Throws EmailError when
 * Resend doesn't accept it. `idempotencyKey` makes a retry of the same send a no-op at Resend
 * for 24 hours, so a job retried after a send that did go through doesn't send twice.
 */
export async function sendEmail(
  email: Email,
  { idempotencyKey }: { idempotencyKey?: string } = {}
): Promise<string | null> {
  const subject = oneLine(email.subject);
  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    // Locally, the whole email (its links included); deployed, never more than the subject.
    const shown = env.NODE_ENV === "production" ? { subject } : { ...email, subject };
    logger.warn({ email: shown }, "email not sent: RESEND_API_KEY is not set");
    return null;
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: email.to,
      subject,
      text: email.text,
      html: email.html,
      tags: Object.entries({ ...email.tags, [ENVIRONMENT_TAG]: environmentTagValue() }).map(
        ([name, value]) => ({ name, value: tagSafe(value) })
      ),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    message?: string;
  };
  if (!res.ok) {
    // Resend's error name and message say what's wrong (e.g. an unverified domain); never the address.
    throw new EmailError(
      `Resend refused the email (${res.status} ${body.name ?? "unknown"}): ${body.message ?? ""}`
    );
  }
  return body.id ?? null;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
function tagSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256);
}

/** HTML built by the `html` tag: inserted as is when nested in another. */
export class SafeHtml {
  constructor(private readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function insert(value: unknown): string {
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(insert).join("");
  if (value === null || value === undefined || value === false) return "";
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c] as string);
}

/**
 * Builds an email's HTML, escaping every inserted value: names, messages, and links too (a bare
 * `&` between a link's query parameters is invalid HTML, and some mail clients cut the link
 * there). Nest `html` results and arrays of them; pass `String(result)` as Email.html.
 *
 *   html`<p>Hi ${name},</p><a href="${url}">Open</a>`
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  return new SafeHtml(strings.reduce((out, s, i) => out + insert(values[i - 1]) + s));
}

/**
 * One tag's value from a Resend webhook event. Tags are sent as `[{ name, value }]`, but events
 * return them as `{ name: value }`: accept both.
 */
export function tagValue(tags: unknown, name: string): string | undefined {
  const value = Array.isArray(tags)
    ? tags.find((t) => t?.name === name)?.value
    : tags && typeof tags === "object"
      ? (tags as Record<string, unknown>)[name]
      : undefined;
  return typeof value === "string" ? value : undefined;
}
