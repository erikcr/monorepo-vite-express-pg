import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import type { Db } from "@repo/db";
import * as schema from "@repo/db/schema";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const migrationsFolder = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../lib/db/migrations"
);

export async function createTestDb(client = new PGlite()): Promise<Db> {
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return db as unknown as Db;
}

/**
 * A database migrated only up to `tag` (e.g. "0002_conscious_spirit"), for testing a migration
 * against data in the old shape: insert rows with `client.query()` (the current schema doesn't
 * match yet), then `migrateRest()` and assert what became of them.
 */
export async function createTestDbAt(tag: string) {
  const journal = JSON.parse(readFileSync(join(migrationsFolder, "meta/_journal.json"), "utf8"));
  const entries: { tag: string }[] = journal.entries;
  const last = entries.findIndex((e) => e.tag === tag);
  if (last === -1) throw new Error(`No migration named ${tag}`);

  // The migrator reads only the journal and the SQL files, so a folder with the first few is enough.
  const folder = mkdtempSync(join(tmpdir(), "migrations-"));
  mkdirSync(join(folder, "meta"));
  const applied = entries.slice(0, last + 1);
  writeFileSync(
    join(folder, "meta/_journal.json"),
    JSON.stringify({ ...journal, entries: applied })
  );
  for (const e of applied)
    copyFileSync(join(migrationsFolder, `${e.tag}.sql`), join(folder, `${e.tag}.sql`));

  const client = new PGlite();
  const db = drizzle(client, { schema });
  try {
    await migrate(db, { migrationsFolder: folder });
  } finally {
    rmSync(folder, { recursive: true });
  }
  return { client, db: db as unknown as Db, migrateRest: () => migrate(db, { migrationsFolder }) };
}
