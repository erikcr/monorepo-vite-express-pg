import { expect, test } from "@playwright/test";

test("web app loads without JS errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveTitle(/App/);

  const nonFaviconErrors = errors.filter((e) => !e.includes("favicon"));
  expect(nonFaviconErrors).toHaveLength(0);
});
