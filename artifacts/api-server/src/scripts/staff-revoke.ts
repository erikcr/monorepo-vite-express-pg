// pnpm staff:revoke <email>
// Production: railway ssh --service api -- node dist/scripts/staff-revoke.js <email>
import "../validate-env.js";
import { closeDb, db } from "@repo/db";
import { revokeStaff } from "../lib/grants.js";

const [email] = process.argv.slice(2);
if (!email) {
  console.error("usage: staff:revoke <email>");
  process.exit(2);
}
console.log(
  (await revokeStaff(db, email))
    ? `staff access disabled for ${email}`
    : `no staff grant for ${email}`
);
await closeDb();
