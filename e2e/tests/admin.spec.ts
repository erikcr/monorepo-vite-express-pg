import { E2E_USERS } from "../clerk-env";
import { API } from "../playwright.config";
import { expect, expectAccessible, test } from "./fixtures";
import { requireClerk, sessionToken, signIn } from "./signed-in";

test("shows the 404 page for an unknown path", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expectAccessible(page);
});

test.describe("signed in", () => {
  test.beforeEach(() => requireClerk());

  test("staff see every org, searchable from the URL", async ({ page, request }) => {
    await signIn(page, E2E_USERS.staff);
    // Create two orgs through the API (anyone signed in may), named for this run.
    const token = await sessionToken(page);
    const run = Date.now().toString(36);
    for (const name of [`Needle ${run}`, `Haystack ${run}`]) {
      const res = await request.post(`${API}/api/orgs`, {
        headers: { authorization: `Bearer ${token}` },
        data: { name },
      });
      expect(res.status()).toBe(201);
    }

    await page.goto(`/?q=${encodeURIComponent(`Needle ${run}`)}`);
    await expect(page.getByRole("cell", { name: `Needle ${run}` })).toBeVisible();
    await expect(page.getByRole("cell", { name: `Haystack ${run}` })).toHaveCount(0);
    await expectAccessible(page);

    await page.getByLabel("Search organizations").fill(`Haystack ${run}`);
    await expect(page).toHaveURL(/q=Haystack/);
    await expect(page.getByRole("cell", { name: `Haystack ${run}` })).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await expectAccessible(page);
  });

  test("refuses a signed-in account without staff access", async ({ page }) => {
    await signIn(page, E2E_USERS.member);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Staff access required" })).toBeVisible();
    await expectAccessible(page);
  });
});
