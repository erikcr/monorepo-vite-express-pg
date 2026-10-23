# Pages and the settings dialog

Every screen in the web app is either a **page**, where people do the work they came for, or a **section of the settings dialog**, a short detour over the page they were on. Decide which one before building any UI.

## The question

> **Is this something people use all the time, or something they set up and come back to now and then?**

| Answer | Where it goes | Examples |
|---|---|---|
| The work the product exists for, used most visits | **A page**: its own route, in the main navigation | The records list, a dashboard, an inbox, a record's detail |
| Set up once, then revisited occasionally | **A settings section** (`?settings=<section>`) | Profile and sign-in, preferences, notifications, the org's members and invitations, billing, integrations, leaving or deleting the org |
| One small choice or confirmation about what's on screen | **A small dialog or an inline control** | Rename this record, confirm a delete, pick a language |

Three things send something infrequent to a page anyway:
- People spend minutes in it, going back and forth: an import with several steps, or an audit log they investigate.
- It's a large area of its own: the staff back office is the separate admin app, as Slack's workspace administration opens as its own page.
- People need to see or copy from the page behind while they use it. Make that a page or a panel beside the content, not a modal.

A second test, for when how often isn't clear: **what is it about?** Anything about the things people work on (seeing them, comparing them, acting on them) is a page. Anything about the org itself (its people, its name, its plan) or about the person (their profile, their preferences) is settings.

When a plan or request adds UI, say which answer applies and why. When it's unclear, ask.

## Layers: the address is the state

Every screen is a stack of layers, and the address says what each one shows. A refresh or a link restores the screen exactly, and each browser tab is independent because each tab has its own address. Changing a deeper layer never reloads the ones above it.

| Layer | What it is | In the address | Here |
|---|---|---|---|
| **Shell** | The top bar, the account menu | Never | `RootLayout` in `router.tsx` |
| **Scope** | Which org the screen is about | Browser storage today; it belongs in the path (`/o/<handle>`), and moving it there is the next step to take | `active-org.ts` |
| **Place** | A page: where people work | The path | `src/pages/` |
| **Panel** | Content beside the place, which stays usable | The query, e.g. `?record=<id>` | None yet (`CAPABILITIES.md`) |
| **Dialog** | A detour over the place, which is blocked behind it | The query, e.g. `?settings=<section>` | The settings dialog |

Rules:
- **Places go in the path; finer state goes in the query.** A panel, a dialog, a filter, a sort, a tab within a place: all are query parameters validated with Zod. Overlays are query parameters, so the same one opens over any place, as settings do.
- **Back walks places and tabs, and leaves overlays in one step.** Opening a dialog adds a history entry and moving around inside it replaces that entry, so one Back closes it. Moving between tabs of a place, or between records in a panel, adds history.
- **What belongs to the person, not the screen, stays out of the address:** a notification popover, a help widget.
- **Browser storage only remembers, for convenience,** like the last org used; it never decides what a request is about once the address can say.

## Why

Two products people use all day put settings in a modal:
- **Claude:** settings is a large dialog over the app, with grouped sections on the left and the chosen section on the right. The address names the section (`#settings/<section>`); switching section replaces it, so one Back closes settings.
- **Slack:** personal preferences open from the profile picture as an in-app modal with sections down the left. Workspace administration, a large area for admins, opens as a separate page.

The guidance agrees with them:
- A modal interrupts, so it has to be worth it. A task with many steps "probably justifies dedicating a full page to it", and a modal that needs information from the page behind it is a poor fit ([NN/g](https://www.nngroup.com/articles/modal-nonmodal-dialog/)).
- Short, focused tasks can sit over the page; long or complex flows need a page of their own ([Smashing, 2026](https://www.smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree/)).
- Settings are "a hub of many small, unrelated tasks": the job is organization, with grouped sections that can be linked to ([SaaSUI](https://www.saasui.design/blog/saas-settings-page-ux-patterns)).

Settings people visit every so often are a detour from their work. A dialog keeps their place: closing it puts them back where they were. A settings page sends them to a second app with its own navigation.

## The settings dialog

`artifacts/web/src/settings/`:
- `Settings.tsx` has the sections and who sees them.
- `SettingsDialog.tsx` is the frame.
- `SettingsSection.tsx` is a section's header and groups.
- `unsaved-changes.ts` is the guard.

- **The address:**
  - `?settings=<section>` on any route opens the dialog over that page; `?settings=` alone opens it with no section chosen.
  - The account menu opens it, and so does ⌘, (Ctrl+, off a Mac), as in most desktop apps (`useOpenSettings()` opens it from code). A link can open a section: `<Link to="/app" search={{ settings: "members" }}>`. An email can link to one too.
  - Switching section replaces the address, so one Back leaves settings. Closing removes the parameter.
  - An unknown section, or one the person can't use, opens their first.
- **Groups:**
  - **The org's settings**, which change things for everyone in it, are listed under the org's name, so nobody changes settings for the wrong org. It's shown only to someone in an org.
  - **You** holds the person's own settings.
  - Show only the sections the person may use. Inside a section, hide what their role can't do, as Members hides the role controls from members.
- **Every section** starts with `SettingsSection`: a title and one line of description, so content always starts in the same place. Inside it, `SettingsGroup`s.
- **Lay a section out by its own width.** The dialog's content is about 750 px wide even on a wide window, and `md:`/`lg:` follow the window. Inside a section, use the container variants (`@md:`, `@lg:`): `SettingsSection` makes its content a container. Stack rather than putting panels side by side.
- **Applying changes:**
  - A preference that's easily undone applies as soon as it changes, and its row shows that it saved or why it didn't. A role, a select, a toggle, or a text field (once you leave it) all work this way.
  - A change that reaches people outside the app, or can't be undone, takes an explicit button: sending an invitation, a schedule that decides when emails go out, billing, deleting.
  - A form holding typed input that only its button keeps calls `useUnsavedChanges(dirty)`. Closing the dialog, switching section, the browser's Back, or a link elsewhere then asks first in the dialog (a router blocker), and leaving the site gets the browser's own prompt.
  - An explicit action says what it did next to its control, in a `Confirmation` ("Invitation sent to …"), until the person starts on the next one. Inline rather than a toast: it stays where they're looking, and screen readers announce it. Errors show in the same place.
- **No overlay on an overlay:**
  - A step inside a section replaces the section's content, with a way back, rather than opening another dialog.
  - Third-party account UI is embedded as a section rather than opened as its own modal. Clerk's `<UserProfile>` is the Profile section, and Clerk's own "Manage account" is hidden from the account menu.
- **Accessibility:**
  - The dialog is `role="dialog"` and `aria-modal`, named "Settings", and the app behind it is `inert`.
  - Focus moves in when it opens and returns to whatever opened it.
  - Escape, ×, and the backdrop close it.
  - On a phone it fills the screen: the list first, then a section with a way back to the list.
- **Moving a page into settings:** redirect its old path to `?settings=<section>` so existing links keep working.

Patterns that fit here only once a project needs them, such as preferences that save as they change, search in settings, a side panel for a record's details, and a command palette, are in [`CAPABILITIES.md`](CAPABILITIES.md).

### Adding a section

1. Write `src/settings/<Name>Section.tsx`, wrapping its content in `SettingsSection`. Use the generated hooks as a page would.
2. In `Settings.tsx`, add its id to `SETTINGS_SECTIONS` and its nav item to `orgSections` or `YOU`, with who may see it. Then render it in `SettingsForPerson`. A section that reads org data mounts only once `ready` is true, like the others.
3. Tests (`docs/TESTING.md`, **Settings section**): go through `renderAt("/about?settings=<id>")` and cover its loading, empty, error and success states, each interaction, and the people it isn't offered to. If a person can now do something new, add an E2E test that opens it and calls `expectAccessible(page)`.
