import { env } from "@repo/env";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Dedicated single-connection client so we can explicitly close it after migrating.
// The shared @repo/db/client keeps its pool open for the server lifetime — we can't
// use it here because the pre-deploy process must exit cleanly.
const sql = postgres(env.DATABASE_URL, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "./migrations" });
console.log("Migrations complete");
await sql.end();
