import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@repo/env";
import * as schema from "./schema.js";

const sql = postgres(env.DATABASE_URL);
export const db = drizzle(sql, { schema });
