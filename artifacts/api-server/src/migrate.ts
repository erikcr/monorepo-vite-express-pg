import "./validate-env.js";
import { connectForMigrations } from "@repo/db/client";
import { migrate } from "drizzle-orm/postgres-js/migrator";

const { db, close } = connectForMigrations();
await migrate(db, { migrationsFolder: "./migrations" });
console.log("Migrations complete");
await close();
