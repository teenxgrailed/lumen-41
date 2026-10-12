# Port 01 — data map: prototype → Prisma → API

Date 2026-10-09. Read-only analysis. Prototype root: `Needt - Design : App, Landing/needt-app/` (paths below are relative to it). Schema: `prisma/schema.prisma`. Routes: `src/app/api/`.
Convention: **MISSING** = no column/table/route today. "derived" = computed, never stored. Owner rulings applied: habits have streaks; the task sheet keeps _First step_ and _Scheduling_ (min block, deadline, split); an _Overlaps_ mark appears only when a calendar event is one side of the overlap.

Name collision to keep in mind: the prototype's `Board / BoardItem / BoardMember` (`Data.js:458-515`) are **moodboards**. Prisma `Board` / `BoardColumn` (schema 1315) is the kanban for tasks. Map to `Moodboard*`, never to `Board`.

The prototype's own table list is `NEEDT.schema` (`Data.js:525-566`). PORT.md §2 describes the same model and is accurate except where noted.

---

## 1. Tasks · subtasks

| Prototype field (file:line)                                                                                                    | Prisma                                          | Type                 | Notes                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------- |
| `id, title` (`Data.js:640+` seed)                                                                                              | `Task.id, title`                                | cuid / String        |                                                                                                           |
| `estimatedMinutes` (`Data.js:191`)                                                                                             | `Task.estimatedMinutes`                         | Int?                 | `duration` is the legacy twin; serializer picks `estimatedMinutes` (`src/lib/needt/task-view.ts:18`)      |
| `dueDate` "YYYY-MM-DD" (`Data.js:194`)                                                                                         | `Task.dueDate`                                  | DateTime?            |                                                                                                           |
| `scheduledStart / scheduledEnd` (`Data.js:162-167`)                                                                            | `Task.scheduledStart/End`                       | DateTime?            | end = start + est, kept by `NEEDT.sync`                                                                   |
| `projectId`                                                                                                                    | `Task.projectId`                                | String?              |                                                                                                           |
| `TaskPart[{id,title,done}]` (`Data.js:199`)                                                                                    | `TaskPart` (schema 911)                         | table                | read by `/api/needt/today`; **no write route** (PUT `/api/tasks/[id]` strips relations)                   |
| `TaskWait{personId,reason}` (`Data.js:200`)                                                                                    | `TaskWait` (schema 929)                         | table                | `waitingOnUserId` must be a User — a waited-on contact who is not a user cannot be stored. No write route |
| `Stage` todo/doing/review/done (`Data.js:201`)                                                                                 | `Task.globalStage`                              | enum TaskStage       |                                                                                                           |
| `status` (`Dialogs.jsx:30`)                                                                                                    | `Task.status`                                   | String               | `review` only exists in `globalStage`; `done` = `status=completed` (derived)                              |
| `isFixed` (`Data.js:198`, `Dialogs.jsx:327`)                                                                                   | `Task.scheduleLocked`                           | Boolean              | PORT.md says "not in DB" — it is; same meaning                                                            |
| `auto` (`Dialogs.jsx:327`)                                                                                                     | `Task.isAutoScheduled`                          | Boolean              | `autoScheduled` is a duplicate column; do not write it                                                    |
| `noSlot`                                                                                                                       | `Task.noSlot`                                   | Boolean              |                                                                                                           |
| `entry` — First step (`Dialogs.jsx:719`)                                                                                       | `Task.entry`                                    | String?              | writable via PUT passthrough (`tasks/[id]/route.ts:148-155`)                                              |
| `chunk` — min block (`Dialogs.jsx:328,657`)                                                                                    | `Task.minChunkMinutes`                          | Int?                 |                                                                                                           |
| "Don't split" (`Dialogs.jsx:27,657`)                                                                                           | **MISSING** `Task.splitAllowed`                 | Boolean default true | null `minChunkMinutes` today means "engine default", not "never split"                                    |
| `deadline`, `hardDeadline` (`Dialogs.jsx:329,471`)                                                                             | `Task.deadline, hardDeadline`                   | DateTime?, Boolean   |                                                                                                           |
| `hours` work/personal/any (`Dialogs.jsx:29,330`)                                                                               | `Task.scheduleId` → `WorkSchedule`              | String?              | any = null; needs seeded "Work"/"Personal" schedules                                                      |
| `priority` urgent/high/medium/low (`Dialogs.jsx:23`)                                                                           | `Task.priorityLevel`                            | enum (has URGENT)    | legacy `Task.priority` String has no urgent                                                               |
| `labels` (`Dialogs.jsx:323`)                                                                                                   | `Tag` m2m                                       |                      | `tagIds` on PUT                                                                                           |
| `repeat` (`Dialogs.jsx:26,324`)                                                                                                | `isRecurring, recurrenceRule`                   | RRULE                |                                                                                                           |
| `holder`                                                                                                                       | `Task.assigneeId`                               | String?              |                                                                                                           |
| `blockedBy` (`Data.js:714-760`)                                                                                                | `Task.dependsOnId`                              | String?              | `TaskDependency` is many-to-many; serializer chose `dependsOnId`                                          |
| `value`, `earned`                                                                                                              | `valueCents, earnedCents`                       | Int?                 | ×100                                                                                                      |
| `description` / `note` (`Dialogs.jsx:94`)                                                                                      | `Task.description`                              | String? (HTML)       |                                                                                                           |
| `attachments [{id,name,…}]` (`Dialogs.jsx:343`)                                                                                | **MISSING** `TaskAttachment`                    | table                |                                                                                                           |
| `trashedAt` (`Data.js:796-806`)                                                                                                | **MISSING** `Task.trashedAt`                    | DateTime?            | `isArchived` is read-only archive (`tasks/[id]/route.ts:137`), not Trash                                  |
| `source {kind:mail\|doc\|chat, id, label, docId, quote}` (`task.jsx:57`, `MailScreen.jsx:110-120`, `DocsScreen.jsx:1850-1858`) | **MISSING** `originKind, originId, originQuote` | String? ×3           | `Task.source` is taken by task-sync (provider name)                                                       |
| `createdAt`                                                                                                                    | `Task.createdAt`                                |                      |                                                                                                           |
| `age`                                                                                                                          | `Task.lastTouchedAt`                            | derived              | days since touch                                                                                          |
| `movedFrom`                                                                                                                    | `Task.previousScheduledStart`                   | derived label        | scheduler must write it — unverified that it does                                                         |
| `overdue`, `tone`, `heat`                                                                                                      | —                                               | derived              | `heat` has no rule server-side (`task-view.ts:151` returns null)                                          |
| `kind` task/event/doc                                                                                                          | —                                               | not stored           | "Convert to…" creates the other object (`Dialogs.jsx:576-577`)                                            |

API: `GET/POST /api/tasks`, `GET/PUT/DELETE /api/tasks/[id]`, `/api/tasks/[id]/dependencies`, `/api/needt/today` (read view). **MISSING**: parts and waits write (`POST/PATCH/DELETE /api/tasks/[id]/parts`, `/waits`), trash/restore.

## 2. Projects

| Prototype (file:line)                                         | Prisma                          | Type            | Notes                       |
| ------------------------------------------------------------- | ------------------------------- | --------------- | --------------------------- |
| `id, name, color, icon` (`Data.js:204-213`, `stores.jsx:554`) | `Project.id, name, color, icon` |                 |                             |
| `ground` (PORT §2)                                            | **MISSING** `Project.ground`    | String?         | frame tint                  |
| manual order, sort `manual\|name\|open` (`stores.jsx:495`)    | **MISSING** `Project.position`  | Float default 0 | sort mode → prefs (§14)     |
| `seed`                                                        | —                               | derived         | built-in marker, not stored |
| remove with undo (`stores.jsx:590`)                           | `Project.status='archived'`     |                 |                             |

API: `GET/POST /api/projects`, `GET/PUT/DELETE /api/projects/[id]`.

## 3. Calendar events · feeds

| Prototype (file:line)                                      | Prisma                                     | Type     | Notes                                                                 |
| ---------------------------------------------------------- | ------------------------------------------ | -------- | --------------------------------------------------------------------- |
| `startAt/endAt` local (`Data.js:328-333`)                  | `CalendarEvent.start/end`                  | DateTime | convert with user TZ                                                  |
| `isAllDay`                                                 | `allDay`                                   | Boolean  | end exclusive in both                                                 |
| `calendarId`                                               | `feedId`                                   | String   | `personal` → the user's LOCAL feed                                    |
| `source` needt/google/apple/outlook                        | `CalendarFeed.type`                        | derived  | LOCAL/GOOGLE/CALDAV/OUTLOOK                                           |
| `externalId`                                               | `externalEventId`                          | String?  |                                                                       |
| title override for synced events (`calendar2.jsx:229-231`) | `CalendarEvent.title` + write-back         |          | no override table needed if PATCH writes to the provider — unverified |
| calendars per account to sync (`stores.jsx:720-729`)       | `CalendarFeed.enabled`                     | Boolean  |                                                                       |
| `declined, allDay, writeBack` (`stores.jsx:153-161`)       | **MISSING** `ConnectedAccount.syncOptions` | Json?    |                                                                       |

API: `/api/events`, `/api/events/[id]`, `/api/feeds`, `/api/feeds/[id]/sync`, `/api/calendar/{google,outlook,caldav}/*`, `/api/needt/calendar`.

## 4. Docs / Pages (style, cover, fonts, body, comments)

| Prototype (file:line)                                                                                              | Prisma                                                                                                                  | Type          | Notes                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `title`                                                                                                            | `Page.title`                                                                                                            |               |                                                        |
| `isFavorite` (UI "Pinned") (`stores.jsx:105`)                                                                      | `Page.isFavorite`                                                                                                       | Boolean       |                                                        |
| `coverUrl` (`Data.js:228`)                                                                                         | `Page.coverUrl`                                                                                                         | String?       | data URLs must become `PageAsset` ids                  |
| `trashedAt` (`stores.jsx:121`)                                                                                     | `Page.trashedAt`                                                                                                        | DateTime?     |                                                        |
| `projectId` (`Data.js:230`)                                                                                        | **MISSING** `Page.projectId`                                                                                            | String? FK    |                                                        |
| `style {backdrop,page,text,separator,font,wide,bdLook,bdBlur,theme,ground}` (`doc-style.jsx:95`, HANDOFF.md:65-75) | **MISSING** `Page.style`                                                                                                | Json?         | font = sans/serif/mono/rounded lives here              |
| `body [kind,text,extra,fmt]` (PORT §3b)                                                                            | `PageBlock (type, content Json, position)`                                                                              | rows          | spans, `fmt.date/remind/task` go in `content`          |
| kind `p h li quote callout code todo table image page date rule`                                                   | PARAGRAPH, HEADING_2, BULLETED_LIST, QUOTE, CALLOUT, CODE, CHECKLIST, TABLE, IMAGE, PAGE_MENTION, DATE_MENTION, DIVIDER | enum          |                                                        |
| kind `lead`, `task`                                                                                                | **MISSING** enum values `LEAD`, `TASK_REF`                                                                              | PageBlockType |                                                        |
| `fmt.comments[{id,text,quote,by,at}]`                                                                              | `PageComment (blockId, body, userId, resolvedAt)`                                                                       | table         | **MISSING** `PageComment.quote`                        |
| mention span `at: email`                                                                                           | inside `content`                                                                                                        |               | no index for "mentioned me" notifications              |
| `updated / viewed / created` labels (`stores.jsx:88-89`)                                                           | `updatedAt`, `createdAt`; viewed **MISSING** `PageView(userId,pageId,viewedAt)`                                         |               | sort "Last viewed" (`doc-style.jsx:351`) is per person |
| `hue`, `label`                                                                                                     | —                                                                                                                       | derived       | from project / grant role                              |
| share: members by email + role (`DocsScreen.jsx:783-797`)                                                          | `PageAccessGrant (userId, role)`                                                                                        |               | by-email invite to a non-user **MISSING**              |
| share: `access: private\|link`, `linkRole view\|edit`                                                              | `PagePublication` (view only)                                                                                           |               | **MISSING** `PagePublication.role`                     |
| share: AI tool access none/read/edit per tool (`DocsScreen.jsx:780-781`)                                           | **MISSING** `PageAiAccess(pageId, tool, level)`                                                                         | table         |                                                        |

API: `/api/pages`, `/api/pages/[id]`, `/blocks`, `/comments`, `/permissions`, `/publication`, `/assets`, `/revisions`, `/api/needt/docs`. **MISSING**: list trashed pages (service filters `trashedAt: null`, `services/pages/page-service.ts:42`).

## 5. Mailbox

Prototype is thread-shaped (`Data.js:398-402`); DB is message-shaped (`MailMessage`, schema 434). Group by `threadId` in the API.

| Prototype                                                                    | Prisma                                                | Type      | Notes                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------- | --------- | ----------------------------------------------- |
| `accountId`                                                                  | `MailMessage.accountId`                               |           |                                                 |
| `subject, from, fromEmail`                                                   | `subject, fromName, fromAddress`                      |           |                                                 |
| `receivedAt`                                                                 | `date`                                                | DateTime  | day label/time derived (`Data.js:405-413`)      |
| `preview`, `body`                                                            | `snippet`, `bodyHtml`                                 |           |                                                 |
| `isRead, isArchived`                                                         | same                                                  | Boolean   |                                                 |
| `to`                                                                         | `toAddresses`                                         | Json      |                                                 |
| `cc, bcc`                                                                    | **MISSING** `ccAddresses, bccAddresses`               | Json?     |                                                 |
| `attachment/attachments [{name,size,type}]`                                  | **MISSING** `MailMessage.attachments`                 | Json?     | metadata only                                   |
| `trashedAt`                                                                  | **MISSING** `MailMessage.trashedAt`                   | DateTime? |                                                 |
| `taskId`                                                                     | via `Task.originKind='mail'` + `originId`             | derived   | one link, queried both ways                     |
| `needsReply`                                                                 | **MISSING** `MailMessage.needsReply`                  | Boolean?  | AI on sync                                      |
| `suggestedTask`                                                              | **MISSING** `MailMessage.suggestedTask`               | String?   | AI on sync                                      |
| `folder sent`                                                                | `labels` (provider SENT)                              | Json      |                                                 |
| `folder drafts` + `inReplyTo, forwardOf, quote, text` (`stores.jsx:388-400`) | — not ported (mail stays read-only, owner 2026-10-09) | —         | Reply/Forward open the message in Gmail/Outlook |

API: `GET /api/mail/messages`, `GET/PATCH /api/mail/messages/[id]`, `/api/mail/accounts`, `/api/mail/sync`. **MISSING**: send, drafts CRUD, trash.

## 6. Habits · streaks · 14-day history

| Prototype (file:line)                              | Prisma                            | Type            | Notes                                                                     |
| -------------------------------------------------- | --------------------------------- | --------------- | ------------------------------------------------------------------------- |
| `title, projectId, archivedAt` (`stores.jsx:217`)  | `Habit.*`                         |                 |                                                                           |
| `schedule.time`                                    | `Habit.at`                        | String? "HH:mm" |                                                                           |
| `schedule.perWeek`                                 | `Habit.quota`                     | Int?            | `targetOccurrencesPerWeek` duplicates it; pick `quota`                    |
| `color` (`Data.js:275`)                            | **MISSING** `Habit.color`         | String?         | null = project colour                                                     |
| `icon`                                             | **MISSING** `Habit.icon`          | String?         |                                                                           |
| `HabitCheckin {habitId,date,done}` (`Data.js:283`) | `HabitCompletion (habitId, date)` | row presence    | untick = delete                                                           |
| 14-day strip, n of 14, n/week (`Data.js:252-271`)  | —                                 | derived         | `/api/needt/today` returns the 14-day window (`prisma-source.ts:284-308`) |
| streak (`Data.js:263-269`)                         | —                                 | derived         | needs up to 400 days, not 14                                              |

API: `GET/POST /api/habits`, `PATCH/DELETE /api/habits/[id]`, `/completions/today`. **MISSING**: tick a past day (`habitApi.toggle(id,on,date)`, `stores.jsx:236-240`).

## 7. Moodboards

DB moodboard is a collaborative canvas (`MoodboardSnapshot.scene`, Yjs state, `services/moodboards/moodboard-document.ts:76`); the prototype is an ordered grid of items.

| Prototype (`Data.js:458-500`)                                                        | Prisma                                | Type                        | Notes                                   |
| ------------------------------------------------------------------------------------ | ------------------------------------- | --------------------------- | --------------------------------------- |
| `Board.id, title, createdAt`                                                         | `Moodboard.*`                         |                             |                                         |
| `projectId`                                                                          | **MISSING** `Moodboard.projectId`     | String?                     |                                         |
| `linkShare`                                                                          | **MISSING** `Moodboard.linkShare`     | Boolean default false       |                                         |
| `pinterestBoardId, pinterestStatus, pinterestSyncedAt`                               | **MISSING** ×3                        | String?, String?, DateTime? | pins never stored                       |
| `trashedAt`                                                                          | **MISSING** `Moodboard.trashedAt`     | DateTime?                   | `archivedAt` hides; Trash needs restore |
| `BoardItem {kind,url,color,text,position,title,ratio,colorName,source,thumbnailUrl}` | **MISSING** `MoodboardItem`           | table                       |                                         |
| `BoardMember {email, role owner/edit/view, name}`                                    | `MoodboardAccessGrant (userId, role)` |                             | by-email invite **MISSING**             |

API: `/api/moodboards`, `/[id]`, `/permissions`, `/snapshots`, `/[id]/items` (GET/POST) and `/[id]/items/[itemId]` (PATCH/DELETE), documented in `docs/connector-api.md`.

## 8. Templates

| Prototype (`places.jsx:243-256`, `stores.jsx:99-102`) | Prisma                                            | Notes                          |
| ----------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| user template `{title, style, body}`                  | `PageTemplate (name, description, snapshot Json)` | style + body inside `snapshot` |
| built-in set `TEMPLATES`                              | —                                                 | code constants                 |

API: `/api/page-templates`, `/[id]`, `/[id]/instantiate`. Complete.

## 9. Shared · permissions

| Prototype (`places.jsx:395-426`)  | Prisma                                      | Notes                                       |
| --------------------------------- | ------------------------------------------- | ------------------------------------------- |
| shared page + `sharedBy` + `role` | `PageAccessGrant.userId / grantedBy / role` | owner→FULL_ACCESS, edit→EDITOR, view→VIEWER |
| workspace people                  | `WorkspaceMember`, `User.hue/initials`      |                                             |

API: `/api/pages/[id]/permissions`. "Shared with me" listing — unverified whether `GET /api/pages` returns grants from other owners; assume **MISSING** `?shared=1`.

## 10. Trash

One place lists tasks, pages, moodboards (and mail). Needs `trashedAt` on Task, MailMessage, Moodboard (above). **MISSING**: `GET /api/trash` (union), restore, purge job after 30 days (`nav-a.jsx:149` "kept for 30 days").

## 11. Focus sessions

| Prototype (`focus.jsx:68-95`, `Dialogs.jsx:717`) | Prisma                                                           | Notes   |
| ------------------------------------------------ | ---------------------------------------------------------------- | ------- |
| `{intention, planned, elapsed, taskId}`          | `FocusSession.intention, plannedMinutes, elapsedMinutes, taskId` |         |
| log row `{d, m, t}`                              | `FocusSession.startedAt, elapsedMinutes, task.title`             | derived |
| series (days in a row)                           | `FocusStats.currentStreak`                                       |         |
| `len, brk` (`stores.jsx:158`)                    | `FocusPreferences.defaultMinutes, shortBreakMinutes`             |         |
| `sound, snapSound, stopMark`                     | prefs Json (§14)                                                 |         |

API: `/api/focus`, `/api/focus/session`, `/api/focus/active`, `/api/focus/target`. Complete.

## 12. Notifications · island

| Prototype (`Notifications.jsx:23-31`, `:49-55`)    | Prisma                                         | Notes      |
| -------------------------------------------------- | ---------------------------------------------- | ---------- |
| `kind` placed/moved/risk/done/agent/person/blocked | `ProactiveNudge.type` covers 4 risk types only |            |
| `title, body, when`                                | `title, body, createdAt`                       |            |
| `acts[]` (buttons)                                 | **MISSING**                                    |            |
| `sticky`, dismissed                                | **MISSING** `dismissedAt`                      |            |
| island text (transient)                            | —                                              | not stored |

Recommendation: **MISSING** `Notification` table (`userId, kind String, title, body, entityKind, entityId, actions Json, readAt, dismissedAt`). API `GET/PATCH /api/notifications` reads `ProactiveNudge` and marks delivered on read.

## 13. Ask Needt / AI

| Prototype (`Chat.jsx:309, 1034, 1433`)                   | Prisma                                   | Notes   |
| -------------------------------------------------------- | ---------------------------------------- | ------- |
| chat `{id, title, at, messages}`                         | `AiConversation (title, updatedAt)`      |         |
| message role/content                                     | `AiMessage.role, content`                |         |
| proposed changes, Apply                                  | `toolName, toolPayload, requiresConfirm` |         |
| `feedback up/down`                                       | **MISSING** `AiMessage.feedback`         | String? |
| @-mentions (task/doc/project/mail/file) (`Chat.jsx:316`) | **MISSING** `AiMessage.refs`             | Json?   |
| usage meter                                              | `AiUsage.actionCount`                    |         |

API: `POST /api/ai/chat`, `GET/POST /api/ai/conversations`. **MISSING**: feedback PATCH, delete/clear history.

## 14. Settings · preferences

Prototype is one map (`stores.jsx:153-161`, `needt.settings`) plus sort keys (`Data.js:534, 554-556`).

| Key                                                                                                                                                                                                                                            | Prisma                                                        | Notes                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `theme`                                                                                                                                                                                                                                        | `UserSettings.theme`                                          |                                                                                     |
| `accent` id ("blue")                                                                                                                                                                                                                           | `UserCustomization.accentColor` (hex)                         | store the id; hex is derived                                                        |
| `start, end, weekends`                                                                                                                                                                                                                         | `AutoScheduleSettings.workHourStart/End/workDays` (Int hours) | "09:30" does not fit Int; `CalendarSettings.workingHoursStart` is String — pick one |
| `week, tz, view`                                                                                                                                                                                                                               | `UserSettings.weekStartDay, timeZone, defaultView`            | tz ids differ ("cet" vs IANA)                                                       |
| `buffer`                                                                                                                                                                                                                                       | `AutoScheduleSettings.bufferMinutes`                          |                                                                                     |
| `connected/apple/google/outlookCal`                                                                                                                                                                                                            | `CalendarFeed.enabled`                                        |                                                                                     |
| `plan, planTime, mailPlan, nudge, review`                                                                                                                                                                                                      | **MISSING** on `NotificationSettings`                         | worker reads them → typed columns                                                   |
| `aura, order, chunk, auto, protect, est, project, parts, money, sound, hideAlerts, snapSound, stopMark, links, offline, uses, sidebarTiles, mobileTiles, taskSchedOpen, docsSort, boardsSort, projectSort, upsellDismissed.*, promo.dismissed` | **MISSING** `UserSettings.prefs`                              | Json default `{}`, UI-only                                                          |
| `needt.dayNotes.*`                                                                                                                                                                                                                             | `DailyAgenda.content`                                         | API `/api/daily-agenda`                                                             |

API: `/api/user-settings`, `/api/customization`, `/api/calendar-settings`, `/api/notification-settings`, `/api/auto-schedule-settings`, `/api/smart-scheduling-settings`.

## 15. Connections

| Prototype (`stores.jsx:661-790`)                                                       | Prisma                                                                            | Notes                                    |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- |
| state map provider → connected/disconnected/connecting                                 | `ConnectedAccount` (calendar), `MailAccount.status`, `ExternalIntegration.status` | derived per provider                     |
| `lost: "Token expired · last sync 06:12"`                                              | `MailAccount.status=ERROR, lastSyncAt`; `CalendarFeed.error, lastSync`            | derived                                  |
| catalog (~30 providers)                                                                | `/api/integrations/catalog`                                                       |                                          |
| MCP / API links `{name,url,scope,permission,access,projectIds}` (`stores.jsx:849-880`) | **MISSING** `AccessLink`                                                          | `ConnectorSettings` holds one token only |

API: `/api/accounts`, `/api/integrations/*`, `/api/integration-status`, `/api/connector-settings`. **MISSING**: links CRUD + rotate.

## 16. Onboarding

| Prototype (`AuthScreen.jsx:446-452, 855-857`) | Prisma                                   | Notes                                                                                 |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------- |
| `uses[]`                                      | **MISSING** `User.onboardingUses`        | String[]                                                                              |
| `start, end, tz`                              | settings (§14)                           |                                                                                       |
| `sidebarTiles`                                | prefs                                    |                                                                                       |
| first task                                    | `Task`                                   |                                                                                       |
| done flag                                     | **MISSING** `User.onboardingCompletedAt` | `/api/onboarding` derives steps from data; it cannot tell "skipped" from "never seen" |

## 17. Paywall · subscription

| Prototype (`paywall.jsx:46-84`)                         | Prisma                                              | Notes                                      |
| ------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| `free\|trial\|monthly\|yearly\|lifetime`                | `Subscription.plan, interval` + `TrialGrant.endsAt` | derived                                    |
| trial days left (`PW_TRIAL_LEFT = 9`, `paywall.jsx:50`) | `TrialGrant.endsAt`                                 | derived                                    |
| lifetime available                                      | `isLifetimeCheckoutAvailable`                       | `/api/billing` returns `lifetimeAvailable` |

API: `/api/billing`, `/checkout`, `/portal`, `/webhook`. Complete.

---

## 3. Migrations (expand only; all nullable or defaulted; nothing renamed or dropped)

**M1 `20261009100000_port_expand_columns`** — columns on existing tables.

- `Task.trashedAt DateTime?` + index `(userId, trashedAt)` — Trash distinct from read-only archive.
- `Task.originKind, originId, originQuote String?` + index `(originKind, originId)` — "From …" chip and mail/doc → task link both ways.
- `Task.splitAllowed Boolean @default(true)` — "Don't split" in Scheduling.
- `Project.ground String?`, `Project.position Float @default(0)` — card tint, manual order.
- `Habit.color String?`, `Habit.icon String?` — habit's own colour and glyph.
- `Page.style Json?`, `Page.projectId String?` (FK SetNull, index) — document style; docs in projects.
- `PageComment.quote String?` — the words a comment hangs on.
- `PagePublication.role PageAccessRole @default(VIEWER)` — link that can edit.
- `MailMessage.trashedAt DateTime?, ccAddresses Json?, bccAddresses Json?, attachments Json?, needsReply Boolean?, suggestedTask String?` — thread sheet and inbox.
- `Moodboard.projectId String?, linkShare Boolean @default(false), pinterestBoardId String?, pinterestStatus String?, pinterestSyncedAt DateTime?, trashedAt DateTime?` — boards as the prototype draws them.
- `AiMessage.feedback String?, refs Json?` — thumbs and @-mentions.
- `UserSettings.prefs Json @default("{}")` — UI-only preferences in one map.
- `NotificationSettings.dailyPlan Boolean @default(true), dailyPlanTime String @default("08:30"), mailPlan Boolean @default(false), nudges Boolean @default(false), weeklyReview Boolean @default(true)` — the worker sends these.
- `ConnectedAccount.syncOptions Json?` — declined / all-day / write-back.
- `User.onboardingUses String[] @default([])`, `User.onboardingCompletedAt DateTime?` — onboarding answers and finish.

**M2 `20261009110000_port_new_tables`**

- `TaskAttachment (taskId, name, mimeType, size, bytes|url, createdAt)` — files on a task.
- `PageView (userId, pageId, viewedAt)` unique `(userId,pageId)` — "Last viewed" per person.
- `ShareInvite (resourceKind page|moodboard, resourceId, email, role, invitedById, tokenHash, expiresAt, acceptedAt)` — share with someone who has no account; one table for both resources.
- `PageAiAccess (pageId, tool, level)` — per-tool AI access on a page.
- `MoodboardItem (moodboardId, kind, url, color, text, title, ratio, colorName, source Json, thumbnailUrl, position Float, createdAt)` — the grid.
- `Notification (userId, kind String, title, body, entityKind, entityId, actions Json, readAt, dismissedAt, createdAt)` — notification cards.
- `AccessLink (userId, kind mcp|api, name, tokenHash, tokenPreview, scope, permission, access, projectIds String[], createdAt, revokedAt)` — several MCP/API links.

**M3 `20261009120000_page_block_types`** — own migration because `ALTER TYPE … ADD VALUE` must not share a transaction with use of the value.

- `PageBlockType` add `LEAD`, `TASK_REF` — two block kinds the editor writes.

---

## 4. What the prototype shows that the backend cannot produce yet

| Shown (file:line)                                                                                                                                              | Computation needed                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Phone menu "what is waiting there" (`nav-a.jsx:135-155`); counts are partly mock (`mobile-nav.jsx:41-71`: `nextEvent`, `docsEdited`, `habitsDone=2`, `synced`) | One `GET /api/needt/counts`: overdue (open, `dueDate < today`, not `noSlot`), left today, open, unplaced (open ∧ ¬scheduleLocked ∧ ¬noSlot ∧ no `scheduledStart`), unread mail (live, unread, not trashed), next event today + minutes until, page count + max `updatedAt`, habits kept today / live habits, live moodboards, projects, last successful sync (max `CalendarFeed.lastSync`/`MailAccount.lastSyncAt`), trash count, any account in ERROR |
| Sidebar mail badge "12" static (`sidebar-kit.jsx:15`)                                                                                                          | same unread count                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Week load (`HomeToday.jsx:449-500, 673-682`)                                                                                                                   | per day d in next 7: `cap(d)` = working minutes from the work schedule (0 on non-work days); `planned(d)` = Σ `estimatedMinutes` of open tasks due on d (not overdue, not noSlot) + Σ minutes of events on d inside working hours. Over = planned > cap. `/api/tasks/capacity` returns only range totals (`services/scheduling/capacity.ts:71-80`) — add a `days[]` breakdown                                                                          |
| Overlaps mark (`mobile-v2-plates.jsx:200-207, 318, 357`)                                                                                                       | pairs whose intervals intersect, **kept only if at least one side is a CalendarEvent** (owner). The prototype also marks task–task; change `v2pOverlaps` when porting. Server: per day, events × (events ∪ timed tasks)                                                                                                                                                                                                                                |
| Day streak (`Data.js:686-702`, `HomeToday.jsx:661`)                                                                                                            | `ClosedDay` rows exist; nothing writes them. End-of-day worker job: day closed iff every task with `dueDate`=d is completed                                                                                                                                                                                                                                                                                                                            |
| Habit streak (`Data.js:263-269`)                                                                                                                               | consecutive days with a completion, ending today if kept else yesterday; needs a query beyond the 14-day window                                                                                                                                                                                                                                                                                                                                        |
| `heat` (category flame)                                                                                                                                        | no rule exists (`task-view.ts:151`); define, e.g. share of project's open value or recency of touches                                                                                                                                                                                                                                                                                                                                                  |
| `movedFrom`                                                                                                                                                    | scheduler must set `previousScheduledStart` on every move — verify                                                                                                                                                                                                                                                                                                                                                                                     |
| Mail `needsReply`, `suggestedTask`                                                                                                                             | AI classification at sync time                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Doc "20 min ago", "Last viewed" sort                                                                                                                           | from `updatedAt` and `PageView`                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Trial days left / Lifetime                                                                                                                                     | from `TrialGrant.endsAt`; `lifetimeAvailable` exists                                                                                                                                                                                                                                                                                                                                                                                                   |
| Trash "kept for 30 days"                                                                                                                                       | purge job: hard-delete rows with `trashedAt < now − 30d`                                                                                                                                                                                                                                                                                                                                                                                               |

---

## 5. Open questions for the owner (recommended default in bold)

1. **Moodboards: canvas or grid?** The DB stores a free canvas; the prototype draws an ordered grid. **Grid (`MoodboardItem`) is the truth; the canvas tables stay untouched until a contract migration.**
2. **Trash vs archive.** **Separate `trashedAt` on Task, MailMessage and Moodboard; restorable for 30 days, then hard-deleted by the worker.** Archive stays as it is.
3. **"Don't split."** **Add `splitAllowed` (default true).** "Don't split" sets it to false; min block keeps `minChunkMinutes`.
4. **Priority.** **Write only `priorityLevel` (URGENT/HIGH/MEDIUM/LOW).** Read the legacy `priority` string as a fallback until a contract migration.
5. **Sharing with people who have no account.** **One `ShareInvite` table for pages and moodboards; accepting it creates the grant.**
6. **Preferences storage.** **UI-only keys in `UserSettings.prefs` Json; anything the server or worker reads (hours, time zone, plan time, review, nudges) gets a typed column.** Working hours use one source: the default `WorkSchedule`.
7. **Mail drafts and sending.** **Decided 2026-10-09: mail stays read-only.** No `MailDraft`, no send scopes (gmail.send is restricted → verification/CASA). Reply and Forward deep-link to the message in the provider; archive and "make a task" work in Needt.
8. **Notifications.** **A new `Notification` table that every producer writes to**, including nudges later. `ProactiveNudge` stays as the dedupe and delivery log.

## Owner decisions (2026-10-09)

All eight defaults accepted, except 7: mail stays read-only (no drafts, no sending). Habits keep streaks; the task sheet keeps First step and Scheduling; Overlaps only when a calendar event is involved.
