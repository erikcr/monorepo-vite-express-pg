import { describe, expect, it } from "vitest";
import { handleFromName } from "../lib/handles.js";
import { createTestDbAt } from "../test-helpers/create-test-db.js";

// Migrations that transform existing data, run against a database holding the old shape. (Every
// other test starts from an empty database, where a broken transformation can't show.)
describe("migrations on existing data", () => {
  it("0003 drops example rows from before orgs existed and makes org_id a reference", async () => {
    const { client, migrateRest } = await createTestDbAt("0002_conscious_spirit");
    await client.query(`INSERT INTO example (org_id, name) VALUES ('org_1', 'legacy row')`);

    await migrateRest();

    expect((await client.query("SELECT * FROM example")).rows).toEqual([]);
    await expect(
      client.query(
        `INSERT INTO example (org_id, name) VALUES ('00000000-0000-4000-8000-000000000000', 'x')`
      )
    ).rejects.toThrow(/foreign key/);
  });

  it("0006 gives every existing org a handle from its name, as the API would", async () => {
    const { client, migrateRest } = await createTestDbAt("0005_outstanding_bulldozer");
    const names = [
      "Acme, Inc.",
      "acme inc",
      "ACME INC",
      "Settings",
      "AB",
      "!!!",
      "???",
      `  ${"Words ".repeat(8)}`,
    ];
    for (const [i, name] of names.entries())
      await client.query("INSERT INTO orgs (name, created_at) VALUES ($1, $2)", [
        name,
        new Date(Date.UTC(2026, 0, 1 + i)),
      ]);

    await migrateRest();

    const { rows } = await client.query<{ name: string; handle: string }>(
      "SELECT name, handle FROM orgs ORDER BY created_at"
    );
    expect(rows.map((r) => r.handle)).toEqual([
      "acme-inc",
      "acme-inc-2",
      "acme-inc-3",
      "settings-org",
      "ab-org",
      "org",
      "org-2",
      "words-words-words-words-words-words",
    ]);
    // The SQL and the API's handleFromName() agree on every name that isn't a repeat.
    for (const r of [rows[0], rows[3], rows[4], rows[5], rows[7]])
      expect(r?.handle).toBe(handleFromName(r?.name ?? ""));
  });
});
