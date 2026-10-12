# How design work flows after the port

Decided 2026-09-11, after the first port revealed that the prototype and the
code had already diverged.

## The division

**Claude Design is for what does not exist yet** — a new screen, a large rework,
an idea that needs to be seen before it is argued about.

**A screen that has shipped is edited in code.** Re-exporting a whole screen to
move four pixels costs more than moving them, and the export carries back
everything else that has since been fixed.

## Why, concretely

The prototype is not a clean source. Porting it surfaced defects that exist only
there:

- seventeen motion rules that never fired, because the styles and the components
  used different class families;
- ten theme rules written as descendant selectors that could not match;
- money grouped with a thin space, so an amount broke across two lines;
- dead state in the composer: a chip declared switchable whose setter is never
  called, a clear button that reads a field the parser never fills.

All of these are fixed in `src/`. Re-importing the prototype over a ported screen
puts them back.

## The loop that works

1. Design in Claude Design.
2. Download the bundle over `Content height and label fixes/`.
3. **Commit the download.** Tracked, a design change is a diff; untracked, every
   export is an opaque blob and the only way to see what moved is to look.
4. Port the diff, not the screen.

Exception: the trial `.woff2` stays out of git. `.gitignore` already excludes
every `.woff2` under the bundle.

### One folder, always the same one

Step 2 says _over_ `Content height and label fixes/` and it means it. As of
6 October 2026 neither bundle in the tree is tracked, and the October export
landed in a second folder (`Needt - Design : App, Landing/`) beside the
September one. Two folders make the next diff read "folder A deleted, folder
B added", which is the blob problem with extra steps.

So: **one permanent folder, every export overwrites it. The folder is
`Content height and label fixes/`** — an export's title makes a poor name,
but `scripts/sync-design-tokens.mjs` resolves it and three documents cite it,
so it is the one that stays. Unpack the next export over it rather than
beside it.

`uploads/` and `screenshots/` inside a bundle are working material, not
design, and are now gitignored. Measured on 6 October: 193 MB of the October
bundle's 197 MB is `uploads/`. What is left — the design — is about 4 MB,
which is a thing a repository can carry.

### What "ported" means, and when it is allowed to be false

Seven things were drawn, exported, carried into `src/` — and connected to
nothing. The shell itself, the calendar's empty state, the OAuth return
banner, the phone's bottom bar, the rail's focus control, the rail's search
bar and Log out. Every one of them looked finished in a screenshot, because a
screenshot cannot tell a live control from a dead one.

They were all written to a convention that reads, in the file headers, as a
virtue: _"Exported, not mounted: nothing here reaches into a route."_ That
convention is right for a component library and wrong for a port, and it is
what produced all seven.

**A ported surface arrives with the thing that reaches it, in the same
change.** Done is not "the component exists":

| What it is                                                       | Done means                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| A screen                                                         | Reachable at its URL, and a test navigates there and asserts it                                              |
| A control in the shell (composer, corner, cursor, a rail button) | Mounted in its slot, and a test reaches it the way a person does — the hotkey, the click — from a real route |
| A token                                                          | Landed in `src/`, **and pushed back up** (see below)                                                         |

A surface that cannot be finished in one change is not ported yet. Leave it
on the branch.

### Ask the design for the contract, not just the picture

The slowest part of a port is not redrawing; it is deciding what the screen
is attached to. When the export does not say, the port guesses, and the guess
is wrong in a way nobody sees until a person hits it. Sign-in shipped drawn
with Google, Apple and GitHub; this product has Google and Microsoft, and
only when they are configured.

So each screen's export should state, in prose if nothing else: **what it
receives, what it emits, and what it does when empty, loading, failed,
offline, and not permitted.** Those five states are most of the attachment
work. Drawn, the port becomes mechanical.

### The brief is part of done

`DESIGN-BRIEF.md` is what Claude Design is given as standing context, and it
goes stale on every port — a screen that moves from "not drawn" to "live"
and is not moved in the brief gets drawn a second time. **Updating it is part
of finishing a port**, in the same change, like the changelog.

## Tokens travel the other way

Screens move down, from the design into the code. **Tokens move up.** After a
token lands in `src/`, push it back to the design-system project
`Needt Design System Main` (`25d3c8e5-a812-464d-881f-e887b9adef4b`) with
DesignSync, so the next sketch in Claude Design is built on what actually
shipped rather than on what was true in September.

Tokens are a few small files, which is what makes that direction cheap. Screens
are not, which is what makes the other direction one-way.

### Which copy of the tokens the code actually reads

`scripts/sync-design-tokens.mjs` reads `_ds/<project>/tokens/` **inside the
app bundle**, not the design-system project. The export embeds a snapshot of
the linked system, and on 6 October that snapshot and the live
`Needt Design System Main` carried the same values — so the chain works, but
only through an export.

The consequence, which is easy to get wrong: **a token changed in the design
system does not reach the code until the app is exported again.** Change it
there, export, commit the bundle, run the sync. If that is too slow for a one
-token change, fetch the file straight into `_ds/<project>/tokens/` with
DesignSync and run the sync against that — same destination, one step instead
of three, and the next export overwrites it with the same value.

### Tokens going the other way

This has been written down since September and has not happened once, because
nothing asks for it at the moment it is due. **It belongs in the pull request
that lands the token**, beside the changelog entry, not in a doc somebody
reads twice a year.

## Fixing the prototype

When the port finds a defect in the design itself, fix it in Claude Design too,
the same day. Two of the ones listed above are still open there. A defect that
lives in only one of the two copies is how the two copies stop being one design.

## While a port is in flight

The screen being ported is frozen in Claude Design. Any other screen is free.
When real data proves the prototype wrong, the code wins and the prototype is
corrected to match.
