import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

// Load .env from the repo root, then the package dir. Variables already set win.
for (const path of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

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
  /** Deployed git commit; set by Railway. */
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
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
  /** Deployed git commit, or null when not running on Railway. */
  get COMMIT_SHA() {
    return read("RAILWAY_GIT_COMMIT_SHA") ?? null;
  },
};
