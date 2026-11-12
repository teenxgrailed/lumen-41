# Pinterest pack (2026-11-12)

Eight 1000×1500 pins built from the current product. Nothing here has been
published. Packs 66–70 stay on hold and nothing older was removed.

Every pin links to `https://needt.app/`. Footer on each pin: "needt.app · Free to start".

| File | Title (Pinterest) | Description | Alt text | Screen used |
| --- | --- | --- | --- | --- |
| `pins/01-one-place.jpg` | Everything you're working on, in one place | Needt keeps your tasks, calendar, docs and AI agents together. Move a meeting and the rest of your day reshuffles around it. Free to start at needt.app. | Needt week calendar with meetings and planned tasks on Thursday. | `/calendar`, desktop |
| `pins/02-day-planned.jpg` | Your day, already planned | Needt fits your tasks between your meetings and suggests one highlight for the day, so you open your phone to a plan instead of a list. Free to start at needt.app. | Needt Today screen on a phone with a suggested highlight and the afternoon's tasks. | `/today`, phone |
| `pins/03-tasks-find-time.jpg` | Tasks that find their own time | Give a task a length and a due date and Needt puts it on today's schedule between your meetings. Free to start at needt.app. | Needt Today screen on desktop with morning and afternoon tasks and today's schedule. | `/today`, desktop |
| `pins/04-agents-team.jpg` | Your AI agents, one team | Connect any AI agent to Needt with its own token. See which agents are working, which are idle and what each one holds. Free to start at needt.app. | Needt Agents screen with five agent cards and their current tasks. | `/agents?tab=agents`, desktop |
| `pins/05-agents-map.jpg` | See every agent at work | The Agents map in Needt shows which agent holds which task and what is waiting on you. Free to start at needt.app. | Needt Agents map: lines from agents to their tasks, with status labels on the right. | Agents map poster from `marketing/agents-map` (main bc9a540f) |
| `pins/06-works-with.jpg` | Works with the apps you already use | Needt works with Google Calendar, Outlook, iCloud and Google Tasks and brings them into one place. Free to start at needt.app. | Needt Connections screen listing Google Calendar, Google Tasks, Outlook Calendar and Apple iCloud. | `/connections`, desktop |
| `pins/07-week-phone.jpg` | Your week, at a glance | Meetings and planned tasks on one calendar on your phone, with what is next always on top. Free to start at needt.app. | Needt calendar on a phone: week strip, next meeting card and the next task. | `/calendar`, phone |
| `pins/08-phone-trio.jpg` | Needt, on your phone | Today, your AI agents and your connections in one place on every screen. Free to start at needt.app. | Three phone screens of Needt: Agents, Today and Connections. | `/agents`, `/today`, `/connections`, phone |

## How it was made

- Screens: local build of `main` a5c96f4a (2026-11-10), captured 2026-11-12.
  - Desktop: 1440×900 at DPR 2. Phone: Playwright iPhone 13 viewport.
  - Demo account seeded with tasks, events and five hub agents; agent names are demo data.
- Script: `source/shots.ts`. Pins: `source/cards.json` (texts), `source/make.py` (HTML) and `source/render.ts` (Playwright render).
- Fonts: Exposure and Figtree from needt.app/assets. Colours: ink `#0e1520`, sky `#d9d5f0` → `#e9e6f3` → `#f7f5f3`.
- Phones sit in a plain rounded frame: no device model, no notch, no widgets.

## Checks before posting

- `06-works-with` was captured in the admin view, which lists every connector.
  - A normal account sees only the connectors configured on the server.
  - Confirm on production that Google Calendar, Outlook, iCloud and Google Tasks are live before posting.
- Pin 06 also shows the Pinterest and Needt API cards. Its text names only the four calendar/task apps.
