# The design moved. What the local documents now get wrong.

Source: `needt-app/HANDOFF.md` inside the Claude Design project
`Content height and label fixes`, `260768ff-eb30-4609-b2f7-d75b353033ed`,
read 2026-09-11. That project is a regular Claude Design project, not a
design-system one, which is why `DesignSync list_projects` never showed it.

**That handoff is now the design authority.** `/DESIGN.md`,
`docs/handoff/STATE-2026-09-11.md` and everything in `design-refs/` describe an
earlier product. Where they disagree with it, they are wrong. Fix them before
an agent reads one and builds from it.

## Eleven places the repository's documents are now false

**1. The display serif is Instrument Serif, not Exposure.** Exposure is the
wordmark and nothing else. `/DESIGN.md` records a 2026-09-06 decision replacing
Instrument Serif with Exposure at all display sizes; the design did not keep it.
This also dissolves the localisation violation the state document treats as
open, because no translatable string was ever going to be set in Exposure.

**2. Movability is carried by the edge, not by a rail.** Fixed blocks wear a
1.5px hairline in their hue, movable ones 1px at a lower alpha. Every local
document describes a 3px coloured rail. Status left that edge entirely and is
now a 6px dot.

**3. Colour means project, and on events it means calendar.** Two carriers per
block, the tile and the edge, over a `--surface-raised` body. The hue is the
user's own data, not a palette choice.

**4. The calendar geometry is different in every number.** The state document
records 56px per hour, a 48px gutter and 07:00 to 22:00. The design is 46px per
hour, a 68px gutter, working hours 09:00 to 18:00 with a full-day expansion, and
five days visible rather than seven.

**5. Columns is the default calendar view, not Day.** Seven day columns of
cards, sortable by AI, time or priority, with Overdue and No date pinned left.
This is the clock-less mode that `docs/_old/10-design.md` lists as an
unbuilt D7 concept. It is built.

**6. There are five themes and a drift.** Paper, Warm, Dim, Dark and System,
where System lets the user pick which theme fills each half of the light and
dark pair. Drift warms and cools the paper by the sun at the user's location and
crossfades over half an hour. Local documents know three themes and no drift.

**7. The flame is back.** `/DESIGN.md` records the flame as cancelled and
removed from the product. The design ships `Flame.jsx` as a category flame, and
the task fixture carries a `heat` field from 0 to 1 that drives it.

**8. Habits are a product feature.** A rail of 14 squares on Home, measured as
kept days out of the last 14, never as a streak. No local document mentions
habits at all. The reasoning against streaks matches `docs/plans/11-task-model.md`
T-3, so this is the resolution of that parked item, not a contradiction of it.

**9. The product has people in it.** The fixture carries `people`, `holder` and
`waitsOn`; Workspace has a team strip, faces on every row, and the line
"blocks one of yours". The state document says the product experience is
single-user. That is no longer what the design draws.

**10. Timed motion exists outside the wordmark.** `needt-breathe` is a 5.2s
loop and it runs on the wordmark, the focus aura and the composer glow.
`/DESIGN.md` permits motion on a timer only on the wordmark. Either the rule
widens to name those three surfaces, or two of them stop breathing.

**11. Two of the five open calendar defects are already fixed in the design.**
The cascade condition now requires the overlap to be under half of *both*
durations, and the width ladder at 120, 90 and 64 pixels is fully specified.
The design also states the collapse order for payload rows, which the state
document does not mention at all.

## What is genuinely new and has no local record

`AgentCursor.jsx` exists, so the agent cursor of §12 item 4 is built rather than
planned. `Flow.jsx` draws dependency chains through a gutter lane and ranks
tasks by how much work each one unblocks. `Miniature.jsx` renders every
thumbnail in the product as a real screen drawn at full size and scaled down.
`Composer.jsx` parses the capture line. A phone shell exists at 402x874.
`RichBlock.jsx` is one component for the task in every layout, with `rbShape()`
as the single adapter from a store task.

## The port order this implies

`Data.js` first, because the design's own rule 5 is that one fact has one home
and four project registries produced two real defects. Then `RichBlock.jsx`,
because it is the task object everywhere and every screen depends on it. Then
`themes.css`, because shared object CSS duplicated per shell has already drifted
once. Only then the screens, and Flow before the other two Workspace views,
because it answers what the others structurally cannot.

Two things the prototypes do that production must not carry over: every
component is a `window` global because the kit loads as classic script tags, and
all state is local `useState` seeded from the fixture. The fixture's *shape* is
the contract; the fixture itself is not.

## PORT.md arrived, and it disagrees with HANDOFF.md — owner decisions, 2026-09-11

A second brief, `docs/handoff/PORT.md`, was written in Claude Design and is more
detailed than `HANDOFF.md` in several places. Where they conflict, these are the
rulings.

**Motion timings: the CSS wins, and it agrees with HANDOFF.** `PORT.md` §6 says
the rise is 0.42s with a 55ms stagger. `HANDOFF.md`'s table says 0.46s with a
26ms stagger. The vendored stylesheet, which is the shipped artefact, says 0.46s
with delays stepping 20, 50 and 80ms, and one 5.2s breathing period. The prose in
`PORT.md` is stale. This is the reason the motion layer is vendored verbatim
rather than re-typed from a description.

**The edge on a movable block stays as built.** `PORT.md` §4 says a movable block
wears no edge at all; `HANDOFF.md` says 1px at a lower alpha, and that is what
shipped — fixed 1.5px at 62%, movable 1px at 42%, halved on dark grounds. Owner
kept the built behaviour: a movable block still needs an outline on a dark
ground.

**The week grid shows all 24 hours, with non-working hours hatched.** `PORT.md`
§3 wins over `HANDOFF.md`'s 09:00–18:00 window with a "show the whole day"
expansion. The grid opens scrolled to working hours. Nothing is hidden, so an
event at 23:00 cannot be missed.

**`Sequence` is a fifth calendar view and does not exist yet.** `PORT.md` names
Day, Week, Month, Columns and Sequence; `HANDOFF.md` names three, and the bundle
has no file for a Sequence view. Owner asked for it to be built from the one-line
description, which makes it the one screen in this port that is composed here
rather than recreated.

**`noSlot` was already right.** `PORT.md` §2 states it is a class rather than a
flag: no rail at all, no drag, a "No slot" label, and exclusion from the unplaced
queue. The ported task object already draws only the containing ring and the
label.

## The part of the product that is not a port

`PORT.md` §9 is explicit, and it changes what "make the AI work" means:

- the two-minute entries, the scheduler's reasons and the risk copy are **strings
  someone typed**; the design assumes a model writes them, and no generator
  exists;
- "Plan my day" **plays a plausible placement**, it does not compute one. Real
  placement needs free-hour computation, fixed blocks, buffers, dependency order
  and the "what slips" preview the columns already promise;
- the Marey chart, the drift sun times and the team load are seeded numbers.

None of that is recreated by porting. It is built, against the scheduling engine
this repository already has in `src/services/scheduling/`.

## Seventeen motion rules that never fired — owner decision, 2026-09-11

The prototype's motion layer animates `.nt-card`, `.nt-chip`, `.nt-nav-row`,
`.nt-status-dot`, `.nt-icon-button`, `.nt-menu`, `.nt-popover`, `.nt-scrim` and
`.nt-dialog`. The design system's own components emit a different family —
`.card`, `.chip`, `.nav-row`, `.nt-dot`, `.btn-icon` — and the two sets do not
overlap at all.

Checked directly: the `nt-*` names appear **only inside the `<style>` block of
`index.html`**. No component writes them and no script adds them, so seventeen
rules matched nothing. Menus appeared without a pop, dialogs without a scale-in,
scrims without a fade.

**Owner ruled: revive them.** Every primitive under `src/components/needt/shell/`
pins both names, which is where either name is written. The ported app is
therefore slightly more animated than the prototype was — this is the one place
the port deliberately does not reproduce what was on screen in Claude Design,
because what was on screen was the design failing to run.

Worth fixing in the prototype on the next design pass, so the source and the port
stop disagreeing.

## Dead theme selectors, fixed in the generator

The vendored motion sheet carried `.dark .key-cap` and `.dim .ew-sculpt` —
descendant forms from the prototype, where the theme was a class on the root.
This repository puts the theme in a data attribute on the scope element itself,
so a descendant form can never match. Ten rules were silently dead, including the
bevel inversion that makes a key-cap read as pressed on a dark ground.
`scripts/sync-design-tokens.mjs` now rewrites them.

## The port is complete — 2026-09-12

Every screen of the new design exists under `src/components/needt/`, composed on
`/design-preview` against the fixture. 37,629 lines, 1,096 unit tests, and
`type-check`, `lint` and `tokens:check` all green.

| Area | Lines |
|---|---|
| shell | 3,091 |
| calendar | 3,510 |
| home | 3,484 |
| mobile | 3,300 |
| settings | 2,101 |
| composer | 2,084 |
| auth | 2,024 |
| workspace | 1,983 |
| dialogs | 1,967 |
| corner | 1,707 |
| interaction | 1,698 |
| cursor | 1,571 |
| docs | 686 |
| ui · preview | 786 |

### The 44px rule was asserted, not measured

The phone shell's own tests asserted that every named size constant was at least
44. Measured in the rendered page, twenty-one interactive elements were smaller:
twenty checkboxes at 15px, drawn by the shared `RichBlock`, and the composer's
send button at 32px inside a 44px `span` that had no click handler at all — the
slop reserved space and caught nothing, so every press in the margin landed on
nothing while the code and its comment both claimed otherwise.

Fixed by growing the target rather than the mark: `RbCheckbox` takes a `hitSlop`
and `RichBlock` a `touch` flag, both drawing an absolutely positioned child that
extends past the element and is invisible to layout, so no dense desktop row
reflows. The send button carries its own. Measured again: 56 interactive
elements on the phone, none under 44.

**The lesson is general.** A constant that says 44 is not a target that measures
44. Assert against the rendered box.

## What is still not built

None of this is porting; all of it is new work.

- **The generator.** Two-minute entries, the scheduler's reasons and the risk
  copy are strings someone typed. PORT.md §9 says the design assumes a model
  writes them.
- **The scheduler.** "Plan my day" plays a placement rather than solving one.
  Real placement needs free-hour computation, fixed blocks, buffers, dependency
  order, and the "what slips" preview Columns already promises. The engine
  exists at `src/services/scheduling/`; nothing connects it to this design.
- **The data.** Everything runs on the fixture. The schema needs `parts`,
  `entry`, habits, waiting-on-a-person, a global stage and money, and
  `GET /api/tasks` needs a serializer, which does not exist at all.
- **The AI.** The chat and the cursor run scripted seams. Connecting them to
  `src/components/ai/` is a separate pass, with undo on anything reversible and
  confirmation for mail, deletion and an external calendar.
- **Replacing the old screens.** The port lives beside the shipping app, not in
  it. `/design-preview` is where it is judged; the swap is its own change.
- **The wordmark's licence.** The variable font is a trial. Buy the web licence
  from 205TF before it ships.

### Two defects still open in the prototype

Both were found by porting and are fixed only in the code:

1. Money grouped with U+2009 THIN SPACE, a line-break opportunity, so "€1 200"
   broke across two lines inside a block.
2. Seventeen motion rules target class names no component wears, so menus,
   dialogs and scrims never animated.

## Owner ruling, 2026-10-14: action notices

Transient action, Undo and status notices ("Focus started · 25 min on …",
"Placed at 14:00 · 3 Sep [Undo]") are a compact pill at the bottom centre,
inverted against the page (the prototype's `ToastLayer`: `--text-primary` fill,
`--background` ink), per the owner's mockups. This overrides PORT.md §6 for
that kind of notice only. The growing island in the Ask Needt corner is
unchanged and still carries the product's own nudges (`surface: "island"`).

## Owner ruling, 2026-10-26: the phone's page change moves

PORT.md §6 says the element that changed moves and nothing else does, and the
prototype swaps the stage by key between places (MOTION.md, "Phone screens":
no transition between places, only the halftone sweep). On the phone that was
too subtle to notice. The owner asked for a stronger page change, so this is
an exception to §6 for **moving between places on the phone**, and for that
only:

| Move                                               | What happens                                                                                             | Time   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| To a dock tile on the right of the one you were on | the new page slides in from the right over the old one, which gives way 26% to the left and dims to 0.55 | 360 ms |
| To a dock tile on the left                         | the same, mirrored                                                                                       | 360 ms |
| To a place that is not a dock tile (the menu card) | the new page rises from the dock: scale 0.96 to 1, a 24 px lift, fading in over the old one              | 340 ms |
| Reduced motion                                     | no movement, a crossfade over the old page                                                               | 150 ms |

The curve is the house ease (`--nx-ease`). Nothing overshoots, so §6's rule
against oscillation is kept. What does **not** change: the dock, the fog under
it, the sync dot and every sheet stay still (only the page moves, which is why
the transform sits on the screen's content and not on the stage), only
`transform` and `opacity` move, nothing is fixed or shadowed, and the
halftone sweep is unchanged. Back/Forward in the browser is left to Safari's
own gesture. Everything else in §6 (rise-and-settle for a changed element, the
55 ms stagger, living motion) stands. Source: `phone/shell/pageMotion.ts`,
`styles/v3-overrides/phone-page-motion.css`.
