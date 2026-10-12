# Needt — brief for Claude Design

What this product is, what has already been decided, and which screens are
still missing. Written to be handed to Claude Design whole.

The existing design is not a style to match loosely. It is a system with six
rules that have each been broken and restored at least once, and a working
application built on it. Section 2 is the part that must not drift; the rest
is context for drawing what is not drawn yet.

---

## 1. What Needt is

**Needt is not an AI calendar.** The calendar and the scheduling engine are
the first surface, not the product.

Needt is the place a person keeps everything they are working on and thinking
about, and connects everything else to: their calendars, tasks, documents,
mail, boards, habits, focus time, and whatever tool they already use. The
scheduling engine is one thing that reads that store; it is not what the store
exists for.

Two consequences shape every decision, including design ones:

- **Breadth of use is the goal, not a side effect.** People should be able to
  run genuinely different parts of their life and work in Needt, not just one
  workflow we designed for. Prefer a general mechanism a person can aim at
  their own problem over a narrow feature that solves exactly one. A screen
  that only makes sense for one kind of work is a screen we will have to
  replace.
- **The data must be reachable from outside.** Anything a person puts into
  Needt is readable and writable through our own API. A surface that can only
  be driven by our own UI is unfinished. Design assuming that some of what is
  on screen was put there by another tool, or by an agent, and that the person
  will want to see which.

The product ships as one application for everyone. There are no editions, no
feature flags that change the look, no "pro" variant of a screen.

---

## 2. What must not drift

These six come from the bound design system and from this product's own
history. Every one of them has been broken at least once and the breakage is
what the rule is made of. They are not preferences.

1. **Every grey is one text colour at an alpha from the ladder.** Text at
   100 / 85 / 70 / 55 / 40 / 25. Fills at 2 / 3 / 4 / 6 / 8 / 12. No new
   greys, ever. A value that is not on the ladder is a mistake, not a nuance.
2. **The interface type scale is 13px and 12px.** 16px is document body only.
   **There is no 14px anywhere in the chrome.**
3. **The accent is never a solid fill on a button or a surface** — only 12% or
   24% behind it, with the accent as the _text_. A solid accent is correct on
   a **mark**: a switch knob, a radio centre, a status dot, the now-line.
4. **One form-label column: 105px, rows 32px.** It is measured from the
   longest real label. A label that does not fit gets **shortened**. Widening
   the column re-opens the defect the column was introduced to close.
5. **Elevation is ring-first.** Depth is a 1px hairline plus a ground shift.
   Controls are recessed, objects are raised. No card gets a shadow in order
   to "pop" — if it does not read, the ground is wrong. No glows. No backdrop
   blur.
6. **The canvas is the ground, objects are raised, colour is a mark.** A sheet
   under a whole screen makes the screen one big card, and then everything on
   it is a card on a card. Block bodies are the raised surface; the hue lives
   in the tile and the edge. Calendar events keep a wash at 13–16%, because
   fill-versus-card is what distinguishes an event from a task at 22px tall.

### Five things that look like improvements and are not

Each was tried and reverted. Do not propose them again without new evidence.

- **A damped spring for the agent cursor.** It oscillates. People do not sway.
- **A toast instead of the growing island.** A second object arriving is
  exactly what makes toasts ignorable.
- **A sheet under a whole screen.** Then every object on it is a card on a
  card.
- **A count above rows that are already visible.** A tally of what you can see
  is noise.
- **A `ResizeObserver` per card.** It fires through entry staggers and
  re-measures everything.

---

## 3. The system as built

**Scope.** Everything the design owns renders inside `.needt-v2` with a
`data-theme`. Outside that scope the tokens do not resolve.

**Four grounds, not three.** `paper`, `warm`, `dim`, `dark`. They are the
person's choice.

**Drift is a toggle over any theme, never a theme in the list.** Paper
temperature, light-to-dark and text contrast follow the sun at the person's
location, over about thirty minutes. Theme is a choice; drift is a property of
the day. Put them in one list and somebody picks "evening" at 9am.

**Motion is one family.** Alive things breathe on a ~5.2s period. Arrivals
overshoot slightly and return — a card slides onto a desk, it does not bounce.

**Dark grounds use a different elevation model.** The same tint burns far
brighter on near-black than on paper. That is physics, not taste.

**Glyphs** are `react-icons/lu`, passed as components.

**The one place this product speaks from** is the bottom-right corner. The
pill, the island and the panel are one element at three sizes; the
notification stack is the only separate object, and it stands directly above
the pill so the two read as one voice rather than two. A notice in the
opposite corner would be a fourth stranger.

---

## 4. What exists today

**Drawn, built and live.** The shell — rail, tabs, search, the month, the task
rail, focus, the account — plus five screens: Home (Today), Calendar,
Workspace, Documents, Settings. Sign-in. The phone's bottom bar.

Inside those five, several things that are easy to mistake for unbuilt are
shipping on a real route today. Naming them, because a brief that leaves them
out gets them drawn a second time:

| Surface              | Lives on              | What it already solves                                                                                              |
| -------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Brief** / Canvas   | Home, `/today`        | The week as a written document and as a free canvas, with **three authors** — `you`, `needt`, and a connected agent |
| **Habits**           | Home, `/today`        | The standing frame stated before its contents. "10 of 14", not a streak: a missed day is not a debt                 |
| **Flow**             | Workspace, `/tasks`   | What is stuck and why — cards on stages with dependency links routed through a lane, never drawn as an S-curve      |
| **Team**             | Workspace, `/tasks`   | What each person is carrying and what they are waiting on                                                           |
| **The minute shelf** | Calendar, `/calendar` | Any gap under fifteen minutes offers something that fits it                                                         |

**Brief's authorship model is the one to build on, not around.** An object
carries an `author`, and the author is expressed as ink and a mark in the
margin — never as a byline. Section 5.3 needs the same model, not a new one.

**Drawn but not yet mounted.** The phone's five screens; the quick-capture
composer; the chat pill and panel; the agent cursor; the five-step onboarding
wizard. These exist as components and need wiring, not drawing.

**Not drawn at all. This is the work.** Section 5.

---

## 5. The screens that need designing

Each of these is a real, working surface today, built before the design
existed and wearing the pre-port look inside the new chrome. They are listed
in the order a person meets them.

### 5.1 Focus

A running work session, server-owned: it survives a reload, a second tab and a
sleeping laptop, and the Focus screen, the history and the stats all see the
same one.

What is on it: the session itself (an intention, a planned length of 25 / 50 /
90 minutes, a bound task, pause and resume), a queue of what is next, a habit
panel, a weekly target, and quick actions on the task in hand.

The habit panel is not new work — Habits ships on Home and owns how a habit
reads. Reuse it rather than drawing a second one.

The constraint that shapes it: **ending a session early is deliberately
awkward.** You ask, you wait a few seconds, then you confirm. Design the wait
rather than hiding it — a control that appears to ignore a press is worse than
one that explains the delay. Three strictness levels exist, and the strictest
cannot be ended early at all.

The rail already carries a small focus control for starting and stopping. This
screen is where a session is _lived in_, not where it is launched.

### 5.2 Mail

Several accounts in one place, including an "All inboxes" view, with IMAP and
Gmail connections, their connect and error states, and a sync that can be
queued and can fail.

Its own idea, which the design should make legible: **focused splits** — named
slices of the inbox a person defines, rather than folders someone else
designed. This is the breadth principle in miniature, and it is the reason
Mail is in Needt at all rather than being a link to a mail client.

A message can become a task or a reminder. That crossing — mail into the
planner — is the most important moment on the screen.

There is no tab for Mail in the current shell. Whether it earns one, or is
reached another way, is a question this brief is asking you.

### 5.3 The page editor

A full block editor: headings, bulleted and numbered lists, checklists,
callouts, collapsible context, columns, bookmarks and labelled URLs, file
attachments, covers and icons, comments on blocks, favourites, public links,
and AI-written proposals a person accepts or rejects.

Two things make it specific to Needt. **Blocks carry their author's ink** —
you, Needt itself, or an agent connected through MCP — which is authorship
without a byline. That is not a new idea to invent here: Brief and Canvas on
Home already carry an `author` per object and already decided how it reads.
Build the editor from that model. And an AI proposal is a _suggestion on the
page_, not a chat message about the page.

The Documents list screen is already designed; this is the document itself.

### 5.4 Moodboards

A drawing and reference canvas with version history, offline work, and export
to PNG, SVG and the Excalidraw format. Collaborative, with a connection state
that has to be visible without being loud.

### 5.5 AI chat

A conversation with a history list that can be shown or hidden, new chats, and
a set of opening prompts — "Plan my week", "Reschedule my day", "Summarize my
day", "What should I work on next?".

The hard part is its relationship to the corner. The corner already speaks for
this product at three sizes. A full chat screen has to read as the same voice
made larger, not as a second assistant. If the right answer is that the panel
simply grows and there is no separate screen, say so.

### 5.6 The upgrade sheet

The screen where somebody pays. It is a landing page that happens to live
inside the application, and it is the one surface here that is allowed to
behave like one: the deep sheet torn across a pale ground that
`site/css/paper.css` already draws, the same stock the marketing pages are
printed on. Craft does this and it is right — a page asking for money should
not look like a settings panel.

**Two rules bend for it, and only two.** Rule 5, elevation-is-ring-first, does
not apply: paper has grain and a torn edge and that is the point. Rule 2, the
13/12 type scale, holds everywhere except the headline — a price is a display
figure, not chrome. Every other rule stands, including the accent one: the
price is a mark, not a filled button.

**Where it opens from:** Settings → Billing, and at the end of the trial.
**Not** when an AI limit is reached — the limits are not shown to anybody
(decided 15 September), and a paywall that appears the moment you hit an
invisible ceiling teaches people the ceiling exists.

Six states, all of them real:

| State            | What the sheet says                                                                       |
| ---------------- | ----------------------------------------------------------------------------------------- |
| Trial running    | How much is left, without counting down at them                                           |
| Trial ended      | What stopped working, and what it costs to start it again                                 |
| Already Pro      | Not a sales page — what they have, and the way out                                        |
| Already Lifetime | The same, and nothing to buy                                                              |
| Lifetime closed  | The first 300 are gone. Say so plainly; do not hide the option as though it never existed |
| Checkout failed  | The thing that went wrong, and the way to try again                                       |

Prices as configured today: **$7 a month, $59 a year, $149 lifetime** for the
first 300.

### 5.7 Smaller, still unowned

- **Quick add** — a single capture surface, reachable from outside the app.
- **Admin** — operations and system pages. Internal, but they should not look
  like a different product.
- **Password reset** — the one auth screen the design never covered.

### 5.8 The phone

The phone has the design's bottom bar and the desktop screens underneath it.
Five phone screens are drawn and unmounted. The original brief also listed as
outstanding: the week's brief, documents, teams, and habits as a screen.

What is missing is the **phone version** of surfaces that already exist on the
desktop — the week's brief, documents, teams, habits as a screen of its own.
Not the surfaces themselves; those shipped (section 4).

A phone fits one pane where the desktop fits two. The rail's four jobs already
go four directions: navigation to the bottom bar, capture to a sheet, the
queue into Home, focus into the header. Keep that split.

### 5.9 Onboarding — decided, and narrower than it looks

A five-step wizard is drawn — name and time zone, working hours, the shape
you want the day in, calendars, first tasks — and has never been mounted. The
application deliberately derives onboarding progress from real data rather
than from a "seen" flag.

**Both stay.** Progress is still read from the data. The wizard is only the
way in for an account that is still empty, and it stops appearing when the
data appears — no flag, no new column, nothing to go stale. Design it as a
door, not as a gate: every step is skippable, and skipping costs nothing
because the checklist in Settings is still there afterwards.

Decided 6 October 2026.

---

## 6. How to deliver it

**Design work flows one way per artefact.** Screens move from Claude Design
into the codebase; tokens move back up to the design system. A shipped screen
is edited in code, never re-exported over.

So: deliver new screens as their own components with their own files, using
the existing tokens by name. Do not restate a token's value, and do not
introduce a value that is not already in the system — if something genuinely
needs a new token, name it and say why, and it goes up to the design system
rather than into the screen.

Where a screen needs data, say what shape it needs. The task object is one
component with three layouts and every surface in the product uses it; a new
screen that draws its own version of a task is a screen we will have to
rewrite.

State the states. Empty, loading, failed, offline, and permission-denied are
not afterthoughts on these screens — Mail cannot connect, the moodboard goes
offline, the page editor's AI proposal is refused. A screen delivered with
only its happy path is half a screen.

---

## 7. What to read, in this order

These are repository paths. **They do not resolve inside Claude Design** —
whoever hands this brief over attaches the three files to the project, or
points at where they already sit inside it.

1. **`PORT.md`** — the newest brief, and the only one that records _why_ each
   decision beat the obvious alternative. In the repository at
   `docs/handoff/PORT.md`, and byte-for-byte the same file as the one inside
   the exported bundle.
2. **`HANDOFF.md`** — long-form rationale, per subsystem. In the bundle at
   `needt-app/HANDOFF.md`, identical across both exports.
3. **The bound design system**, in the bundle under `_ds/`. Its CSS is the
   one authority that outranks everything else here.

Where the first two disagree, `design-reconciliation-2026-09-11.md` (in the
repository, under `docs/handoff/`) holds the rulings. Where either disagrees
with the vendored CSS, **the CSS wins** — it is the shipped artefact.

`/DESIGN.md` and everything under `design-refs/` are superseded and carry a
banner saying so. Read them for history, never for a value.

---

## 8. This brief goes stale

Sections 4 and 5 are a snapshot. Every port moves a surface from section 5
into section 4, and a surface left in the wrong one gets drawn twice.
Updating this file is part of finishing a port, in the same change as the
code — see `docs/handoff/design-workflow.md`.

Last checked against the repository: **6 October 2026.**
