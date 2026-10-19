import { expect, test } from "@playwright/test";
import { API } from "../playwright.config";

// Each test uses its own org, so tests stay independent on the shared E2E database.
// The two data tests wait for auth tasks 5-6 (template plan 1.1): the API now requires a
// signed-in session, which the admin app and these tests don't send yet.
test.fixme("lists records created through the real API, filtered by the org in the URL", async ({
  page,
  request,
}) => {
  for (const name of ["Alpha", "Bravo"]) {
    const res = await request.post(`${API}/api/example`, { data: { orgId: "e2e_list", name } });
    expect(res.status()).toBe(201);
  }
  await request.post(`${API}/api/example`, { data: { orgId: "e2e_other", name: "Hidden" } });

  await page.goto("/?orgId=e2e_list");
  await expect(page.getByRole("cell", { name: "Alpha" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Bravo" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hidden" })).toHaveCount(0);

  await page.getByLabel("Org filter").fill("e2e_other");
  await expect(page).toHaveURL(/orgId=e2e_other/);
  await expect(page.getByRole("cell", { name: "Hidden" })).toBeVisible();
});

test.fixme("pages through a long list with Load more", async ({ page, request }) => {
  for (let i = 1; i <= 23; i++) {
    await request.post(`${API}/api/example`, { data: { orgId: "e2e_pages", name: `row ${i}` } });
  }
  await page.goto("/?orgId=e2e_pages");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button", { name: "Load more" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(23);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
});

test("deep-links to settings and shows a 404 page", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
});
