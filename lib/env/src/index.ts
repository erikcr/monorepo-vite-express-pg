import { resolve } from "node:path";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

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
  get CORS_ORIGIN() {
    return process.env.CORS_ORIGIN ?? "http://localhost:5173,http://localhost:3001";
  },
};
