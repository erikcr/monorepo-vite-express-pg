import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

function connect(connection: Partial<postgres.ConnectionParameters> = {}) {
  const sql = postgres(env.DATABASE_URL, { connection });
  return { db: drizzle(sql, { schema }), close: () => sql.end() };
}

// The API, its jobs and scripts. A statement running longer than 30s is cancelled, so a runaway
// query can't hold one of the pool's connections (or its locks) indefinitely. Work that needs
// longer raises the limit inside its own transaction: `SET LOCAL statement_timeout = '5min'`.
const client = connect({ statement_timeout: 30_000 });
export const db = client.db;
export const closeDb = client.close;

/** Migrations' own client, without the timeout: they may legitimately run long (e.g. an index). */
export const connectForMigrations = () => connect();

export type Db = typeof db;
