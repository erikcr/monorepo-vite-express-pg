import { expect, test } from "@playwright/test";

test("web app loads without JS errors", async ({ page }) => {
  // Stub API so the test is frontend-only and doesn't need a running server
  await page.route("/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", ts: new Date().toISOString() }),
    })
  );
  await page.route("/api/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) })
  );

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
