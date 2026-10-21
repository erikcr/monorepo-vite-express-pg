import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

/**
 * Loads .env from the repo root, then the package dir (`cwd`), into process.env. Variables already
 * set win, so a deployed environment's own variables are never overridden by a stray file.
 */
export function loadEnvFiles(cwd = process.cwd()): void {
  for (const path of [resolve(cwd, "../../.env"), resolve(cwd, ".env")]) {
    if (existsSync(path)) process.loadEnvFile(path);
  }
}
loadEnvFiles();

const flag = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

const list = z.string().transform((s) =>
  s
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
);

// Every server-side variable, in one place. Add new ones here (and to .env.example).
const fields = {
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Run the job worker inside the API process. Set "false" to run dist/worker.js separately. */
  RUN_WORKER: flag("true"),
  /** Comma-separated browser origins allowed to call the API (see the CORS_ORIGIN getter). */
  CORS_ORIGIN: list.optional(),
  /** Rate limit per client IP: at most RATE_LIMIT_MAX requests per RATE_LIMIT_WINDOW_MS. */
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  /** 0 disables the limiter. Unset: 300, or 0 under tests (see the getter). */
  RATE_LIMIT_MAX: z.coerce.number().int().min(0).optional(),
  /** Serve the API reference at /docs. Unset: on, except in production. */
  API_DOCS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  /** Clerk secret key (sk_test_… / sk_live_…). Without it no session verifies (every request is 401). */
  CLERK_SECRET_KEY: z.string().startsWith("sk_").optional(),
  /**
   * Require a completed second factor for staff (admin API). Unset: required, except under
   * NODE_ENV=development/test. Set "false" only where your Clerk plan lacks MFA, and never in production.
   */
  STAFF_MFA_REQUIRED: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  /** Sentry project DSN. Unset: errors are only logged (see src/lib/error-tracker.ts). */
  SENTRY_DSN: z.url().optional(),
  /** Resend API key (re_…). Unset: emails are logged instead of sent (see src/lib/email.ts). */
  RESEND_API_KEY: z.string().startsWith("re_").optional(),
  /** Sender of every email, on a domain verified in Resend: `App <hello@example.com>`. */
  EMAIL_FROM: z.string().min(1).optional(),
  /** Signing secret (whsec_…) of the Resend webhook. Required in production for it to accept events. */
  RESEND_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  /** Signing secret (whsec_…) of the Clerk webhook. Unset: the webhook refuses every event. */
  CLERK_WEBHOOK_SECRET: z.string().startsWith("whsec_").optional(),
  /** Deployed git commit; set by Railway. */
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
  /** Railway environment ("production", "staging"); set by Railway. */
  RAILWAY_ENVIRONMENT_NAME: z.string().optional(),
};

type Fields = typeof fields;
export type ServerEnv = { [K in keyof Fields]: z.output<Fields[K]> };

const missingHint =
  "Copy .env.example to .env at the repo root (cp .env.example .env) and adjust as needed.";

function read<K extends keyof Fields>(key: K): ServerEnv[K] {
  const result = fields[key].safeParse(process.env[key]);
  if (result.success) return result.data as ServerEnv[K];
  if (process.env[key] === undefined) {
    throw new Error(`Missing required env var: ${key}. ${missingHint}`);
  }
  throw new Error(`Invalid env var ${key}: ${result.error.issues[0]?.message}`);
}

/**
 * Checks every variable at once and throws one error listing all problems. Entry points call it
 * before anything else runs (see artifacts/api-server/src/validate-env.ts).
 */
export function validateServerEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const problems: string[] = [];
  const parsed = z.object(fields).safeParse(source);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      problems.push(`${key}: ${source[key] === undefined ? "missing" : issue.message}`);
    }
  }
  if (problems.length > 0) {
    throw new Error(
      `Invalid environment:\n${problems.map((p) => `  - ${p}`).join("\n")}\n${missingHint}`
    );
  }
  return parsed.data as ServerEnv;
}

/** Typed, lazily read server env: each access parses that one variable. */
export const env = {
  get DATABASE_URL() {
    return read("DATABASE_URL");
  },
  get PORT() {
    return read("PORT");
  },
  get NODE_ENV() {
    return read("NODE_ENV");
  },
  get RUN_WORKER() {
    return read("RUN_WORKER");
  },
  /**
   * Allowed browser origins. Unset: the local Vite dev servers, but none in production (it is set
   * per environment once the site URLs exist, and the API warns at startup until then).
   */
  get CORS_ORIGIN() {
    const origins = read("CORS_ORIGIN");
    if (origins) return origins;
    return read("NODE_ENV") === "production"
      ? []
      : ["http://localhost:5173", "http://localhost:3001"];
  },
  get RATE_LIMIT_WINDOW_MS() {
    return read("RATE_LIMIT_WINDOW_MS");
  },
  get RATE_LIMIT_MAX() {
    return read("RATE_LIMIT_MAX") ?? (read("NODE_ENV") === "test" ? 0 : 300);
  },
  get API_DOCS() {
    return read("API_DOCS") ?? read("NODE_ENV") !== "production";
  },
  get CLERK_SECRET_KEY() {
    return read("CLERK_SECRET_KEY");
  },
  get STAFF_MFA_REQUIRED() {
    return read("STAFF_MFA_REQUIRED") ?? read("NODE_ENV") === "production";
  },
  get SENTRY_DSN() {
    return read("SENTRY_DSN");
  },
  get RESEND_API_KEY() {
    return read("RESEND_API_KEY");
  },
  /** Unset: Resend's shared test sender, which only delivers to the Resend account's own address. */
  get EMAIL_FROM() {
    return read("EMAIL_FROM") ?? "onboarding@resend.dev";
  },
  get RESEND_WEBHOOK_SECRET() {
    return read("RESEND_WEBHOOK_SECRET");
  },
  get CLERK_WEBHOOK_SECRET() {
    return read("CLERK_WEBHOOK_SECRET");
  },
  /** Where this runs: the Railway environment's name, or NODE_ENV off Railway. */
  get DEPLOY_ENVIRONMENT() {
    return read("RAILWAY_ENVIRONMENT_NAME") ?? read("NODE_ENV");
  },
  /** Deployed git commit, or null when not running on Railway. */
  get COMMIT_SHA() {
    return read("RAILWAY_GIT_COMMIT_SHA") ?? null;
  },
};
