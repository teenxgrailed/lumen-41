# Needt — porting brief for Claude Code

This kit is a working prototype of a desktop planner, built as classic-script
React over a bound design system. Everything in it is a decision that was
argued, measured or rejected at least once. **Read this file before opening any
other.** It exists so the port keeps the decisions rather than only the pixels
— most of the traps below look like improvements until you know what they cost.

- `README.md` — file-by-file inventory.
- `HANDOFF.md` — long-form rationale, per subsystem.
- `spec.html` — the built spec sheet: tokens, components, states, motion map.
- This file — what to build, in what order, and what not to touch.

---

## 0. What must not drift

These five come from the design system and the product's own history. Breaking
any one of them is how the kit slid backwards, repeatedly.

1. **Every grey is one text colour at an alpha from the ladder.** Text
   100/85/70/55/40/25, fills 2/3/4/6/8/12. No new greys, ever. If a value is
   not on the ladder, it is a mistake, not a nuance.
2. **The interface type scale is 13px and 12px.** 16px is document body. There
   is no 14px in the chrome.
3. **The accent is never a solid fill on a button or a surface** — only 12% or
   24% with the accent as text. Solid accent is correct on a _mark_: switch
   knob, radio centre, status dot, the now-line.
4. **One form-label column: `--form-label-w: 105px`, rows 32px.** It is
   measured from the longest real label. A label that does not fit gets
   **shortened**; widening the column re-opens the defect it was introduced to
   close.
5. **Elevation is ring-first.** Depth = 1px hairline + a ground shift. Controls
   are recessed, objects are raised. No card gets a shadow to "pop" — if it
   does not read, the ground is wrong.

**One screen is exempt, and only from rule 5.** The upgrade sheet is a
landing page that happens to live inside the application, printed on the same
torn paper as the marketing pages (`site/css/paper.css`). Grain and a torn
edge are the point there, so ring-first elevation does not apply to it. Rule 2
still holds on it everywhere except the headline — a price is a display
figure, not chrome — and every other rule, including the accent one, stands.
Nothing else in the product gets this exemption.

Plus the one rule this product added on top:

6. **The canvas is the ground, objects are white, colour is a mark.** A sheet
   under a whole screen makes the screen one big card, and then everything on
   it is a card on a card — two stacked lifts. Documents reads well for the
   opposite reason. Twenty blocks tinted 46% is twenty coloured rectangles, and
   the same tint burns far brighter on near-black than on paper — physics, not
   taste. So: block bodies are `--surface-raised`; the hue lives in the tile
   and the edge; events keep a wash at 13–16% because fill-versus-card is what
   distinguishes an event from a task at 22px tall.

---

## 1. Stack and how the kit is wired

The kit is **classic scripts** (`<script type="text/babel">`), not modules.
Every file assigns to `window` at its end and reads collaborators off `window`.
Two consequences that cost real time here:

- **Everything shares one global lexical scope.** A second top-level
  `const WEEK`, `CALENDARS`, `PROJECTS`, `SNAP` or `KEYS` in any file silently
  clobbers the first and the app dies with a blank screen. This happened four
  times. The fix that stuck was prefixing (`CAL_*`, `RB_*`, `CV_*`,
  `NEEDT_KEYS`) — **in a real module system this whole class of bug is gone**,
  so port to ES modules and drop the prefixes.
- **Load order in `index.html` is a dependency graph.** In the port, replace it
  with imports.

Target stack, per the design system: **Next.js + React + Tailwind**, with the
design-system tokens linked as CSS custom properties and `react-icons/lu` for
glyphs. The kit's `needt-icons.js` is a host-side registry over `react-icons`
that exists only because the kit cannot `import`; in the app, import the glyph
and pass it — `<Icon glyph={LuCalendarDays} size={20} />` — and delete the
registry.

**Three themes**, applied as a class on the app root: default (light/paper),
`.dim`, `.dark`. `themes.css` carries the paper variant and the **dark-ground
elevation override** (see §7).

---

## 2. The data model

`Data.js` is the single store. Port it as typed models; the shapes are load-
bearing across every screen.

### Task

| Field         | Meaning                                                |
| ------------- | ------------------------------------------------------ |
| `id`, `title` | —                                                      |
| `project`     | Project **name** (`"Operations"`). Owns the hue.       |
| `est`         | Minutes. Drives block height, day load, the group sum. |
| `due`         | Day-of-month string (`"4 Sep"`).                       |
| `time`        | `"09:00"` if placed. Absent = unplaced.                |
| `done`        | —                                                      |
| `overdue`     | Past its date and still open.                          |
| `noSlot`      | **Belongs to no day at all.** See below.               |
| `parts[]`     | `{title, done}` — one level only.                      |
| `entry`       | The two-minute first step.                             |
| `value`       | Money, for resale-type tasks.                          |
| `stage`       | Workspace stage id.                                    |
| `dependsOn[]` | Task ids that block this one.                          |
| `assignee`    | Team member id.                                        |
| `habit`       | Marks a standing block.                                |

**`noSlot` is a class, not a flag.** A task that does not belong in a day has
nothing to move — so **it has no rail at all**, it offers no drag, and the row
says "No slot" with a tooltip in rail language. Meaningful _absence_, not a new
colour. It is also excluded from the unplaced queue, because that queue is
"waiting for a time" and these are not.

**Parts are one level.** A part is a piece of its task: it toggles inside the
parent, never takes a place in the day, and has exactly one action —
**promotion** to a task of its own. That is the only way a second level enters
the model, and it is deliberate: two levels is a project, and projects have
Workspace.

### Project, stage, team

- Project: `{id, name, hue, glyph}`. **The hue is data, not a palette choice** —
  colour on screen is the person's own structure.
- Stage: ordered `{id, name}` per project — the Flow/Kanban columns.
- Team member: `{id, name, initials, hue}`.

### Habit

`{id, title, project, at, done[]}` where `done[]` is one entry per day, newest
last. Two rules decided explicitly:

- **A missed day does nothing.** No debt, no Overdue entry, no "3 missed".
  Turning a miss into a task is the guilt spiral that makes people quit.
- **The measure is a ratio over 14 days** ("11 of the last 14"), not a streak.
  A streak punishes one miss with total loss, which is why streaks get
  abandoned. The dot/square field is the record; the number is its summary.
- A habit **owns a slot**: a standing block with a grey rail the scheduler may
  not move. Habits are the skeleton the day is planned around.

---

## 3. Screens

Seven on desktop. `App.jsx` is the shell: tab rail, screen switch, drag host,
keyboard map, focus session, notifications, chat, agent cursor.

### Home (`TodayScreen` + `HomeToday`, `Habits`, `Brief`)

Three forms in one screen, chosen in a settings popover with real miniatures:

1. **Today** (default) — habit rail across the top (the standing frame is
   stated before its contents), then today's tasks cut into morning/afternoon/
   evening. Overdue sits **beside** today, because overdue work is the only
   thing competing with today for today's hours.
2. **Prose** — the week's brief as a written document. Editable in place:
   `contentEditable` blocks, `/` opens a block menu at the caret, selecting
   text raises a mark bar. Prose **owns the page** — the date plate and week
   strip hide, because a written brief is a document.
3. **Canvas** — the same objects positioned freely, with a toolbar. Eight kinds
   (heading, text, checklist, card, metric, quote, image, drawing, email,
   plus the Marey plan/actual chart). Each object carries its **author's ink**:
   you, Needt (accent, typed character by character), an MCP agent (its own
   colour). Authorship without a byline.

The **walls**: Overdue parked off the left edge, Tomorrow off the right;
reaching a 22px lip slides one in over the day.

### Calendar (`CalendarScreen`, `BlockDesigns`, `Minutes`)

Day / Week / Month plus **Columns** and **Sequence**. 46px/hour, full 24 hours,
opens on working hours; non-working hours are hatched. Five days in view, rest
by horizontal scroll (wheel and drag, not just a scrollbar).

**Height is duration, without exception.** On a surface where the gutter, the
hour rules and the now-line are all a scale, a box 2.3× its duration reads as
an event running an hour longer than it does. The block spends the height it
has down its own **collapse order** and a fact is shown whole or not at all —
never clipped. Rich payload (map, link preview) lives in the _list_, where
there is no scale to violate.

The **hour gutter**: dotted rail down its middle, the hour interrupting the
dots in a gap it makes. Reading a time should not require crossing from a label
on one side to a rail on the other.

**Overlap is intersection and nothing else.** Full width when blocks merely
touch; n columns when they genuinely overlap; **cascade** (12px indent, drawn
over) when two overlap by less than half of _both_ durations — both halves of
that test must hold; and when a split would land under 64px the whole cluster
collapses to **one chip** that opens a popover in place.

**The two-minute shelf** (`Minutes.jsx`): any gap under 15 minutes offers
something that fits it.

### Columns (`ColumnsScreen`, `ColumnsView`)

The day as a to-do board: one column per day, sortable (AI / time / priority),
with Overdue and No-date columns. A column states its **load against its real
capacity** — and today's capacity is what is _left_ of today, not what a whole
day holds. Over capacity it shows **what will slip, before you press
anything**.

### Workspace (`WorkspaceScreen`, `Flow`, `Team`)

List / Kanban / **Flow** / Team. Flow is the screen that answers _what is stuck
and why_: cards laid on stages with dependency links drawn between them.

The link is **routed through a lane**, not drawn as an S-curve: out of the
source's side, down a vertical lane in the gutter, into the target's side, with
corners rounded by `min(10, …)` of the three segments they round. A cubic
between two card edges only reads when the horizontal run exceeds its own
control offset — on a stage board it does not (16px gutters), so ±34px controls
land past the opposite endpoint and the curve folds into a squiggle. Route from
**measurement**: which sides actually face each other, and same-column pairs
bowed around one side.

### Documents (`DocsScreen`), Settings (`SettingsScreen`), Auth + onboarding (`AuthScreen`)

Settings: nine sections with search; theme picker with **live miniatures**
(`Miniature.jsx` renders a real reduced screen, not a coloured swatch); the
System thumbnail is **one day cut down the middle** — two full-width layers,
each in its own theme, clipped by `clip-path` — so the rail and blocks continue
across the cut instead of being drawn twice from the left edge.

**Drift** (`Drift.jsx`): paper temperature, light→dark and text contrast follow
the sun at the user's location, over ~30 minutes, as a **toggle over any
theme** — never a theme in the list. Theme is the person's choice; drift is a
property of the day. Put them in one list and someone picks "evening" at 9am.

### Mobile (`Mobile.jsx`, `mobile.html`, `MobileAuth.jsx`)

402×874. Desktop is two panes; a phone fits one, so the rail's four jobs go
four different directions: nav to a bottom tab bar, capture to a sheet, queue
into Home, focus to its own screen. **Outstanding:** brief, documents, teams,
habits as a screen.

---

## 4. The task object — one component, three layouts

`RichBlock.jsx` is the single source. Do not fork it per surface; the kit did
and the copies drifted within a day.

- **block** — on a time grid, height = duration.
- **card** — in a column or list, height = content.
- **row** — dense, in a table.

What carries what:

| Carrier     | Meaning                                                                |
| ----------- | ---------------------------------------------------------------------- |
| body        | white (`--surface-raised`); events a 13–16% wash                       |
| **tile**    | the project's hue + glyph, or the source's mark                        |
| **edge**    | **movability** — fixed wears a hairline in the hue, movable wears none |
| rail (grid) | movability or urgency, per settings — **one dimension, never both**    |
| project dot | identity, and only over 40px wide                                      |
| red         | **at risk**, and nowhere else — not on the time, not on the title      |
| `EXPO -40`  | overdue title, inked by axis; eases to 0 over 400ms when dealt with    |

The **tile is flat**, deliberately. A dock icon is dimensional because a dock
is a shelf of objects; a calendar block is a surface in a flat instrument, and a
glossy tile inside it reads as pasted in from another product. What survives is
the one thing that made it an object rather than a swatch: **light comes from
above** — one step of gradient plus a hairline.

**The entry is the one thing on a block you press**, so it is the one thing
built as a control: the raised default button. Not a green fill — solid colour
on a button is the thing this system does not do, and `--success` means "done",
the opposite of an invitation. The lift is the invitation.

**A group** (several tasks in one block): rows with checkboxes, the remaining
**sum** in the header, and a count **only when the rows are hidden** — a tally
of what is visible directly above it is noise. The group's duration is the sum
of its tasks' estimates, so closing one frees time in the day. Past six rows
the payload scrolls inside the block; a block that keeps growing stops being a
block.

Group assembly is **manual** (drag task onto task). Automatic grouping glues
together what you deliberately spread across the day.

---

## 5. Interaction

### Drag (`Drag.jsx`)

Pick up anywhere, not just the sidebar. The ghost is **the real block** under
the hand. The grid draws **where it would land before the drop**, and a refusal
**names the obstacle** ("Already gone", "Fixed: 1:1 Anna"). Neighbours make
room and slide back if the drop does not happen. The source stays at 35% in
place, so the row never disappears from under you.

### Composer (`Composer.jsx`)

One line parses into a task: date, time, duration, project, priority, labels.
The **verdict is shown first** — what is about to be made, as chips you can
clear. The `+` shelf slides up _above_ the line with eight attributes; each
glyph wears the colour that facet wears as a chip, so the shelf and the bar
share one vocabulary. Description and attachment **do something** — a second
line, a file chip — and travel with the task.

### The corner: three registers of one voice

`Chat.jsx`. Bottom-right is the one place this product speaks from.

- **Pill** 116×40 → **island** 376×54 → **panel** 392×496. One element, three
  sizes; the radius travels with them.
- The **island is not a toast.** A toast is a second object appearing beside
  the first, which is why toasts are ignored — nothing changed, something
  merely arrived. Here the object you already know grows, speaks, and returns.
  The motion _is_ the notice. Rare on purpose: first after ~9s, then minutes
  apart, never while the panel is open or the agent is mid-run.
- **Notifications** (`Notifications.jsx`) are the one separate element, because
  they must survive being read and acted on. They stack **above the pill on its
  gutter**, newest at the bottom where the eye already is, older folded back
  (`scale(1 − depth×0.035)`, dimmed), dropped past four. Arrival overshoots by
  3px and returns — how a hand slides a card onto a desk. **Hovering stops the
  dismiss clock**: reaching for a card says you are not finished with it.
  API: `window.__notify({kind, title, body, when, acts, ms, sticky})`; `acts`
  carry `{say}` to run the agent or `{go}` to move the app.

### The agent cursor (`AgentCursor.jsx`) — a hand, not a spring

When something moves by itself the person is left with a changed screen and no
account of who changed it. So the app shows its own hand doing it.

A damped spring is the obvious model and the wrong one: given a sideways push it
returns to line by **oscillating**, so the cursor sways on every trip. People do
not sway. A human reach is ballistic launch → short corrective approach → no
overshoot, and its velocity profile is the **minimum-jerk curve
`10t³ − 15t⁴ + 6t⁵`**. Duration from distance, Fitts-style:
`clamp(210 + 190·log₂(d/90 + 1), 300, 760)` ms — far targets take longer, but
far from proportionally longer.

The path is **one quadratic bezier**, control point fixed before the first
frame (perpendicular `min(len×0.11, 52)`, alternating sides so a sequence does
not trace the same hook twice). A curve decided up front cannot argue with the
easing; recomputing the bow per frame from the remaining distance is exactly
what made it wobble on arrival.

Three implementation rules, not optional:

- **Write position straight to the element** as `translate3d`. Through React
  state it re-renders the cursor tree 120×/s; through `left/top` it forces
  layout on every one of those frames.
- **It emerges from the chat button and returns into it** — scale 0.2→1 over
  300ms _before_ the first reach. A cursor present on frame one has no origin,
  and an agent with no origin reads as something already loose in the app.
- **Home is the corner, not the element.** Measuring the button at run time
  fails when the run was asked for in chat, because the panel is still open and
  the "button" is a 392×496 header. Measure the shell and inset half a pill
  from its bottom-right.

### Keyboard

One table (`NEEDT_KEYS`) drives both the handler and the printed sheet. **Do not
keep a second copy for display** — a printed list that disagrees with the keys
that fire is worse than no list. `⌘K` palette, `⌘⇧F` focus, `⌘⇧P` plan, `G`+
letter to jump, `?` for the sheet.

---

## 6. Motion — one rule, derived from what was accepted

Three candidates were kept out of eight, and all three share one property:
**the thing that changed moves, and nothing else does.** The rejected ones
moved the room — lists opening gaps, rows flying off, neighbours reflowing.

So: **0.42s rise-and-settle on the single element that changed**, everything
around it still. 55ms stagger when several things arrive at once (one event
with parts; 200ms reads as a queue being processed). Spec table in `spec.html`;
`motion-lab.html` is the built comparison.

The design system's own two transitions still hold underneath: 0.25s for theme
crossfade, 0.15s for hover.

**Living motion** (breathing) is reserved for state, not decoration, and
everything alive breathes at **one 5.2s period**: the wordmark, the focus aura
at the screen corners, the focus button ring, the composer's glow. The wordmark
_stops_ breathing during a focus session — one thing holding still while
everything else breathes reads as attention.

---

## 7. Dark grounds need a different elevation model

On paper an object reads as raised because a light surface sits above the shadow
it casts. On a dark ground that mechanism is gone: a black shadow under a
dark-grey surface separates nothing, and a uniform white ring at one brightness
is precisely what a flat sticker looks like.

Real objects on dark grounds are read by their **edges**: top bevel catches the
light, underside falls into shadow. So `themes.css` overrides `--shadow-raised`
/ `-hover` / `-pressed` for `.dark` and `.dim` as a **directional bevel** —
bright top, dark bottom, faint containing ring — over deepened cast layers.
Pressed **inverts** the bevel: the top edge goes into shadow and the object
sits down into the page.

One override in the theme layer, so every raised control on every screen and
both shells change together. Keep it that way in the port.

---

## 8. Performance — three rules the port must keep

Measured, not guessed: the app idles at 120fps with one running animation, so
every real cost was in interaction.

1. **Coalesce pointer work into one rAF.** A pointer reports at display rate.
   The drag handler was doing `elementFromPoint` plus a `setState` that
   re-renders every subscribed screen, 120×/s, for a browser that paints once a
   frame. Record the position, publish once per frame, publish nothing when
   neither the point nor the target changed.
2. **Never call `getBoundingClientRect()` inside `pointermove`.** It forces
   layout before it can answer, and on a 24-hour × 7-column grid that is the
   most expensive question in the app. Cache it; invalidate on scroll and
   resize.
3. **Do not observe every card.** A `ResizeObserver` per card fires through
   entry staggers and hover shadow changes, and each fire re-measures
   everything. Observe the container; use one settle timer for the entry.

A fourth, React-specific: **read "where we are" from a ref, not from a closure.**
A `goScreen` that compares against the `screen` of the render that created it
early-returns on a screen you have already left, and the defect returns every
time someone forgets a dependency array.

---

## 9. Where the kit still lies

Be honest about these rather than porting them as if finished:

- **Two-minute entries, reasons and risk copy are authored strings.** The
  design assumes a model writes them. The kit shows the shape; the port needs
  the generator.
- **The scheduler is scripted.** "Plan my day" plays a plausible placement, it
  does not solve one. Real placement needs: free-hour computation, fixed
  blocks, buffers, dependency order, and the "what slips" preview the columns
  already promise.
- **The Marey chart, drift sun times and team load are seeded numbers.**
- **`Data.js` is in-memory.** No persistence, no sync, no calendar
  integrations — `source` fields exist, the connections do not.
- **Mobile is five screens**, see §3.
- **Workspace stages/blockers** render, but nothing edits them.

---

## 10. Suggested order

1. **Tokens + themes**, including the dark elevation override (§7). Everything
   else reads from these.
2. **The task object** (§4) as one component with three layouts. It is the most
   repeated thing in the product; get it wrong and every screen inherits it.
3. **Data models** (§2) with `noSlot`, parts, stages, dependencies.
4. **Shell**: rail, tabs, screen switch, keyboard table, themes.
5. **Calendar grid** (§3) — the collapse order and overlap rules are the
   fiddliest code in the kit; port them from `CalendarScreen.jsx` +
   `BlockDesigns.jsx` rather than re-deriving.
6. **Home**, then Columns, then Workspace, then Documents and Settings.
7. **Interaction layer**: drag, composer, corner, cursor, notifications.
8. **Motion pass** against `spec.html`'s table.

Ask before changing anything in §0 or §6 — those are the two places where a
local improvement has broken the whole thing before.
