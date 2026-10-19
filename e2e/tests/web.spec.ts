import { expect, test } from "@playwright/test";

test("shows the real API and database as healthy", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // The E2E build uses a placeholder Clerk key (see playwright.config.ts), so Clerk itself fails
    // to load; that's expected until auth task 6. Every other error still fails the test.
    const fromPlaceholderClerk =
      msg.location().url.includes("clerk.accounts.dev") || msg.text().includes("ClerkJS");
    if (msg.type() === "error" && !fromPlaceholderClerk) errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByRole("img", { name: "API server: ok" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Database: ok" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("navigates client-side, deep-links, and shows a 404 page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();

  await page.goto("/about"); // a direct load, not client-side navigation
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
