# Capabilities: build when needed

Patterns we know are useful, but only in the right context. None of them is built. Each entry says when it becomes worth building, what it looks like, and where to start.

Building one before its point arrives adds code, tests and UI that nobody uses yet, so don't. When a feature reaches one:
1. Say so in the plan.
2. Build it to the shape below.
3. Move the rule into the doc it belongs in (usually `UI.md`).
4. Remove the entry here.

Add an entry when a review or discussion turns up something worth having later.

## Interface

### Preferences that save as they change

- **Build it when:** the first preference that applies at once, under `UI.md`'s rule: a toggle, a select, or a text field saved when you leave it.
- **Shape:**
  - `useAutoSave()` runs the request and tracks its state: idle, saving, saved, or an error message.
  - `SaveStatus` shows that state on the row, in an `aria-live="polite"` region, as "Saving…", "Saved" or the error.
  - One per row, so each preference reports its own result. The section has no save button.
- **Start from:** Trust XP's `artifacts/platform/src/components/settings/auto-save.tsx`, about 50 lines.

### Search in settings

- **Build it when:** the settings dialog has about eight sections or more, or people ask where a setting is. Claude's settings have it.
- **Shape:**
  - A filter field at the top of the section list.
  - It matches each section's label and a few keywords per section, declared next to its nav item in `Settings.tsx`.
  - It narrows the list. Enter opens the first match.

### A side panel for a record's details ("peek")

- **Build it when:** people work down a list and open records one after another, and need the list in view while they do: triage, review queues, an inbox. Linear and Notion use this; Railway opens a service over its project canvas the same way.
  - A record people spend a while in, or link to, is still a page.
  - It's the panel layer in `UI.md`'s layers: content that sits beside the place rather than over it.
- **Shape:**
  - The address holds it, as settings do: `?record=<id>` on the list's route.
  - It's a panel on the right, not a modal. The list stays usable and highlights the open record, and the arrow keys or j/k move between records.
  - Escape or × closes it. On a phone it fills the screen.
  - A link from the panel opens the full page.

### A "…" menu on each row

- **Build it when:** a list's rows have two or more actions each, such as Change role, Resend and Remove. One action stays a plain button.
- **Shape:**
  - One "…" button per row, named for its row ("Actions for ann@…").
  - The menu is portalled, so a card's overflow can't clip it. Arrow keys move through it, and Escape returns focus to its button without closing the dialog it sits in.
  - A destructive item is last, and asks to confirm.
- **Start from:** Trust XP's `RowMenu` (`artifacts/platform/src/components/ui/`).

### One explicit save for a group of fields

- **Build it when:** a section has several fields that only make sense saved together, or that reach other people when saved: a schedule, an address, a billing contact.
- **Shape:**
  - A save bar at the bottom of the card. Save and Cancel appear only once something changed, and Cancel puts the saved values back.
  - It sends only the fields that changed, then shows a `Confirmation` or the error where the bar was.
  - It reports `useUnsavedChanges(dirty)`, so the dialog asks before dropping it.
- **Start from:** Trust XP's `SaveBar` (`artifacts/platform/src/components/settings/SaveBar.tsx`).

### A small dialog for a short creation form

- **Build it when:** creating something takes a field or two (a name, a type) from a page whose work goes on afterwards: "New project", "New client". The template's "New organization" already fits; today it swaps the whole page for its form.
- **Shape:**
  - A small, named `aria-modal` dialog opened from the page's button, closed with Escape and ×. A half-filled form asks before closing.
  - On success it goes to the new thing.
  - It needs a small `Dialog` primitive shared with confirmations, built the first time one is needed.
- **Not for:** creation with several steps, or one that needs the page behind it: that's a page.

### An attention queue on the home page

- **Build it when:** people look after many records of one kind (clients, projects, accounts) and their first question each day is which ones need them.
- **Shape:**
  - The home page's place leads with the records that trip a signal, each saying why ("Participation 31%", "No admin yet") with a way in. Below the queue is the full list. "All on track" shows when nothing trips.
  - One function computes the signals, shared with any staff view, so the two never disagree.
  - It computes them for every record in one pass, not one query per record, so thirty records are as fast as five.
- **Start from:** Trust XP's Plan 52 (the partner's portfolio) and the admin portal's org health.

### A hosted demo

- **Build it when:** someone needs to show the product to buyers without a real account, the same way every time.
- **Shape:**
  - A separate environment whose seed tells a story: each stage or persona is its own seeded org with its own test sign-in, and a switcher moves between them.
  - Nothing leaves it: no worker, no email key.
  - Actions that would change the story are simulated or disabled, and the API is read-only for visitors, so the next showing starts the same.
  - It's reseeded on a schedule, so relative dates don't age.
- **Start from:** Trust XP's `docs/reference/demo-environment.md` and Plan 49.

### Choosing where someone lands after signing in

- **Build it when:** there are different kinds of people, whose work starts in different places: consultants with a portfolio, members of one org, staff.
- **Shape:** one `homePath(me)` decides from what `/me` says they can reach. It's used by `/`, by sign-in's redirect, and wherever "no org" would otherwise send someone to onboarding. The last place used comes first, if they can still reach it. `/app` (`AppPage`) already does this for one kind of person (the last org, else the first, else the create form): `homePath` grows out of it.
- **Start from:** Trust XP's Plan 50 D1.

### Renaming an org's handle

- **Build it when:** orgs ask to change their address, usually after a rename or a typo at creation. Handles are fixed until then.
- **Shape:**
  - A field in Settings → Organization, checked as typed like the create form's (`GET /api/orgs/handle-available`), for org admins.
  - The old handle is kept as a redirect, in an `org_handle_redirects` table (`org_id` with cascade, the old handle unique), so links and bookmarks still work. Old handles count as taken.
  - `OrgLayout` follows a redirect with a `replace`, so Back doesn't return to the old address.
  - A public profile (below) redirects the same way.
- **Start from:** GitHub's rename, which redirects from the old name.

### A command palette (⌘K)

- **Build it when:** the app has enough pages, sections and actions that people hunt for them, usually ten or more destinations. Or when its users live in it all day and expect to drive it from the keyboard.
- **Shape:**
  - A dialog with one search field over a registry of commands: each page, each settings section (through `useOpenSettings` and `?settings=`), and frequent actions ("New record", "Switch org").
  - Each command has a label, keywords, an optional shortcut it shows, and what it runs.
  - Arrow keys and Enter, with recent commands first.
  - ⌘K / Ctrl+K opens it from anywhere. It must not take over shortcuts the app already uses, such as ⌘, for settings.

## Structure

These change the template's assumptions (`ARCHITECTURE.md`, "What the template assumes"). They're bigger than an interface pattern, so each one starts as a plan of its own.

### Public org profiles

- **Build it when:** an org needs a page people outside it can see: a marketplace's sellers, a directory, a portfolio.
- **Shape:**
  - The profile is org-owned data, in a table with `org_id` like any other. It's edited in a settings section with an explicit Publish, and it stays private until published.
  - It's read through `publicRoute` endpoints under `/api/public/…`, keyed by the org's handle (`UI.md`, the scope layer). They return only published profiles, and only the fields the spec's public schemas declare: `sendValidated` strips the rest.
  - The public address uses the same handle as the app, so handles must stay fixed, or redirect once renaming exists.
  - It needs pages search engines can read (below).

### Reading across orgs: browse and search

- **Build it when:** people need to find orgs, or their records, beyond the orgs they belong to: a marketplace's catalog, a directory's search.
- **Shape:**
  - A second, explicit read path beside `requireOrg`, which keeps its rule (filter by the person's org).
  - Public endpoints read only published rows and declared public columns. A structural test, like `tenancy-schema.test.ts`, lists what each one may read, so a new column stays private until someone decides otherwise.
  - Paged like other lists. Postgres full-text search comes first, and a search service only once that's outgrown.

### People without an org, and data a person owns

- **Build it when:** some people use the product without belonging to an org (a marketplace's buyers, a community's members), or records belong to a person, or to a person and an org at once (an order, a conversation).
- **Shape:**
  - A third kind of table beside org-owned and global: person-owned, with `user_id` referencing `users` `ON DELETE CASCADE`. It's read only by that person, through `access.signedIn` and `req.user`. `tenancy-schema.test.ts` gains the list of these tables.
  - A record with two owners carries both ids, and each side reads it under its own rule: the seller through `requireOrg`, the buyer through `signedIn`. Deleting either one's account says what happens to the record.
  - Someone without an org needs a home other than "create your organization" ("Choosing where someone lands after signing in", above).

### Pages search engines can read

- **Build it when:** pages are meant to be found through search, or shared with link previews: public profiles, listings, and the marketing pages if search matters for them.
- **Shape:**
  - The web app renders in the browser, so a crawler or a link preview gets an empty page. The app itself can stay that way, and only public pages change.
  - The options, smallest first:
    1. Prerender at build time, for pages that change rarely (marketing).
    2. Render the public routes on the server or at the edge, from the public API, with each page's title, description and Open Graph tags.
    3. Run a separate public site beside the app, sharing the API client.
  - Choose when the first page that must be indexed exists.

### Turning a feature on for some orgs or people

- **Build it when:** a feature should be on for some orgs or people and not others: a beta for one customer, a feature that waits on each org's agreement, features by plan, a gradual rollout. A switch for a whole environment stays an environment variable ("Ship it switched off", `DEPLOYMENTS.md`).
- **Shape:**
  - **Per org, decided by people (most cases):** in our own tables, like any other access. An `org_features` table (`org_id` with cascade, a feature name from a fixed list, who turned it on and when) that staff manage in the admin app under a `platform.*` permission. `OrgMembership` in `/me` lists the org's features, so the sites hide what's off. A route for a feature that's off answers 404, as one for another org's record does.
  - **Percentage rollouts or kill switches that act in seconds:** a flag service. Try Railway Feature Flags first, since the API already runs there: typed flags, targeting rules and percentage rollouts, read from an in-memory copy through its TypeScript SDK, and managed through the Railway MCP. Its flags belong to the whole Railway project rather than one environment, so pass the environment as an attribute and target it. Reads go through one module in the API, so the service can be replaced.
  - **Never a flag service for security policy** (requiring MFA, who may sign in): a click in someone else's dashboard shouldn't turn it off. That stays in environment variables or our tables.
  - LaunchDarkly and similar services pay off with many teams running experiments. Until then they add a vendor, keys, CSP entries and a browser SDK.
- **Start from:** Trust XP's `PARTNERS_ENABLED` (`lib/authz/access.ts`), the environment-wide version.

### A desktop app (Tauri)

- **Build it when:** the product needs what a browser can't give: files on disk, a tray icon, global shortcuts, working offline, or a listing in an app store. A dock icon and a window of its own aren't enough on their own: installing the site as a PWA gives both, with no new code.
- **Shape:**
  - `artifacts/desktop`, a Tauri 2 shell around `web`'s build. It reuses `web`'s pages rather than forking them. Native calls go behind a small module that `web` checks for, so the site keeps working without it.
  - It calls the production API through `VITE_API_URL`. The client already sends a bearer token, not cookies, so calls from another origin work.
  - Its origins join `CORS_ORIGIN`, per environment. Clerk checks a token's origin against that same list (`authorizedParties` in `src/lib/identity.ts`). Tauri pages run on `tauri://localhost` (macOS, Linux) and `http://tauri.localhost` (Windows).
  - Signing in is the decision to make first. Clerk is built for web origins, and its redirects and OAuth don't work inside the webview as they do on a site. The usual way is to sign in in the system browser and come back through a deep link. Choose it, and prove it with a social sign-in, before building anything else.
  - The CSP from `lib/csp` applies, with the app's own origin. The headers in `vercel.json` don't reach it, so Tauri's own CSP setting carries them.
  - Releases are their own workflow, separate from the deploy chain: builds for each platform, code signing (Apple notarization, a Windows certificate) and Tauri's updater. An app that's installed keeps running old code, so the API must keep serving the oldest supported version. The additive-migrations rule already works this way for the database.
- **Start from:** Tauri's Vite guide (https://v2.tauri.app/start/frontend/vite/).

