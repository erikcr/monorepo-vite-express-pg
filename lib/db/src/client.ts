import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const sql = postgres(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
export const closeDb = () => sql.end();

export type Db = typeof db;
