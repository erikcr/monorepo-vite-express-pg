import { randomUUID } from "node:crypto";
import type { Db } from "@repo/db";
import * as schema from "@repo/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { newDb } from "pg-mem";

export function createTestDb(): Db {
  const mem = newDb();

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

  // pg-mem doesn't support two features that drizzle-orm/node-postgres uses:
  //   1. rowMode:'array'  — drizzle requests rows as positional arrays
  //   2. query.types.getTypeParser — drizzle passes custom type parsers for RETURNING
  // Patch both on the prototype so all Pool instances work.
  const proto = Pool.prototype as Record<string, unknown>;

  const originalAdaptQuery = proto.adaptQuery as (
    q: Record<string, unknown>,
    v: unknown
  ) => Record<string, unknown>;
  proto.adaptQuery = function (query: Record<string, unknown>, values: unknown) {
    // Strip custom type parsers so pg-mem doesn't throw on parameterized queries
    const q = query?.types ? { ...query, types: undefined } : query;
    return originalAdaptQuery.call(this, q, values);
  };

  const originalAdaptResults = proto.adaptResults as (
    query: { rowMode?: string },
    res: { rows: Record<string, unknown>[]; fields: { name: string }[] }
  ) => unknown;
  proto.adaptResults = function (
    query: { rowMode?: string },
    res: { rows: Record<string, unknown>[]; fields: { name: string }[] }
  ) {
    if (query?.rowMode === "array") {
      const names = res.fields.map((f) => f.name);
      return {
        rows: res.rows.map((row) => names.map((n) => row[n])),
        fields: res.fields,
        rowCount: res.rows.length,
      };
    }
    return originalAdaptResults.call(this, query, res);
  };

  return drizzle(new Pool(), { schema }) as unknown as Db;
}
