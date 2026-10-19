import { createClerkClient } from "@clerk/backend";
import { clerkSetup } from "@clerk/testing/playwright";
import { clerkKeys, E2E_USERS } from "./clerk-env";

/** Fetches a Clerk testing token (lets tests past bot protection) and makes sure the test users exist. */
export default async function globalSetup() {
  const keys = clerkKeys();
  if (!keys) {
    if (process.env.CI) {
      throw new Error("CI needs CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY secrets for E2E");
    }
    console.warn("E2E: no Clerk keys in .env, so the signed-in tests will be skipped");
    return;
  }
  await clerkSetup(keys);
  const clerk = createClerkClient({ secretKey: keys.secretKey });
  for (const email of Object.values(E2E_USERS)) {
    const { data } = await clerk.users.getUserList({ emailAddress: [email] });
    if (data.length === 0) {
      await clerk.users.createUser({ emailAddress: [email], skipPasswordRequirement: true });
    }
  }
}
