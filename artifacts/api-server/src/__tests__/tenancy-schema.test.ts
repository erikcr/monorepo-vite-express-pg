import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../test-helpers/create-test-db.js";

// Tables that aren't owned by one org. Every other table is org data: it has org_id uuid NOT NULL
// referencing orgs, so a row can't exist without an org and leaves with it. Adding a table here
// is a decision to review, like a route marked public.
const GLOBAL_TABLES = ["orgs", "platform_staff", "users"];

describe("tenancy schema", () => {
  it("every table but the global ones has org_id uuid NOT NULL referencing orgs", async () => {
    const client = new PGlite();
    await createTestDb(client);
    const { rows } = await client.query<{ table: string; orgId: string | null }>(`
      SELECT c.relname AS table,
        CASE WHEN a.attname IS NULL THEN NULL
          ELSE format_type(a.atttypid, a.atttypmod)
            || CASE WHEN a.attnotnull THEN ' not null' ELSE ' nullable' END
            || CASE WHEN EXISTS (
              SELECT 1 FROM pg_constraint k
              WHERE k.conrelid = c.oid AND k.contype = 'f'
                AND k.confrelid = 'public.orgs'::regclass AND k.conkey = ARRAY[a.attnum]
            ) THEN ' references orgs' ELSE '' END
        END AS "orgId"
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'org_id' AND NOT a.attisdropped
      WHERE c.relkind = 'r'
    `);
    const orgTables = rows.filter((r) => !GLOBAL_TABLES.includes(r.table));
    expect(orgTables.length).toBeGreaterThan(0);
    expect(Object.fromEntries(orgTables.map((r) => [r.table, r.orgId]))).toEqual(
      Object.fromEntries(orgTables.map((r) => [r.table, "uuid not null references orgs"]))
    );
  });
});
