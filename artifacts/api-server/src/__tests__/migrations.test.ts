import { describe, expect, it } from "vitest";
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
});
