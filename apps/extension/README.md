# Needt for Chrome

Manifest V3, plain JavaScript, no build step and no dependencies.

| Feature | What it does | Needt API it uses |
| --- | --- | --- |
| Capture | Alt+Shift+N opens the popup with the page's selection as the title. Quick-add syntax: `tomorrow 2h #project !high`, also in Russian (`завтра 30м`). Right-click a selection, link or page to add it. The task is auto-scheduled; its description quotes the selection and links the page | `POST /api/connect/tasks`, `GET /api/extension/projects` |
| Focus blocking | Every minute, and again when a block ends, it reads what to block and turns it into `declarativeNetRequest` rules. Blocked sites open a page that says why and until when. Needt itself is never blocked | `GET /api/blocking/active` (Pro, `focus_blocking` flag) |
| YouTube, always (no account) | Works with no token and no Needt account. Options and popup toggles: hide Shorts everywhere (shelf, tab, search; /shorts/ links open as a normal video), hide the home feed (search stays), hide recommendations beside the video, hide end cards, hide comments, turn autoplay off. Block lists: channels (name, @handle or /regex/) and title words or /regex/ remove matching videos from the feed, search and sidebar; a small Block button next to channel names adds a channel. Survives YouTube navigation, one throttled pass over new tiles. Fresh install: Shorts and the home feed are hidden, the rest is off. Stored in `chrome.storage.sync` | — (local only) |
| YouTube goal filter | During a focus block, video titles are compared on the device with the task or event you are focused on. Videos off the goal are dimmed with "Show anyway", and Shorts are hidden. Snooze is limited per day (15 min by default). The strictness level and always-show and always-dim channel lists are set in the options | — (local only) |
| New tab | Shows today's date, the current focus, the next event, and the top three tasks with times | `GET /api/connect/today` |
| Project tabs | "Save tabs to project" keeps the window's tabs (up to 30). They open when a blocking profile with that project starts | `GET /api/blocking/profiles` |

The extension does not offer settings for profiles. People keep them with the agent or through
`needt_blocking_profile` / `/api/blocking/profiles` (see `docs/connector-api.md`, "Focus blocking").

## Run it

1. `chrome://extensions` → Developer mode → Load unpacked → this folder.
2. Options → paste a token from Needt Settings → Personal API → Save and check.

The YouTube part needs no token: it works right after install.

Tests (pure logic: quick-add parsing, rule building, relevance, YouTube matching): `npm test` here (Node 22, no install).

## Ship it

`npm run zip` builds `needt-extension.zip` (manifest, icons, src). Upload it in the Chrome Web Store
developer dashboard. Publish **unlisted** first; making it public is the owner's call.

### Store listing draft

- **Name:** Needt
- **Summary (132):** Clean YouTube without an account: no Shorts, no feed, blocked channels. Plus tasks and focus blocking with Needt.
- **Category:** Productivity
- **Description:**
  A cleaner YouTube, with no account needed.
  - Hide Shorts, the home feed, recommendations beside the video, end cards and comments. Turn autoplay off. Everything is a switch.
  - Block channels and title words (or patterns): matching videos are removed from the feed, search and the sidebar. A small Block button sits next to channel names.
  - Works right after install. Nothing leaves your browser.

  With a Needt account it also plans your day in the browser.
  - Add the page, a link or selected text as a task with Alt+Shift+N. Type "tomorrow 2h #project" and Needt schedules it.
  - When a focus block starts, the sites you chose are blocked until it ends. Profiles are set in Needt, so the Mac app and the browser follow the same plan.
  - During focus, YouTube shows only videos that match what you are working on. Everything else is blurred, with a small daily snooze.
  - A new tab with your next event and your top tasks.
  The YouTube cleanup needs no account. Tasks, blocking and the goal filter need a Needt account; blocking and the filter are part of Needt Pro.

### Privacy answers (Chrome Web Store form)

- **Single purpose:** connect the browser to the person's Needt planner: capture tasks and apply the person's own focus plan.
- **Permissions:**
  - `storage`: token and settings, including the YouTube switches and block lists (synced).
  - `alarms`: check the focus plan every minute.
  - `contextMenus`: "Add to Needt".
  - `tabs`, `activeTab`, `scripting`: read the current tab's title, URL and selection when the person adds it, and save or reopen project tabs.
  - `declarativeNetRequest`: block the sites in the person's own focus profile.
  - Host `use.needt.app`: the Needt API.
  - Host `youtube.com`: the YouTube cleanup and the goal filter.
- **Data collected:**
  - Website content (title, URL, selected text) and only when the person adds it, sent to their own Needt account.
  - YouTube titles, channel names and your block lists are compared on the device and never sent anywhere. The lists sync through your Chrome profile.
  - No analytics. Nothing is sold or used for anything else.
- **Remote code:** none.

## Not done yet

- Safari (convert later with `xcrun safari-web-extension-converter`).
- Friction before unblocking, a 24 h delay for loosening rules, daily quotas (after launch).
- Project tabs are stored in `chrome.storage.sync`, not in Needt.
