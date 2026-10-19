import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load .env from the repo root, then the package dir. Variables already set win.
for (const path of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(path)) process.loadEnvFile(path);
}

function require(key: string): string {
  const val = process.env[key];
  if (!val)
    throw new Error(
      `Missing required env var: ${key}. Copy .env.example to .env at the repo root (cp .env.example .env) and adjust as needed.`
    );
  return val;
}

export const env = {
  get DATABASE_URL() {
    return require("DATABASE_URL");
  },
  get PORT() {
    return process.env.PORT ?? "3000";
  },
  get NODE_ENV() {
    return process.env.NODE_ENV ?? "development";
  },
  /** Deployed git commit; Railway sets RAILWAY_GIT_COMMIT_SHA. Null locally. */
  get COMMIT_SHA() {
    return process.env.RAILWAY_GIT_COMMIT_SHA ?? null;
  },
  get CORS_ORIGIN() {
    return process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:3001";
  },
};
