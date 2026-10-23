import { E2E_USERS } from "../clerk-env";
import { API, WEB } from "../playwright.config";
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

    // Settings open from the account menu, over the page. The only admin can't leave; they
    // delete the org instead, and land in the other one. (In this test rather than its own:
    // tests share the member account, and run in parallel.)
    await page.locator(".cl-userButtonTrigger").click();
    await page.getByRole("group", { name: "Account actions" }).getByText("Settings").click();
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings.getByRole("region", { name: "Organization" })).toBeVisible();
    await expectAccessible(page);
    await settings.getByRole("button", { name: "Leave Alpha Co" }).click();
    await expect(settings.getByText(/Make someone else an org admin/)).toBeVisible();
    await settings.getByLabel("Type Alpha Co to confirm").fill("Alpha Co");
    await settings.getByRole("button", { name: "Delete organization" }).click();
    await expect(settings).toBeHidden();
    await expect(page.getByRole("heading", { name: "Beta Co" })).toBeVisible();
    await expect(page.getByText("No records yet.")).toBeVisible();

    // A section's address opens it directly.
    await page.goto("/app?settings=organization");
    await settings.getByLabel("Type Beta Co to confirm").fill("Beta Co");
    await settings.getByRole("button", { name: "Delete organization" }).click();
    await expect(page.getByRole("heading", { name: "Create your organization" })).toBeVisible();
  });

  test("invites someone by email, who joins through the link", async ({
    page,
    browser,
    request,
  }) => {
    await signIn(page, E2E_USERS.inviter);
    await page.goto("/app");
    await page.getByLabel("Organization name").fill("Gamma Co");
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("link", { name: "Members" }).click();
    await expect(page.getByText("Who belongs to Gamma Co, and who's invited")).toBeVisible();
    await expect(page.getByText("No pending invitations.")).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Email address").fill(E2E_USERS.invitee);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText(/Member · Expires/)).toBeVisible();

    // The email the API sent (through the E2E server's stand-in for Resend), and its link.
    const latestEmail = async () =>
      (await request.get(`${API}/__e2e/emails`, { params: { to: E2E_USERS.invitee } })).json();
    await expect.poll(latestEmail).not.toBeNull();
    const email = await latestEmail();
    expect(email.subject).toBe("Join Gamma Co");
    const link = /(https?:\/\/\S+\/invite#\S+)/.exec(email.text)?.[1];
    expect(link?.startsWith(`${WEB}/invite#`)).toBe(true);

    // The invitee, in their own browser session.
    const inviteeContext = await browser.newContext({ baseURL: WEB });
    const invitee = await inviteeContext.newPage();
    await signIn(invitee, E2E_USERS.invitee);
    await invitee.goto(link as string);
    await expect(invitee.getByRole("button", { name: "Accept invitation" })).toBeVisible();
    await expectAccessible(invitee);
    await invitee.getByRole("button", { name: "Accept invitation" }).click();
    await expect(invitee.getByRole("heading", { name: "Gamma Co" })).toBeVisible();
    await inviteeContext.close();

    await page.reload();
    await expect(page.getByText(E2E_USERS.invitee)).toBeVisible();
    await expect(page.getByText("No pending invitations.")).toBeVisible();
  });

  test("keeps the person's own profile in settings, with Clerk's pages inside", async ({
    page,
  }) => {
    await signIn(page, E2E_USERS.member);
    await page.goto("/about?settings=profile");
    const settings = page.getByRole("dialog", { name: "Settings" });
    await expect(settings.getByText("Profile details")).toBeVisible();
    await expect(settings.getByText(E2E_USERS.member)).toBeVisible();
    await expectAccessible(page);
    // Clerk moves between its own pages without leaving the section or the page behind.
    await settings.getByRole("button", { name: "Security" }).click();
    await expect(settings.getByText(/Active devices/)).toBeVisible();
    await expect(page).toHaveURL(/\/about\?settings=profile/);
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});
