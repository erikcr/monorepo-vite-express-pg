import { closeDb, db } from "@repo/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";

await migrate(db, { migrationsFolder: "./migrations" });
console.log("Migrations complete");
await closeDb();
