import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@repo/db";
import * as schema from "@repo/db/schema";
import { drizzle } from "drizzle-orm/pglite";

export async function createTestDb(): Promise<Db> {
  const client = new PGlite();

  await client.exec(`
    CREATE TABLE "example" (
      "id"         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      "org_id"     TEXT        NOT NULL,
      "name"       TEXT        NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  return drizzle(client, { schema }) as unknown as Db;
}
