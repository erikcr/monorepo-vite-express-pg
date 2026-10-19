// pnpm staff:grant <email> <staff_admin|staff_support>
// Production: railway ssh --service api -- node dist/scripts/staff-grant.js <email> <role>
import "../validate-env.js";
import { closeDb, db } from "@repo/db";
import { grantStaff } from "../lib/grants.js";

const [email, role] = process.argv.slice(2);
if (!email || !role) {
  console.error("usage: staff:grant <email> <staff_admin|staff_support>");
  process.exit(2);
}
const result = await grantStaff(db, email, role);
console.log(
  `staff access ${result} for ${email} (${role}); it links to their account on first sign-in`
);
await closeDb();
