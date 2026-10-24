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

  test("creates an org, adds records, and switches between orgs, each at its address", async ({
    page,
  }) => {
    await signIn(page, E2E_USERS.member);
    // The E2E database is fresh on every run, so the member starts with no org.
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Create your organization" })).toBeVisible();
    await page.getByLabel("Name").fill("Alpha Co");
    // The handle follows the name, and is checked as it's typed.
    await expect(page.getByLabel("Handle")).toHaveValue("alpha-co");
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/o\/alpha-co$/);
    await expect(page.getByRole("heading", { name: "Alpha Co" })).toBeVisible();

    await page.getByLabel("Record name").fill("First record");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("First record")).toBeVisible();
    await expectAccessible(page);

    // A second org: its records are separate, and the picker switches between them.
    await page.getByRole("button", { name: "New organization" }).click();
    await page.getByLabel("Name").fill("Beta Co");
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/o\/beta-co$/);
    await expect(page.getByText("No records yet.")).toBeVisible();

    await page.getByLabel("Organization").selectOption({ label: "Alpha Co" });
    await expect(page).toHaveURL(/\/o\/alpha-co$/);
    await expect(page.getByText("First record")).toBeVisible();

    // The address restores the org on a reload.
    await page.reload();
    await expect(page.getByText("First record")).toBeVisible();

    // Two tabs, one on each org: after a refresh, each still reads and writes its own.
    const beta = await page.context().newPage();
    await beta.goto("/o/beta-co");
    await page.reload();
    await beta.reload();
    await beta.getByLabel("Record name").fill("Beta record");
    await beta.getByRole("button", { name: "Add" }).click();
    await expect(beta.getByText("Beta record")).toBeVisible();
    await page.getByLabel("Record name").fill("Second record");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Second record")).toBeVisible();
    await page.reload();
    await beta.reload();
    await expect(page.getByText("Second record")).toBeVisible();
    await expect(page.getByText("First record")).toBeVisible();
    await expect(page.getByText("Beta record")).toHaveCount(0);
    await expect(beta.getByText("Beta record")).toBeVisible();
    await expect(beta.getByText("First record")).toHaveCount(0);
    await beta.close();

    // An org that doesn't exist (or isn't theirs) says so, without switching to another.
    await page.goto("/o/no-such-org");
    await expect(
      page.getByRole("heading", { name: "Not found, or you don't have access" })
    ).toBeVisible();
    await expectAccessible(page);
    await page.goto("/o/alpha-co");

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
    await expect(page).toHaveURL(/\/o\/beta-co$/);
    await expect(page.getByRole("heading", { name: "Beta Co" })).toBeVisible();
    await expect(page.getByText("Beta record")).toBeVisible();

    // A section's address opens it directly, for the org it names.
    await page.goto("/o/beta-co?settings=organization");
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
    await page.getByLabel("Name").fill("Gamma Co");
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create" }).click();
    await page.getByRole("link", { name: "Members" }).click();
    await expect(page).toHaveURL(/\/o\/gamma-co\?settings=members$/);
    await expect(page.getByText("Who belongs to Gamma Co, and who's invited")).toBeVisible();
    await expect(page.getByText("No pending invitations.")).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Email address").fill(E2E_USERS.invitee);
    await page.getByRole("button", { name: "Invite" }).click();
    await expect(page.getByText(/Member · Expires/)).toBeVisible();
    await expect(page.getByRole("status")).toHaveText(`Invitation sent to ${E2E_USERS.invitee}`);
    await expectAccessible(page); // the confirmation's contrast, in both modes

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
    await expect(invitee).toHaveURL(/\/o\/gamma-co$/);
    await expect(invitee.getByRole("heading", { name: "Gamma Co" })).toBeVisible();
    await inviteeContext.close();

    // The settings section's address, reloaded, opens it again over the same org.
    await page.reload();
    await expect(page.getByText("Who belongs to Gamma Co, and who's invited")).toBeVisible();
    await expect(page.getByText(E2E_USERS.invitee)).toBeVisible();
    await expect(page.getByText("No pending invitations.")).toBeVisible();

    // Back, or leaving the site, asks before dropping an invitation typed but not sent.
    await page.getByLabel("Email address").fill("someone@example.com");
    const discard = page.getByRole("alertdialog", { name: "Discard unsaved changes?" });
    await page.goBack();
    await expect(discard).toBeVisible();
    await page.getByRole("button", { name: "Keep editing" }).click();
    await expect(discard).toBeHidden();
    await expect(page).toHaveURL(/\?settings=members$/);
    await expect(page.getByLabel("Email address")).toHaveValue("someone@example.com");

    const asked = new Promise<string>((resolve) =>
      page.once("dialog", (d) => {
        resolve(d.type());
        void d.dismiss(); // stay
      })
    );
    await page.close({ runBeforeUnload: true });
    expect(await asked).toBe("beforeunload");
    expect(page.isClosed()).toBe(false);

    await page.goBack();
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
    await expect(page).toHaveURL(/\/o\/gamma-co$/);
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
    // Clerk's own menus open over the dialog and work there; their Escape closes only the menu.
    await settings.getByRole("button", { name: "Open menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    // A trial click checks it could be clicked (nothing covers it, it isn't inert) without removing the email.
    await menu.getByRole("menuitem", { name: "Remove email" }).click({ trial: true });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(settings).toBeVisible();
    // Clerk moves between its own pages without leaving the section or the page behind.
    await settings.getByRole("button", { name: "Security" }).click();
    await expect(settings.getByText(/Active devices/)).toBeVisible();
    await expect(page).toHaveURL(/\/about\?settings=profile/);
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await expect(page.getByRole("heading", { name: "About" })).toBeVisible();
  });
});
