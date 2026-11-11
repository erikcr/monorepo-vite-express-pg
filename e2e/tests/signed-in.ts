import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page, test } from "@playwright/test";
import { clerkKeys } from "../clerk-env";

/** Skips the calling test when no Clerk instance is configured (local runs; CI requires one). */
export function requireClerk() {
  test.skip(!clerkKeys(), "needs CLERK_SECRET_KEY and VITE_CLERK_PUBLISHABLE_KEY in .env");
}

/** Signs `email` in through the real Clerk instance, on the app `page` belongs to. */
export async function signIn(page: Page, email: string) {
  await setupClerkTestingToken({ page });
  await page.goto("/");
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
}

/**
 * Opens `url` signed out, which should send the visitor to sign in, and signs `email` in there.
 * Then reloads: Clerk's sign-in page sends someone already signed in wherever a finished sign-in
 * would, so the page ends up where signing in through the form leads.
 */
export async function signInFrom(page: Page, url: string, email: string) {
  await setupClerkTestingToken({ page });
  await page.goto(url);
  await expect(page).toHaveURL(/\/sign-in/);
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: email });
  await page.reload();
}

/** The signed-in session's token, for calling the API directly (test data setup). */
export const sessionToken = (page: Page) =>
  page.evaluate(() => window.Clerk.session?.getToken() ?? Promise.resolve(null));
