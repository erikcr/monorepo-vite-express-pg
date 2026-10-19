// pnpm org:grant <email> <org id> <org_admin|org_member>  (the person must have signed in once)
// Production: railway ssh --service api -- node dist/scripts/org-grant.js <email> <org id> <role>
import "../validate-env.js";
import { closeDb, db } from "@repo/db";
import { grantOrgMembership } from "../lib/grants.js";

const [email, orgId, role] = process.argv.slice(2);
if (!email || !orgId || !role) {
  console.error("usage: org:grant <email> <org id> <org_admin|org_member>");
  process.exit(2);
}
await grantOrgMembership(db, email, orgId, role);
console.log(`${email} is now ${role} in org ${orgId}`);
await closeDb();
