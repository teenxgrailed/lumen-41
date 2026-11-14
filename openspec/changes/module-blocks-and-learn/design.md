## Context

Decisions of 14.11.2026 (Maksym): modules from prebuilt blocks only; Learn is the first module; Coo teaches; lessons land in the calendar and the streak is a habit; Learn is Pro with 1 lesson a day on Free; build after 17.11 behind `learn_module`.

Research page: Needt page "Learn + Blocks · research" (14.11.26). Numbers below are from it and dated 14.11.26 unless stated.

What exists in the repo (checked 14.11.26 on origin/main `1273b403`):

| Need | Where | Note |
| --- | --- | --- |
| MCP tools | `src/services/connectors/mcp/tools.ts` (`needt_create_page` at ~l.1458, `needt_log_habit` ~l.1553, `needt_schedule` ~l.894), `server.ts`, endpoint `src/app/api/mcp/route.ts` | Tool registration lives in `tools.ts`; the server instructions string is in `server.ts`. |
| MCP Apps | `openspec/changes/add-mcp-app-widgets/` | Same `ui://needt/...` mechanism; module rendering must reuse it, not fork it. |
| Script API | `docs/connector-api.md`, `src/app/api/connect/*`, scopes `needt.read` / `needt.write` | Personal tokens act with the owner's scopes. |
| Habit | `prisma/schema.prisma` `model Habit` (l.1132), `HabitCompletion` (l.1302) | `kind BUILD|QUIT`, `at`, `daysOfWeek`, `quota`. |
| Streak maths | `src/lib/needt3/derive.ts` `streak()` (l.362), `src/lib/needt3/habits.ts` | "Closed days in a row up to yesterday"; today stays open. Learn must use it, not a second counter. |
| Scheduler | `src/services/scheduling/` (`engine.ts`, `TaskSchedulingService.ts`, `TimeSlotManager.ts`, `SlotScorer.ts`) | Places tasks and habits; `entitlement-selection.ts` decides what a plan may schedule. |
| Plans | `src/lib/plan-limits.ts` (`PLAN_LIMITS`, FREE `habits: 3`, `aiAgent: false`), `src/lib/entitlements.ts` (`getPlan`, `canUseAiAgent`) | No `isPro` helper: Pro is `getPlan(userId)` plus a limits field. |
| AI metering | `model AiUsage` (`actionCount`, `yearMonth`), `src/services/ai/usage.ts` | Metered in actions; Free has no AI (owner 16.10). |
| Flags | `src/lib/feature-flags-keys.ts`, `src/lib/feature-flags.ts` `isFeatureEnabled(key, userId)` | Add `LEARN_MODULE = "learn_module"`. |
| Notifications | `src/lib/notifications.ts` `notify`; `src/lib/umami.ts`, `src/lib/umami-server.ts` | Push goes through the facade; events through Umami as elsewhere. |
| Promo | `cn-promo*` in `src/styles/v3/connections.css`, `ConnectionsScreen.tsx` | Budget (#690) reuses it; so does Learn. |
| Learn today | skill `/needt:learn` and pages "Needt · Learn · <topic>" | Level, plan, steps done, next step, kept as page text. |

## The duolingo mechanics we borrow (mechanics and feel only)

From the owner's five screenshots of the "card cascade" mode (German and Russian words). No art, colours, fonts or branding are copied.

1. **Intro screen**: mode title, the mascot over a fan of cards, one promise line ("earn up to 572 XP"), two facts side by side ("level 1 of 13", "earn 20 XP"), one big button labelled with the reward. Lesson as a path with levels and a stated reward before it starts.
2. **Stack of cards**: one large card in front, five or six edges visible behind it, so the pile reads as a deck. The front card's word is large, centred, with nothing else on it.
3. **Timed round**: a close button, a thin progress bar and a countdown beside it (1:30 and counting), and a one-line instruction under it. Pressure without a fail state.
4. **Card state by outline**: the active card is lit by an outline tint, the rest sit quiet. State is carried by the edge, not by fills.
5. **Primary answer control plus a repeat button** side by side under the stack; the primary is disabled (dots) until input is possible. A quiet "I can't speak now" link below: an escape hatch that keeps the session going. In Needt it maps to "type instead", which is our v1 input anyway.
6. **XP and the reward line** as the visible progress currency, scoped to the lesson ("+20").

What Needt changes: the accent is text or a 12/24% wash, never a solid fill on the button (PORT.md §0 rule 3), chrome is 13/12px (rule 2) with display sizes only on the card word and the XP figure, greys are one ink at ladder alphas (rule 1), elevation is a hairline plus a ground shift (rule 5), and motion is one rise-and-settle on the element that changed with a 55ms stagger (PORT.md §6). The mascot is illustration and may use its own colours; everything around it obeys the four rules.

## Architecture

```
AI / user / MCP client
        |  module JSON (flat spec)
        v
  validate: Zod -> references -> scopes+limits   (<=2 retries, structured errors)
        |  valid only
        v
  Module + ModuleVersion  <---- JSON-Patch(baseVersion)
        |
        v
  renderer (React)  --- dataSource {collection, filter, sort, limit}
        |                      |
   blocks from registry        v
                         server compile -> Prisma, viewer's scopes
```

### Module JSON

```json
{
  "id": "mod_…", "kind": "needt.module", "schemaVersion": 1, "version": 7,
  "title": "German B1", "scopes": ["learn:read", "learn:write", "needt.read"],
  "collections": { "words": { "fields": { "de": "text", "ru": "text", "due": "datetime" } } },
  "layout": { "root": "r", "elements": {
    "r":  { "type": "flashcardStack", "props": { "limit": 20 },
            "dataSource": { "collection": "words", "filter": { "due": { "lte": "now" } },
                            "sort": [{ "due": "asc" }], "limit": 20 },
            "on": { "answer": { "action": "learn.review" } }, "children": ["c"] },
    "c":  { "type": "mascot", "props": {} }
} } }
```

Borrowed from Vercel `json-render` (`@json-render/react` 0.22.0, Apache-2.0, npm 04.11.26): a Zod **catalog** produces the system prompt (the `catalog.prompt()` idea) and the spec is flat. We copy the shape and do not depend on a 0.x package. `ai` is 7.0.173 and `streamUI` is paused, so rendering is from tool parts, not generated components.

### Registry

`src/lib/modules/registry.ts`: `type -> { props: ZodSchema, allowedActions[], requiredScopes[], maxChildren, render }`. Generic: `list`, `table`, `cards`, `chart`, `form`, `timer`, `chat`, `calendarSlot`. Learn adds `flashcardStack`, `exercise`, `lessonSummary`, `mascot`, and reserves `voice` (registered as `disabled: true`; a module containing it fails validation with `block_disabled`). The catalog JSON Schemas are generated from the Zod props (`zod-to-json-schema` or the `json-schema.ts` helper already in `src/services/connectors/mcp/`; to confirm in phase 0).

### Data and permissions

- `dataSource` is `{collection, filter, sort, limit}`; operators are a closed set (`eq, ne, lt, lte, gt, gte, in, contains`). `src/lib/modules/query.ts` compiles it to Prisma with the **viewer's** `userId`/`workspaceId` forced into the `where`. No raw SQL, no relation traversal outside declared collections.
- Custom collections are typed fields stored as `ModuleRecord { moduleId, collection, data Json }`, validated on write against the module's declared fields. Built-in collections (tasks, habits, events, pages) are read through existing services, never by direct table access.
- The AI acts with the caller's rights only. A module's `scopes` can never exceed its owner's. Creating or changing modules needs `modules:write`, separate from using one. Agent writes show in the existing activity log.

### Validation and edits

Three passes: (1) Zod against the registry; (2) referential: collections, fields, actions and element ids exist and the tree is acyclic; (3) scopes and limits (blocks <= 60, depth <= 6, query limit <= 200, spec <= 64 KB). Failures return `{path, code, message}[]` to the model, at most two retries, nothing stored until valid.

Edits are JSON-Patch (RFC 6902) with `baseVersion`; a stale version is `409` with the current spec. Every accepted patch writes a `ModuleVersion` row (`undo` = apply the inverse and write a new version). The user flow is: AI proposes a diff, a preview renders it, the user accepts. Direct prop editing is a form generated from the block's Zod schema. Clone is copy with a new id. A template is a module with no records.

### Surfaces

- App: `/learn` for Learn (module-aware route), generic `/modules/[id]` is flagged off in v1.
- MCP (`src/services/connectors/mcp/module-tools.ts`, registered from `tools.ts`): `module_list`, `module_get`, `module_create`, `module_update` (JSON-Patch + `baseVersion`), `module_delete`, `module_validate` (dry run), `block_list` (catalog with JSON Schemas), `block_get_data`, `block_invoke_action`. In v1 the write tools exist but answer `403 modules_write_disabled` for everything except the internal Learn module; read tools are live (decision g).
- MCP Apps (SEP-1865, final, spec 2026-01-26; `@modelcontextprotocol/ext-apps` 2.0.4): module tools set `_meta.ui.resourceUri = "ui://needt/module/{id}"`, resource mime `text/html;profile=mcp-app`, built on the `add-mcp-app-widgets` hosting. Fallback is text plus the JSON spec.
- REST for scripts: `src/app/api/connect/modules/*` mirrors the MCP tools one to one (bearer token, `needt.read` / `needt.write`), documented in `docs/connector-api.md`.

## Learn

### Data

`LearnCourse` (language pair, level, goal, timezone-aware daily goal), `LearnLesson` (course, ordinal, status, xpReward, generated JSON), `LearnCard` (term, translation, example, tags, FSRS state), `LearnReview` (card, rating, due, stability, difficulty, at), `LearnAttempt` (lesson, exercise id, answer, correct, ms). FSRS through `ts-fsrs` 6.0.0 (MIT, npm 28.10.26): about 20 to 30% fewer reviews than SM-2 for the same retention (research page). Mistakes are re-queued in the same lesson and again in the mistakes review.

### Lesson

Generated per lesson by AI into a validated lesson JSON: 8 to 14 exercises, types `choice`, `type` and reserved `voice`. Input is text typing and multiple choice only; `voice` is in the schema enum and in the registry as disabled, and nothing else is designed for it. A lesson mixes new cards and due reviews. Answer checking is deterministic (normalised compare, accepted variants list generated with the lesson); AI is not in the answer loop, so a lesson runs offline once generated and never spends an action per answer.

### Mechanics, ranked (research page)

1. Streak separated from the daily goal (Duolingo blog 19.11.2020: D14 retention +3.3%, DAU +1%, 7-day streak means 2.4x return). S.
2. FSRS with re-queued mistakes. M.
3. Commitment framing, goal chosen at onboarding. S.
4. One streak freeze. S.
5. Mistakes review. S.
6. XP, daily goal, lesson path ("earn up to N XP, level x of y"). S to M.
7. Coo reactions and push reminders through `notify`. S to M.
8. Leagues. L, not in the MVP.

Explicitly excluded: hearts and energy (2025 backlash). Practice inside a lesson is never paywalled; the Free limit counts lessons per day only.

### Calendar and streak

- A Learn course owns one Needt `Habit` (`kind BUILD`, `at` and `daysOfWeek` from onboarding) so the scheduler places a lesson slot like any habit, and Today, Focus and reminders already understand it. `HabitCompletion` is written when the daily goal is met, not on lesson start. Streak = `streak()` over habit days; "closed day" means goal met or a freeze consumed.
- Learn habits count toward `PLAN_LIMITS.habits` (Free 3)? Recommendation: a Learn habit is **exempt** from the habit cap, otherwise a Free account with three habits cannot try Learn. To confirm in phase 4 with the entitlement code (`canCreateHabit`, `withHabitSlot` in `src/lib/entitlements.ts`).
- Daily goal (XP) is a separate number from the streak (decision from the research: this split is what moved retention).

### Coo

States: `idle`, `think` (5 s without an answer), `correct`, `combo` (x3, x5), `wrong`, `tease` (two wrong in a row or slow), `streak`, `levelUp`, `streakLost` (faint meme), `nag` (return after a gap; used for the push image). Implemented as a Rive state machine (`@rive-app/react-webgl2` 4.39.0, MIT, npm 09.11.26) with inputs per state; cards, XP count-up and shake are CSS. Until the `.riv` exists a static SVG pose per state is the fallback, so the UI never waits on art. Rive's free tier shows a splash; removing it is Rive Cadet at about $108 per seat per year (owner money decision, open decision b).

Reactions are readable without sound, shorter than 1.5 s, and never block the next question.

### Recording mode (the point of the design)

`/learn?record=1` (and a toggle in Settings -> Learn):
- Clean 9:16 canvas inside TikTok safe zones; no chrome, no paywall, no toasts, no nav, no update banners.
- One question per screen, fast auto-advance after the reaction.
- Big cards (the stack from the reference), Coo large, XP count-up on every correct answer, 60 fps target.
- **Demo seed**: a deterministic scripted take (right, right, right, wrong, tease, combo, level-up) over a fixed deck so a reshoot is identical. It uses no AI and no account data.
- Toggles: Coo size, sound on/off.
- Events (Umami, same helpers as elsewhere): `learn_lesson_started`, `learn_lesson_completed`, `learn_day1_return`, `learn_day7_return`, `learn_streak_7`, `learn_record_mode_used`.

### Limits and AI cost

Pro: unlimited lessons. Free: 1 lesson per day, counted by `LearnLesson.completedAt` in the user's local day; the second shows the promo, never a mid-lesson wall. Free has no AI (owner 16.10, `PLAN_LIMITS.FREE.aiAgent = false`), so Free's lesson cannot be generated live: open decision a.

### Existing "Needt · Learn" pages

`/needt:learn` stores level, plan, steps done and next step in a page named "Needt · Learn · <topic>". Learn will (1) list such pages in a one-time "Continue from a page" import that creates a `LearnCourse` with the stated level and next step, never modifying the page; (2) on its side write nothing back unless the user asks. Ongoing sync is out of scope. Without an import the two coexist: pages stay plain pages, courses stay courses.

## Navigation and promo

Same pattern as Budget (#690), without touching its files: a Learn row after Agents on the desktop sidebar and before Settings in the phone menu; flag `learn_module`; Free grey with a PRO pill, not hideable, opens a promo reusing `cn-promo*` (Pro buttons hidden in store builds); Pro a normal row, hidable by `prefs.learnInSidebar`. First Pro visit: promo with Open. Prefs live in `UserSettings.prefs`, not localStorage. Promo copy shows no lesson content.

## Risks

- The registry is a second product surface. Mitigation: internal-only in v1 (decision g).
- Rive adds a runtime and a licence question. Mitigation: SVG fallback ships first.
- Lesson quality varies by language. Mitigation: curated starter decks for EN, DE, ES, FR, UK (decision e); AI fills the rest and marks lessons "AI-made".
- Scheduler noise: a daily slot for a lesson competes with tasks. Mitigation: it is a habit, so existing habit priority and quota apply.
- Merge freeze: nothing here ships before 17.11.

## Open decisions (owner)

**a. Free AI for Learn** (owner 16.10: Free has no AI; Free gets 1 lesson a day).
1. Recommended: Free's daily lesson comes from **pre-generated, cached lessons** (curated EN/DE/ES/FR/UK starter decks, generated once, no per-user AI); any language outside them is Pro. Why: honours "Free has no AI" and costs nothing per Free user.
2. A tiny metered allowance on Free (one generated lesson per day inside `AiUsage`). Why: any language on Free, but it breaks the 16.10 rule and has a real cost.
3. Free gets only the demo seed. Why: zero cost, but it is not a product.

**b. Coo animation runtime.**
1. Recommended: free Rive with splash first, decide Cadet (~$108/seat/yr, as of 09.11.26) after the numbers; static SVG poses until the `.riv` exists. Why: no spend before the flag is on.
2. Rive Cadet from day one. Why: clean recordings with no splash, a money decision.
3. Static SVG or Lottie only. Why: simplest, but loses the state machine that makes Coo react.

**c. Who draws Coo's `.riv`.**
1. Recommended: owner or designer rigs it from the existing Needt-video pigeon, ten states. Why: keeps the character identical to the videos.
2. Commissioned animator. Why: faster and better rigging, costs money.
3. Generated frames only. Why: no rigging, loses reactions.

**d. Streak freezes.**
1. Recommended: Free 1 per week earned by a full week, Pro 2 banked. Why: one freeze is the research default and a second makes Pro tangible without a paywall on practice.
2. One for both. Why: simplest, no Pro upsell.
3. None on Free. Why: stronger upsell, but a lost streak is the main churn moment.

**e. Languages at launch.**
1. Recommended: any language via AI (Pro) with curated starter decks for EN, DE, ES, FR, UK. Why: the owner's goal is any language and the decks give Free and reviews a safe base.
2. Only the five curated. Why: highest quality, narrow.
3. Any language, no curation. Why: broadest, uneven quality and no Free content.

**f. Leagues.**
1. Recommended: later, only after day-7 retention data exists. Why: L effort and needs social users we do not have yet.
2. Never. Why: avoids a competitive layer that clashes with a calm planner.
3. In the MVP. Why: Duolingo's stickiest loop, but too large before launch.

**g. Scope of the generic module builder in v1.**
1. Recommended: Learn first; registry internal, MCP read-only; user-built modules in v2. Why: one real module proves the registry before anyone can build on it.
2. Ship the generic AI builder with Learn. Why: the full vision at once, at roughly twice the validation and permission surface.
3. Registry public, no builder UI. Why: API users can build, nothing for the rest.
