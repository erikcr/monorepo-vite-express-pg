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

### Staff set up each org, with self-serve creation switched off

- **Build it when:** we set orgs up for customers rather than letting anyone sign up: they're billed outside the app, onboarding is hands-on, or open signup would invite spam. Until then anyone signed in can create an org.
- **Shape:**
  - **Staff create the org in admin** (`POST /api/admin/orgs`, under a `platform.orgs.create` permission): its name and handle, and its first owner's name and email. One transaction writes the org and an emailed invitation for the owner, with no inviter and outside the per-person daily limit. If the product keeps records of people before they sign in (employees, say), the owner's record is written too and the invitation names it, so accepting links their account to it. Admin's org list says which orgs still wait for their owner, with a resend for a lost or expired link.
  - **Self-serve creation stays in the code, switched off** by one API variable (`SELF_SERVE_ORGS`, off by default, so off wherever nobody sets it). While it's off, `POST /api/orgs` answers 404 after its access rule. `/me` says `canCreateOrg`, the one value the sites read: someone in no org is told to ask their org's owner for an invitation instead of seeing the create form, and "New organization" is hidden. No `VITE_*` copy can disagree with the API (F.1 in `docs/template/IMPROVEMENTS.md` makes this the general pattern). Turning signup on later, once billing is in the app, is that variable.
  - **Tests run with it off, as production does.** An E2E fixture gives a test an org the way production makes one: staff create it through the API, and the owner accepts the emailed link. API tests that create orgs themselves turn it on with `vi.stubEnv`.
  - Decide whether the org's change history records what staff did; a member's history usually shows only its members' changes.
- **Start from:** Jig & Kerf's plan 02 (`sims-labs/jig-and-kerf`, 2026-10-29): `src/routes/admin.ts`, admin's `NewShopPage.tsx`, and the `shopFor` E2E fixture.

### Sharing with people who have no account

- **Build it when:** an org shares a record with someone outside it who shouldn't need an account: a customer reviewing and approving a proposal, a client checking progress, someone signing. If they'll come back often across many records, a portal with sign-in may fit better; a link page is a good first step toward one.
- **Shape:**
  - **A link per person, not per record.** Give each outside person (a customer contact) their own link to a page for the thing shared (a job, a project), and link emails straight to the item that needs them. Every view and action is then tied to a named person, and one person's access can be removed alone.
  - **A fourth access rule**, beside `public`, `signedIn` and `requireOrg`: `access.sharedLink`, which resolves the token to its link, its org and its record, and sets them on `req.ctx`, so routes never read an org from the request. `route-access.test.ts` lists these routes like the others.
  - **Tokens:** at least 128 random bits in the URL; only a hash is stored, with the person, the record, who created it, an expiry and a revoked time. The org can revoke a link or issue a new one. Lookups return 404 for an unknown, expired or revoked token alike.
  - **A separate read path.** These routes live under their own prefix (`/api/shared/…`), return their own response types, and show only what was marked for outside people: visibility is set per item, new items start hidden, and internal fields (costs, notes) aren't in those response types at all, rather than filtered out.
  - **Approving needs more than the link.** Viewing takes only the link; an approval or signature also takes a one-time code sent to that person's email (`lib/email.ts`), so a forwarded link can't approve. The approval records the typed name, an agreement box, the time, IP and browser, and the exact version approved, frozen ("A change history for org data", below).
  - **Record views:** first and last opened per link, so the org can see a proposal was read.
  - Rate-limit the token routes, keep tokens out of logs and error reports, and tighten these pages to `Referrer-Policy: no-referrer` (the sites send `strict-origin-when-cross-origin`) so the token never travels with a link followed from them.
  - The pages carry the org's name and brand, so outside people know whose page it is ("An org under its own brand and domain", level 1).

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

### A change history for org data

- **Build it when:** people need to see what changed on a record, who changed it and why, or the business wants to compare what was planned with what happened (an estimate against the finished job, a dispute, accountability). Most business products reach this early, so plan for it with the first records people edit. The rule is to record more than today's screens need: what was never recorded can't be analysed later.
- **Shape**, in three layers:
  1. **Baselines.** When something is approved or signed off (an estimate, a contract, a plan), keep that version as its own immutable record, and keep the original values next to the current ones on what it generated. "Original against now" is then a comparison, not a replay of history.
  2. **Actuals as ledgers.** What happened (time worked, money spent, quantities done) goes in append-only tables. Nothing is edited: a correction is a new entry that offsets the old one.
  3. **A change history for everything people edit.** One `change_events` table:
     - columns: `org_id` (with cascade, like every org-owned table), the actor (a user id, or null for a job), the record's type and id, the action (create, update, cancel, restore), the changed fields as JSON (`{"quantity": [4, 5]}`), an optional reason and note, the request id, and the time;
     - written in the **same transaction** as the change, through one helper the routes call (`recordChange(tx, …)`). A database trigger would catch every write but loses who did it and why, so it's the helper;
     - append-only: no route updates or deletes it, and each write route's tests check its entry;
     - indexed on (`org_id`, record type, record id, time) for a record's History panel, the first thing it powers.
- **Reasons:** where a change matters for analysis (a quantity, a size, a price, a cancellation), the UI asks for a reason from a fixed list, plus an optional note. That's what turns history into answers ("most overruns came from mis-measures").
- **No hard deletes for records that matter:** they're cancelled or archived, so the history, the ledgers and other records still point at something that exists. Deleting an org still removes everything it owns (`tenancy-schema.test.ts`).
- **Never recorded:** secrets and tokens. Personal data in the history follows the same deletion rules as the record it came from.
- **Start from:** the shape above; nothing in the template writes history yet.

### File uploads to a private bucket

- **Build it when:** people attach files to records: photos from a phone or tablet, drawings, PDFs, documents shared with people outside the org.
- **Shape:**
  - **A private bucket per environment**, beside the API: Railway Storage Buckets (S3-compatible, private, free egress through presigned URLs), defined in `.railway/railway.ts`. The S3 client lives in one module in the API, so the provider can be replaced.
  - **Keys say whose, not what:** `orgs/<org_id>/<file_id>`, never the filename, which stays a column. An object is never overwritten: a new version is a new file, so anything approved still points at the exact bytes ("A change history for org data", baselines).
  - **A `files` table** like any org-owned table: `org_id` with cascade, the record it's attached to, who uploaded it, the original name, content type, size, a visibility, a status (pending, ready, removed) and the time. An org's storage used is a sum over it.
  - **Uploads go straight to the bucket.** The API checks the person may attach to that record, creates the pending row and returns a presigned POST whose conditions fix the key, the content type and a size range. The browser posts the file to the bucket, then tells the API, which checks the object (a HEAD request: size and type) before marking it ready. The bytes never pass through the API. The bucket's CORS allows only the sites' origins.
  - **Downloads are short-lived presigned URLs** (about an hour), handed out after the same access checks as the record, from the org's routes and from the shared-link routes ("Sharing with people who have no account"). An `<img>` can't send the API's auth header, so responses carry the URLs rather than redirecting to them.
  - **Visibility per file**, with levels the product decides: usually everyone in the org, a narrower group (a permission such as seeing costs), and outside people. New files start internal; the shared routes return only files marked for outside people.
  - **Uploads are untrusted.** Accept a fixed list of types and sizes. Serve anything that isn't an image or a PDF with `Content-Disposition: attachment` (set through the presigned URL's response headers), so an uploaded HTML file never opens as a page. Add the bucket's host to `img-src` and `connect-src` in `lib/csp`.
  - **Photos are resized in the browser** before upload (`createImageBitmap`, a canvas, JPEG): a display size (about 2560px) and a thumbnail (about 480px). Uploads stay quick on a phone connection, the server never processes images, and re-encoding drops EXIF, location included; read the time taken first if it matters. A file input with `accept="image/*"` and `multiple`, without `capture`, offers both the camera and the photo library and needs no camera permission.
  - **An upload queue on the page:** progress per file, retries on failure, and a warning before leaving with uploads unfinished. Unless the app works offline, uploads stop when the page closes.
  - **Removing is two steps:** the row is marked removed, with a reason, and the file disappears at once; a job erases the object after a grace period (30 days) unless something approved refers to it. Deleting an org erases its prefix.
- **Start from:** the shape above; the template stores no files yet.

### An org under its own brand and domain (white label)

- **Build it when:** a customer wants the product to look like theirs: their name, logo and colors, and later their own address (`app.theircompany.com`), while it still runs as part of our one shared platform. Until then every org lives at `/o/<handle>` on our domain.
- **Why the org is in the path, not a subdomain:** a browser treats every subdomain as a separate site, with its own cookies, storage, service worker and cache. One app that holds all of a person's orgs, switches between them without reloading, and boots from one cache has to live at one address. Products where people belong to many tenants put the tenant in the path (Notion, Linear, GitHub, Vercel). Slack moved its web app from `<workspace>.slack.com` to `app.slack.com/client/<workspace ID>` alongside rebuilding the client to hold every workspace in one app, with a service worker that "handle[s] every network request from the same origin". The subdomain stayed only as an address that redirects into the app. Slack never published a reason for the URL change itself, so the link is inferred: https://slack.engineering/rebuilding-slack-on-the-desktop/, https://slack.engineering/service-workers-at-slack-our-quest-for-faster-boot-times-and-offline-support/, https://slack.engineering/unified-grid-how-we-re-architected-slack-for-our-largest-customers/. Subdomains and custom domains fit when a tenant's own customers see the site and the address is part of their brand (Shopify stores, Zendesk help centers). A cheap vanity address: `theirs.ourapp.com` that only redirects to `/o/<handle>`.
- **Levels**, each one a plan of its own:
  1. **Their brand on our domain.** The org stores a display name, a logo and a brand color. `web` sets the `--color-brand*` variables at runtime from it (the semantic tokens make that a variable swap), and uses the logo and name in the header, the page title and the favicon. Check contrast as `new-project` does for the template's own color: compute `--color-brand-fg` and the lightness rather than trusting the customer's hex. Everything a customer's client sees uses it too: shared links, PDFs, emails.
  2. **A subdomain of ours** (`theirs.ourapp.com`). A wildcard domain on the `web` project (Vercel's wildcard certificates need Vercel's nameservers), and the org comes from the host. Clerk sessions already cover our own subdomains, so sign-in needs nothing new.
  3. **Their own domain** (`app.theircompany.com`). Feasible, but the most work, mostly because of Clerk (below).
- **Shape** for levels 2 and 3:
  - An `org_domains` table (`org_id` with cascade, `host` unique, `verified_at`). A domain is verified with a DNS TXT record before anything serves it, so nobody can attach a domain they don't control. The customer points it at us with a CNAME. Staff manage domains in `admin`, which stays on our own domain.
  - Vercel: add each verified domain to the `web` project through its API; certificates are issued automatically once DNS points at Vercel. Pro allows up to 100,000 domains per project (a soft limit), and the domains API has hourly rate limits, so adding them goes through a job (https://vercel.com/docs/multi-tenant/limits).
  - `web` resolves its host when it loads, through a public endpoint (`GET /api/public/domains/:host`: the org's handle and brand). On such a domain the org is fixed: the domain's root is that org's home, and someone who belongs to other orgs sees only this one there. **The domain only chooses which org is on screen; access still comes from grants** (`requireOrg`), as it does now.
  - Links the API makes (invitations, shared links, emails) use the org's domain instead of `WEB_URL`.
  - The API's allowed origins stop being only `CORS_ORIGIN`: they're that list plus the verified domains, read from the database and cached, for both CORS and the token's `azp` check in `identity.ts` (which then checks `azp` itself, as "A native app (Expo)" describes).
  - An installable app's manifest (name, icons, colors) is served per host.
- **Clerk on a customer's own domain (level 3):** each one is a **satellite domain** (https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains). It needs Clerk's paid plan, a `clerk.` CNAME in the customer's DNS, and registering it with Clerk (dashboard or Backend API). People sign in on our primary domain and are sent back, so our domain shows during sign-in. `ClerkProvider` gets `isSatellite` and `domain` from the host at runtime, and the primary lists the satellites in `allowedRedirectOrigins`. The site's CSP is built once per site with Clerk's address in it (`lib/csp`), so per-domain Clerk addresses mean sending the CSP as a header per host instead. Clerk's own emails (sign-in codes) carry the Clerk application's name for every org, unless we turn off Clerk's delivery and send them ourselves from its webhooks. Prove sign-in on one real satellite before promising level 3.
- **Emails we send:** from our domain with the org's name in the sender, or from the org's domain once that domain is verified with Resend (more DNS records for the customer).
- **The other way: a separate deployment per customer** (its own Railway, Vercel and Clerk, from this template). Complete white label, including Clerk's emails, but every customer becomes a deployment to run, migrate and pay for. Only for a customer who requires it.
- **Start from:** Vercel's multi-tenant platforms guide (https://vercel.com/docs/multi-tenant) and Clerk's satellite domains guide.

### An installable web app (PWA)

- **Build it when:** the project decided an app should be installable (`new-project` asks, per app): people open it many times a day on a phone or tablet, and a home-screen icon and a full-screen window help. Usually only `web`; staff use `admin` at a desk, in the browser.
- **Not on by default:** an installable app adds files and checks to keep, and offline support adds a service worker that can keep serving old code after a deploy. Each project opts in.
- **Shape**, in two levels:
  - **Installable, online only (start here):** a web app manifest (name, icons, `display: "standalone"`, `start_url: "/app"`, theme and background colors from the brand tokens), icons including `apple-touch-icon` for iOS, and `theme-color` and `apple-mobile-web-app-*` meta tags in `index.html`. No service worker, so every load is the deployed version. The CSP needs nothing new: `manifest-src` falls back to `default-src 'self'`.
  - **Offline:** a service worker, generated at build time (Workbox, for example through `vite-plugin-pwa`; check that it supports the Vite version). It precaches the app shell, so pages open without a network. Serve the worker with `Cache-Control: no-cache` (a header in `vercel.json`), and show "A new version is available" rather than updating silently. `worker-src 'self'` is already in the CSP. API data offline is the real work: which records are cached, how edits made offline are queued and synced, and what happens on conflict. Plan that as its own feature; the session token can't be refreshed offline, so writes wait for the connection.
- **iPhone and iPad:** there's no install prompt; people use Share → Add to Home Screen, so the app should say how. An installed app has its own storage and cookies, separate from Safari's, so people sign in once more after installing. Web push works only for an installed app (iOS 16.4+). `vercel.json`'s `Permissions-Policy` turns off the camera, microphone and location: allow the ones a feature needs (a live camera view needs `camera`; a file input with `capture` that opens the camera app doesn't).
- **Check it:** Lighthouse's installability checks in CI, and an E2E test that `/manifest.webmanifest` serves the expected name and start URL. Install it on a real iPad before calling it done.
- **Start from:** web.dev's PWA guides (https://web.dev/learn/pwa/) and, for offline, `vite-plugin-pwa` (https://vite-pwa-org.netlify.app/).

### A native app (Expo)

- **Build it when:** the project decided it needs one (`new-project` asks), because people need what a browser can't give them: working offline (a job site with no signal), uploads that carry on in the background, reliable push notifications, devices managed by an MDM, or an App Store listing. Phones and tablets otherwise use the sites in their browser.
- **What it costs:** a second set of screens, maintained alongside `web`'s. React Native doesn't render `web`'s pages, components or Tailwind classes. What's shared is the API contract: the OpenAPI types, the Zod schemas and the generated React Query hooks. Every feature a native app has is built twice.
- **Shape** (proven on an iPad simulator on 2026-10-27, Expo SDK 58):
  - `artifacts/mobile`, an Expo app in the workspace (`@repo/mobile`). pnpm needs no hoisting or extra Metro config.
  - Sign-in through `@clerk/expo`: `ClerkProvider` with `tokenCache` from `@clerk/expo/token-cache` (the session lives in the device's secure storage, so it survives restarts), and the `expo-secure-store` plugin. Clerk's custom flows (`useSignIn()`), native components (`<AuthView />`) or hosted sign-in all work; enable the Native API in the Clerk dashboard, and for production register the app on its Native applications page (bundle ID and Apple Team ID).
  - **One React version for the whole workspace, Expo's.** Each Expo SDK fixes its React version; the catalog's `react` and `react-dom` follow it, or `@repo/api-client-react` resolves a second copy of React and React Query and the hooks fail ("No QueryClient set"). Upgrading React then waits for Expo.
  - `configureApiClient` gains a `baseUrl` option: `web` reads the API address from Vite's env, which React Native doesn't have (`EXPO_PUBLIC_API_URL`).
  - **`src/lib/identity.ts` checks `azp` itself.** Native tokens have no `azp` (no web origin requested them), and since `@clerk/backend` 3.11.1 its `authorizedParties` option refuses a token without one. Verify with the secret key alone, then refuse a token whose `azp` is present and not in `CORS_ORIGIN`, as in Clerk's manual verification guide (https://clerk.com/docs/guides/sessions/manual-jwt-verification). Its tests cover our origin, another origin and none.
  - Some packages Clerk pulls in want install scripts (`browser-tabs-lock`, `core-js`): deny them in `allowBuilds`. `minimumReleaseAge` can leave the app a patch behind Expo's newest, which is fine.
  - Releases are their own workflow: EAS builds and signing, App Review, over-the-air updates. An installed app keeps running old code, so the API keeps serving the oldest supported version; the additive-migrations rule already works this way for the database. It needs its own E2E layer (Maestro or Detox) and a section in `TESTING.md`.
- **Open question:** `web` and `admin` are separate apps. Does a native app need the same split, or does staff work stay on the web? Decide when the first native app is planned. Most likely only the people who work away from a desk get a native app, and admin stays on the web.
- **Start from:** Clerk's Expo quickstart (https://clerk.com/docs/expo/getting-started/quickstart).
