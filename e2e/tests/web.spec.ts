import { E2E_USERS } from "../clerk-env";
import { expect, expectAccessible, test } from "./fixtures";
import { requireClerk, signIn } from "./signed-in";

test("shows the real API and database as healthy", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    // Without Clerk keys (local runs) the build uses a placeholder key (see playwright.config.ts),
    // so Clerk itself fails to load. Every other error still fails the test.
    const fromPlaceholderClerk =
      msg.location().url.includes("clerk.accounts.dev") || msg.text().includes("ClerkJS");
    if (msg.type() === "error" && !fromPlaceholderClerk) errors.push(msg.text());
  });

  await page.goto("/");
  await expect(page.getByRole("img", { name: "API server: ok" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Database: ok" })).toBeVisible();
  expect(errors).toEqual([]);
  await expectAccessible(page);
});

test("navigates client-side, deep-links, and shows a 404 page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "About" }).click();
  await expect(page).toHaveURL(/\/about$/);
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  await expectAccessible(page);

  await page.goto("/about"); // a direct load, not client-side navigation
  await expect(page.getByRole("heading", { name: "About" })).toBeVisible();

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectAccessible(page);
});

test.describe("signed in", () => {
  test.beforeEach(() => requireClerk());

  test("creates an org, adds records, and switches between orgs", async ({ page }) => {
    await signIn(page, E2E_USERS.member);
    // The E2E database is fresh on every run, so the member starts with no org.
    await page.goto("/app");
    await expect(page.getByLabel("Organization name")).toBeVisible();
    await expectAccessible(page);
    await page.getByLabel("Organization name").fill("Alpha Co");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("heading", { name: "Alpha Co" })).toBeVisible();

    await page.getByLabel("Record name").fill("First record");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("First record")).toBeVisible();
    await expectAccessible(page);

    // A second org: its records are separate, and the picker switches between them.
    await page.getByRole("button", { name: "New organization" }).click();
    await page.getByLabel("Organization name").fill("Beta Co");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByLabel("Organization")).toHaveValue(/.+/);
    await expect(page.getByText("No records yet.")).toBeVisible();

    await page.getByLabel("Organization").selectOption({ label: "Alpha Co" });
    await expect(page.getByText("First record")).toBeVisible();

    // The selection survives a reload.
    await page.reload();
    await expect(page.getByText("First record")).toBeVisible();

    // The only admin can't leave; they delete the org instead, and land in the other one. (In
    // this test rather than its own: tests share the member account, and run in parallel.)
    await page.getByRole("button", { name: "Leave Alpha Co" }).click();
    await expect(page.getByText(/Make someone else an org admin/)).toBeVisible();
    await page.getByLabel("Type Alpha Co to confirm").fill("Alpha Co");
    await page.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByRole("heading", { name: "Beta Co" })).toBeVisible();
    await expect(page.getByText("No records yet.")).toBeVisible();

    await page.getByLabel("Type Beta Co to confirm").fill("Beta Co");
    await page.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByRole("heading", { name: "Create your organization" })).toBeVisible();
  });
});
