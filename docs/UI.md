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

When a plan or request adds UI, say which answer applies and why. When it's unclear, ask.

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
  - **Workspace** holds the org's settings, which change things for everyone in it. It's shown only to someone in an org.
  - **You** holds the person's own settings.
  - Show only the sections the person may use. Inside a section, hide what their role can't do, as Members hides the role controls from members.
- **Every section** starts with `SettingsSection`: a title and one line of description, so content always starts in the same place. Inside it, `SettingsGroup`s.
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
2. In `Settings.tsx`, add its id to `SETTINGS_SECTIONS` and its nav item to `WORKSPACE` or `YOU`, with who may see it. Then render it in `SettingsForPerson`. A section that reads org data mounts only once `ready` is true, like the others.
3. Tests (`docs/TESTING.md`, **Settings section**): go through `renderAt("/about?settings=<id>")` and cover its loading, empty, error and success states, each interaction, and the people it isn't offered to. If a person can now do something new, add an E2E test that opens it and calls `expectAccessible(page)`.
