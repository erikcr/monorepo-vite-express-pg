import { closeDb, db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";
import { inArray } from "drizzle-orm";

// No top-level await: the root package is CJS, so tsx transforms this file as CJS.
async function main() {
  console.log("seeding database…");

  // Idempotent: clear previous seed rows (by seed orgs) before inserting,
  // so repeated runs don't accumulate duplicates.
  const seedOrgs = ["org_1", "org_2"];
  await db.delete(exampleTable).where(inArray(exampleTable.orgId, seedOrgs));

  await db.insert(exampleTable).values([
    { orgId: "org_1", name: "First example" },
    { orgId: "org_1", name: "Second example" },
    { orgId: "org_2", name: "Third example" },
  ]);

  console.log("seed complete");
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
