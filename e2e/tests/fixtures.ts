import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";

/**
 * Every E2E test imports `test` and `expect` from here. On top of Playwright's, `test` fails any
 * test whose pages break the Content-Security-Policy (lib/csp): the sites run as production
 * builds, so a blocked script or request shows up here before it does in production.
 */
export const test = base.extend<{ cspGuard: undefined }>({
  cspGuard: [
    async ({ page }, use) => {
      const violations: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && msg.text().includes("Content Security Policy")) {
          violations.push(msg.text());
        }
      });
      await use(undefined);
      expect(violations, "Content-Security-Policy violations").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Fails on WCAG 2.1 A/AA problems axe can detect on the page as it is now (missing labels and
 * names, contrast, roles), in light and dark mode. Call it once a page has rendered its content.
 * Clerk's own components are left out: they're Clerk's to fix.
 */
export async function expectAccessible(page: Page) {
  const found: string[] = [];
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude(".cl-rootBox")
      .exclude(".cl-userButtonBox")
      .analyze();
    // One line per element, with axe's reason (for contrast: the two colours and the ratio).
    for (const v of violations) {
      for (const n of v.nodes) {
        found.push(`${colorScheme} ${v.id}: ${n.target.join(" ")}: ${n.any[0]?.message ?? v.help}`);
      }
    }
  }
  await page.emulateMedia({ colorScheme: null });
  expect(found, `accessibility problems on ${page.url()}`).toEqual([]);
}
