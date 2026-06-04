import { db } from "@repo/db";
import { exampleTable } from "@repo/db/schema";

console.log("seeding database…");

await db.insert(exampleTable).values([
  { orgId: "org_1", name: "First example" },
  { orgId: "org_1", name: "Second example" },
  { orgId: "org_2", name: "Third example" },
]);

console.log("seed complete");
process.exit(0);
