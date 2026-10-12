# Codex prompts for the design port

Three Codex lanes run in parallel, each in its own worktree. Claude owns the
foundations (T01–T04), Home (T09), the Ask Needt corner, island and cursor
(T23–T25, owner-locked motion), auth and paywall (T26–T27, prices), the
integration (T28), and reviews every PR.

**Start a lane only after T01–T04 are merged into `port/integration`**
(tokens, flag, migrations, hooks). Until then the contracts in
`02-task-plan.md` §2 do not exist in code yet.

| Lane | Stream | Tasks, in order |
| --- | --- | --- |
| Codex A | S2 Shell | T05 Shell → T10 Tasks + T11 Projects + task dialog → T17 Moodboards, T18 Templates, T19 Shared, T20 Trash |
| Codex B | S3 Objects | T06 `<Task>` → T07 Composer → T12 Calendar + drag → T21 Settings, T22 Connections |
| Codex C | S4 Layers | T08 States layer → T13 Docs grid + T14 Document → T15 Mailbox + T16 Habits |

Lane C takes T15/T16 from S1 so Claude's usage stays on the delicate parts;
the file-ownership table in §2.5 moves `needt3/{mail,habits}/**` and
`src/styles/v3/{mail,habits}.css` to S4 accordingly.

---

## Prompt (paste into Codex, replace `<LANE>` and `<TASKS>`)

```
You are Codex lane <LANE> of Needt's design port. Work only on: <TASKS>, in that order.

Setup
- Repo /Users/lol/Needt. Create your own worktree; never work in another lane's folder:
  git fetch origin
  git worktree add ../Needt-worktrees/port-<lane> -b port/<lane>-<first-task> origin/port/integration
  cd ../Needt-worktrees/port-<lane> && npm install --legacy-peer-deps
- One branch and one PR per task card (port/<lane>-t10 …), each cut from the latest
  origin/port/integration. PR base is port/integration, never main.

Read first (all in the repo)
- CLAUDE.md, docs/STACK.md, docs/port/README.md
- docs/port/02-task-plan.md: §0, §1, §2 (contracts — do not invent token names,
  query keys or component APIs; a missing one is a question for Claude, write it in
  the PR), §2.5 (file ownership: write only your stream's files), §3 (rules, all of
  them), and your task cards. Each card gives Src → Target → Deps → Accept.
- docs/port/01-data-map.md for fields (owner decisions at the end are binding:
  mail is read-only; habits have streaks; the task sheet keeps First step and
  Scheduling; "Overlaps" only when a calendar event is involved).
- The prototype is docs/port/prototype/ (FROZEN, read-only). Also read its
  FROZEN.md, COMPONENTS.md (props + target module per component) and use
  docs/port/prototype/port/ (types, fixtures, en.json strings) instead of retyping. Serve it with
  `npx serve docs/port/prototype` and open index-dev.html#screen/<view> or
  mobile-dev.html to compare. Never edit it.

Hard rules
- Everything renders under the .needt-v3 scope and only when the design_v3 flag is on.
  Flag off must look exactly as today.
- Never edit src/components/needt/** (old design), AppShell.tsx, globals.css,
  src/styles/needt-*.css, prisma/**, or another lane's files.
- Data only through the hooks in src/lib/needt3/hooks and keys in query-keys.ts.
  If a hook or field is missing, stop that piece, note it in the PR, continue.
- Motion and phone perf rules in §3 items 11–12 are mandatory (transform/opacity/
  clip-path only, no loops at rest, fill backwards, reduced motion).
- Repo conventions: @/lib/prisma, @/lib/date-utils (no new Date()), logger with
  LOG_SOURCE, Next 15 params are Promises, react-icons, escape &apos;/&quot; in JSX.

Done = for each card
- npm run type-check, npm run lint, npx jest on touched tests: all green.
- Screenshot pair per screen (prototype vs app, light + dark, 1440x900) attached to the PR.
- Commit messages end with: Co-Authored-By: Codex <noreply@openai.com>
- Open the PR: gh pr create -R teenxgrails/needt --base port/integration
  Body: what was ported, what is missing and why, screenshots, gate output.
- Do not merge. Claude reviews and merges. Then start the next card from the
  updated port/integration.
```

## Lane fill-ins

- **A**: `<LANE>` = `a`, `<TASKS>` = `T05, T10+T11 (with the task dialog), T17+T18+T19+T20`
- **B**: `<LANE>` = `b`, `<TASKS>` = `T06, T07, T12, T21+T22`
- **C**: `<LANE>` = `c`, `<TASKS>` = `T08, T13+T14, T15+T16`
