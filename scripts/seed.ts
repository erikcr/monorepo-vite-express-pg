import { closeDb, db } from "@repo/db";
import { exampleTable, orgsTable } from "@repo/db/schema";
import { inArray } from "drizzle-orm";

// Fixed ids, so re-running the seed updates the same two orgs instead of adding more.
const SEED_ORGS = [
  { id: "00000000-0000-4000-8000-000000000001", name: "Seed Org One" },
  { id: "00000000-0000-4000-8000-000000000002", name: "Seed Org Two" },
] as const;

// No top-level await: the root package is CJS, so tsx transforms this file as CJS.
async function main() {
  console.log("seeding database…");
  const [one, two] = SEED_ORGS;

  await db
    .insert(orgsTable)
    .values([...SEED_ORGS])
    .onConflictDoNothing();

  // Idempotent: replace the seed orgs' example rows on every run.
  await db.delete(exampleTable).where(inArray(exampleTable.orgId, [one.id, two.id]));
  await db.insert(exampleTable).values([
    { orgId: one.id, name: "First example" },
    { orgId: one.id, name: "Second example" },
    { orgId: two.id, name: "Third example" },
  ]);

  console.log(`seed complete: orgs ${SEED_ORGS.map((o) => `${o.name} (${o.id})`).join(", ")}`);
  // Nobody belongs to these orgs yet.
  console.log(`to see them, sign in once, then: pnpm org:grant <your email> ${one.id} org_admin`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
