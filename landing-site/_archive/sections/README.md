# Archived home page sections (22.11.2026)

Five sections were taken off the home page (`landing-site/index.html`) on 22.11.2026 at the owner's request.
They are kept here, not deleted. Image and video files they used are still in `landing-site/assets/` (`assets/upd/`, `assets/op/cal-dark.webp`, `assets/op/ph-today-dark.webp`, `assets/cal-after.webp`).

| File | What | Original position in `index.html` |
|---|---|---|
| `agents-orbit.html` | Agents orbit: Needt "n" in the centre, Claude / Grok Bot / Codex / Any agent, "Work moves while you are away." | First child of `<section id="one-place">`, the `div.fold#fold` pinned block above `<div class="wrap">` |
| `quick-add.html` | Quick-add demo: Task / Event / Doc tabs, "Add task", "✓ Task added to Friday · Clients" | Inside `#one-place > .wrap`, directly after `div.three` (the three cards) |
| `updates.html` | "UPDATES: Shipped lately." changelog list with the sticky stage | `<section id="updates">`, between `#more-needt` and `#screens` |
| `planning.html` | "PLANNING: Something runs long? The rest re-slots." calendar + Needt agent card on the lavender sky | `<section id="ai">`, between `#tour` and the "Details" bento section |
| `after-dark.html` | "AFTER DARK: Easy on the eyes, day or night." light/dark calendar + phone | `<section id="night">`, first child of `div.night-zone`, right before `section.final`. Also holds the `dusk-veil` div (it sat in `.night-zone > .sky-wrap`) |

Also here:
- `removed-rules.css`: the 238 rules (and now-empty `@media` blocks) cut from `styles.css`. Only rules whose selectors point at classes/ids used by nothing else on the site were moved.
- `removed-app.js.txt`: the init code cut from `app.js` (orbit scroll relay, composer typing demo, planning demo, night crossfade, updates stage).

Other edits made with the removal: `index.html` links `styles.css?v=67` and `app.js?v=54`; the `#one-place { padding-top: 0 }` rule is gone (it existed only because the orbit sat at the top of that section); `onNight()` in `app.js` now turns the header dark when `.night-zone` (final call and footer) reaches the top, instead of tracking the removed section.

## Restore a section
1. Paste the section's `.html` back at the position above.
2. Append the needed rules from `removed-rules.css` to `styles.css` (or all of them; they are scoped to these sections) and bump `styles.css?v=`.
3. Paste the matching block from `removed-app.js.txt` back into `app.js` (same IIFE, same place: orbit before "Screens", composer before "Tour", planning before "Bento", night before "The name at the floor", updates inside the v42 block), restore `onFold()` in `onScroll` and `.fold-pin, .night-pin, .dusk-veil` in the sticky-park selector, then bump `app.js?v=`.
4. For `after-dark`, also put `<div class="dusk-veil" id="dusk-veil"></div>` back after `.sky` in `.night-zone > .sky-wrap`, and restore the old `onNight()` from `removed-app.js.txt`.

The simplest full restore: `git revert` the commit that created this folder.
