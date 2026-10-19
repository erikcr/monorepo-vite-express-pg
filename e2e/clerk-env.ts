import { existsSync } from "node:fs";
import { resolve } from "node:path";

// E2E signs in through a real Clerk development instance (Clerk's testing tokens). Its keys come
// from the repo-root .env locally and from GitHub Actions secrets in CI.
const rootEnv = resolve(import.meta.dirname, "../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/** The Clerk instance's keys, or null when they aren't configured. */
export function clerkKeys(): { secretKey: string; publishableKey: string } | null {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!secretKey || !publishableKey) return null;
  // Guard: never run E2E (which creates users) against a production instance.
  if (!secretKey.startsWith("sk_test_") || !publishableKey.startsWith("pk_test_")) {
    throw new Error("E2E needs a Clerk *development* instance (sk_test_/pk_test_ keys)");
  }
  return { secretKey, publishableKey };
}

/**
 * Test users, created in the Clerk instance by global-setup.ts. "+clerk_test" marks them as test
 * accounts in Clerk development instances (no real email is ever sent).
 */
export const E2E_USERS = {
  member: "e2e-member+clerk_test@example.com",
  staff: "e2e-staff+clerk_test@example.com",
} as const;
