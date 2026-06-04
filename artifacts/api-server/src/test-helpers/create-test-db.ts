import { newDb } from "pg-mem";
import { drizzle } from "drizzle-orm/node-postgres";
import { randomUUID } from "node:crypto";
import type { Db } from "@repo/db";
import * as schema from "@repo/db/schema";

export function createTestDb(): Db {
  const mem = newDb();

  // pg-mem doesn't include gen_random_uuid by default — register it
  mem.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid" as never,
    implementation: randomUUID,
    impure: true,
  });

  mem.public.none(`
    CREATE TABLE "example" (
      "id"         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      "org_id"     TEXT        NOT NULL,
      "name"       TEXT        NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { Pool } = mem.adapters.createPg();
  return drizzle(new Pool(), { schema }) as unknown as Db;
}
