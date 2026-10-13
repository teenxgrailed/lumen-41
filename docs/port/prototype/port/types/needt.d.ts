/* needt.d.ts — TypeScript types for the Needt prototype, read from the code (09.10.26).
 *
 * Sources (one fact, one home):
 *   Data.js        NEEDT.schema (every stored key), the seed rows, migrations, Task / Habit /
 *                  Event / MailThread / Board helpers
 *   stores.jsx     SETTINGS_DEFAULTS + needtSettings, docs, habits, mail (+ mailOut), boards,
 *                  projects, connections, MCP / API links
 *   doc-style.jsx  Doc.style, rich-text spans (DX_*), the doc sort
 *   DocsScreen.jsx bodyToBlocks / blocksToBody (the block tuple), docShare
 *   calendar2.jsx  Event seed;  Chat.jsx  Chat / messages / cards;  focus.jsx  FocusSession
 *   sync.js        needtSync, Change, Transport;  platform.js  needtPlatform;  app-boot.js  needtApp
 *   phone-kit.jsx  the phone kit's public props (its top comment), pkDay;
 *   mobile-v2-plates.jsx  PkPlaces registry and PlaceProps
 *
 * Rows are the stored shape = the future DB row. Every synced row additionally gets
 * { id, updatedAt, deletedAt, rev, updatedBy } in the DB (SyncStamp) — in the prototype those
 * live beside the data in needt.sync.meta.<key>, never inside the row.
 * Fields marked "NEW" are in PORT.md §2 "New fields (not in DB yet)".
 *
 * Checked with: npx -y typescript@5 tsc --noEmit --strict port/types/needt.d.ts
 * JSON schemas for the fixtures are generated from the exported row types
 * (port/tools/validate-fixtures.js).
 */

/* ───────────────────────────── primitives ───────────────────────────── */

/** "YYYY-MM-DD" (local day). */
export type IsoDay = string;
/** "YYYY-MM-DDTHH:mm" (local, no zone) — scheduledStart, Event.startAt, MailThread.receivedAt. */
export type LocalStamp = string;
/** Full ISO timestamp "2026-10-09T18:01:51.453Z" — trashedAt, createdAt, archivedAt. */
export type IsoTimestamp = string;
/** "HH:mm". */
export type HHmm = string;
/** A CSS colour value, usually a token reference: "var(--hue-orange)", "#1c1c1c". */
export type CssColor = string;
/** Epoch milliseconds. */
export type EpochMs = number;

/* ───────────────────────────── sync stamps ───────────────────────────── */

/** Columns every synced table gets in the database (not stored in prototype rows). */
export interface SyncStamp {
  id: string;
  userId: string;
  updatedAt: IsoTimestamp;
  /** soft delete (tombstone kept 30 days) */
  deletedAt: IsoTimestamp | null;
  rev: number;
  /** "device:tab" */
  updatedBy: string;
}
/** needtSync.collection(key).meta(id) */
export interface RecordMeta {
  id: string;
  updatedAt: IsoTimestamp | null;
  deletedAt: IsoTimestamp | null;
  rev: number;
  by: string;
}

/* ───────────────────────────── Project ───────────────────────────── */

export type SeedProjectId = "ops" | "ds" | "german" | "resale" | "life";
/** Seed ids, or "p-<base36>" / "p-<slug>" for the user's own. */
export type ProjectId = SeedProjectId | (string & {});
/** Project card frame tint (NEW). */
export type ProjectGround = "mist" | "sand" | "sage" | "stone" | (string & {});

/** needt.projects.all → Project */
export interface Project {
  id: ProjectId;
  name: string;
  /** was `hue`; a CSS colour, seeds use var(--hue-*) */
  color: CssColor | null;
  /** lucide icon name, was `glyph`; user projects default "folder" */
  icon: string | null;
  /** NEW — frame tint of the project card */
  ground?: ProjectGround | null;
  /** NEW (computed) — marks a built-in project; not meant for storage */
  seed?: boolean;
}
/** needt.projects.sort → UserSettings.projectSort */
export type ProjectSort = "manual" | "name" | "open";

/* ───────────────────────────── Task ───────────────────────────── */

export type TaskId = number | string;
export type StageId = "todo" | "doing" | "review" | "done";
export type TaskStatus = "todo" | "in_progress" | "review" | "done";
export type TaskPriority = "urgent" | "high" | "medium" | "low";
export type TaskTone = "info" | "accent" | "success" | (string & {});

/** One level of subtasks; ids "<taskId>.<n>". */
export interface TaskPart {
  id: string;
  title: string;
  done: boolean;
}
/** Waiting on a person (was `waitsOn`). */
export interface TaskWait {
  personId: PersonId;
  reason: string;
}
export interface FileRef {
  name: string;
  size: number;
  type: string;
}
/** Where a task came from — the "From …" chip. */
export type TaskSource =
  | { kind: "doc"; docId: string; quote: string }
  | { kind: "mail"; label: string; id: MailThreadId }
  | { kind: string; label?: string; id?: string | number; docId?: string; quote?: string };

/** needt.tasks → Task */
export interface Task {
  id: TaskId;
  title: string;
  projectId?: ProjectId | null;
  /** NEW — closed or not */
  done: boolean;
  /** NEW — overlaps Stage + done */
  status?: TaskStatus;
  dueDate?: IsoDay | null;
  /** minutes (was `est`) */
  estimatedMinutes?: number | null;
  scheduledStart?: LocalStamp | null;
  /** = scheduledStart + estimatedMinutes (default 30); recomputed by NEEDT.sync, never typed */
  scheduledEnd?: LocalStamp | null;
  /** NEW — time set by hand, the planner must not move it (was `time`) */
  isFixed?: boolean;
  TaskPart?: TaskPart[];
  TaskWait?: TaskWait | null;
  Stage?: StageId;
  /** soft delete into Trash */
  trashedAt?: IsoTimestamp | null;
  /** NEW — task that must close first */
  blockedBy?: TaskId | null;
  /** NEW — who holds the task (a person id) */
  holder?: PersonId | null;
  /** NEW — belongs to no day: no rail, not in the unplaced queue */
  noSlot?: boolean;
  /** NEW — two-minute first step (a one-line field on both task editors; null when cleared) */
  entry?: string | null;
  /** NEW (computed) — 0–1 intensity for the category flame */
  heat?: number;
  /** NEW (computed) — legacy accent tone for old block designs */
  tone?: TaskTone;
  /** NEW — money a resale task is worth */
  value?: number;
  /** NEW — money already received */
  earned?: number;
  /** NEW (computed) — "HH:mm" the scheduler moved it from */
  movedFrom?: HHmm | null;
  /** NEW (computed) — days untouched; the title fades past 21 */
  age?: number;
  /** NEW (computed) — past its date and open */
  overdue?: boolean;
  /** NEW — "From …" */
  source?: TaskSource | null;
  /** NEW — task-dialog settings */
  auto?: boolean;
  deadline?: IsoDay | null;
  hardDeadline?: boolean;
  kind?: "task" | "event" | "doc";
  /** minimum work block, minutes; null = don't split */
  chunk?: number | string | null;
  /** which hours the planner may use (default "work") */
  hours?: "work" | "personal" | "any";
  /** NEW — task-dialog Repeat chip */
  repeat?: "daily" | "weekdays" | "weekly" | "monthly" | null;
  /** NEW — stamped by the desktop task dialog (created on duplicate, updated on every edit) */
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp | null;
  priority?: TaskPriority | null;
  labels?: string[];
  /** Notes — plain text (newlines kept), the one field both task editors and the focus window write.
   *  Older `description` (desktop HTML / phone text) and `note` are folded into it by NEEDT.migrateTask. */
  notes?: string | null;
  attachments?: FileRef[];
}

/* ───────────────────────────── People, stages, calendars ───────────────────────────── */

export type PersonId = "you" | "anna" | "tom" | "lena" | (string & {});
export interface Person {
  id: PersonId;
  name: string;
  initials: string;
  hue: CssColor;
}
export interface Stage {
  id: StageId;
  name: string;
}
export type CalendarId = "work" | "personal" | "family" | (string & {});

/* ───────────────────────────── Doc ───────────────────────────── */

/** A Choose-a-Color id (DX_COLORS → --pdc2-c-<id>). */
export type TextColorId =
  | "default" | "gray" | "brown" | "red" | "orange" | "amber" | "yellow" | "lime" | "green"
  | "teal" | "cyan" | "sky" | "blue" | "indigo" | "violet" | "purple" | "pink" | "rose";
/** A highlight id (DX_HLS → --dsp-hl-<id>). */
export type HighlightId = "yellow" | "orange" | "red" | "pink" | "purple" | "blue" | "green" | "gray";

/** One run of rich text. Stored canonical (dxNorm): equal neighbours merged, empty spans dropped. */
export interface Span {
  t: string;
  b?: boolean;
  i?: boolean;
  s?: boolean;
  code?: boolean;
  /** http(s): / mailto: only (dxSafeHref) */
  href?: string;
  color?: TextColorId;
  hl?: HighlightId;
  /** a mention: the person's email; the words are "@Name" */
  at?: string;
}
/** A plain string (no marks) or spans. */
export type RichText = string | Span[];

export interface DocComment {
  id: string;
  text: string;
  quote: string;
  /** author (email or name) */
  by: string;
  at: IsoTimestamp | EpochMs;
  resolvedAt?: IsoTimestamp | null;
}
/** Slot 4 of a block — per-block data (not formatting). In the DB, comments → DocComment table. */
export interface BlockFmt {
  /** the date block's ISO day */
  date?: IsoDay;
  /** a reminder (the task it made) */
  remind?: { id: TaskId; label: string } | null;
  /** the task made from words in the block */
  task?: { id: TaskId; title: string } | null;
  comments?: DocComment[];
  /** OLD block-level format, read as marks over the whole text (dxMigrateBlock) and written back as spans */
  b?: boolean;
  i?: boolean;
  s?: boolean;
  color?: TextColorId | null;
}
export type DocTextKind = "p" | "h" | "li" | "quote" | "callout" | "code" | "lead" | "event" | "habit" | "ask";
/** slot 3 of a text block: `p` → { muted }; anything else unknown is kept as-is by both editors */
export type DocBlockExtra = { muted?: boolean } | string | number | boolean | null;
/**
 * Doc body block: [kind, text, extra?, fmt?].
 *   p h li quote callout code lead → rich text (p: extra { muted })
 *   todo → rich text, extra true = done · task → title, extra = meta line
 *   table → rows [[cell]] · cards → string[] (legacy demo) · image → data URL / URL ("" = empty)
 *   page → linked doc id · date → label ("Fri 4 Sep"), the ISO day is fmt.date
 *   rule · shot · suggest → no content
 */
export type DocBlock =
  | [DocTextKind, RichText]
  | [DocTextKind, RichText, DocBlockExtra]
  | [DocTextKind, RichText, DocBlockExtra, BlockFmt | null]
  | ["todo", RichText]
  | ["todo", RichText, boolean | null]
  | ["todo", RichText, boolean | null, BlockFmt | null]
  | ["task", RichText]
  | ["task", RichText, string | null]
  | ["task", RichText, string | null, BlockFmt | null]
  | ["table", string[][]]
  | ["table", string[][], null, BlockFmt | null]
  | ["cards", string[]]
  | ["cards", string[], null, BlockFmt | null]
  | ["image", string]
  | ["image", string, null, BlockFmt | null]
  | ["page", string]
  | ["page", string, null, BlockFmt | null]
  | ["date", string]
  | ["date", string, null, BlockFmt | null]
  | ["rule"]
  | ["shot"]
  | ["suggest"];

export type DocBackdrop = "none" | "sparkle" | "dunes" | "mist" | "grid" | "ink" | "sage" | "ocean";
export type DocPage = "white" | "paper" | "rose" | "lilac" | "sage" | "sky" | "sand" | "graphite" | "black";
export type DocText = "auto" | "dark" | "light" | "umber" | "wine" | "plum" | "navy" | "forest";
export type DocSeparator = "line" | "dots" | "wave";
export type DocFont = "sans" | "serif" | "mono" | "rounded";
/** Doc.style — one object (dcSetStyle). Defaults: DC_DEFAULT. Cover is top-level Doc.coverUrl. */
export interface DocStyle {
  backdrop?: DocBackdrop;
  page?: DocPage;
  text?: DocText;
  separator?: DocSeparator;
  font?: DocFont;
  wide?: boolean;
  /** NEW — backdrop look (phone Page Style) */
  bdLook?: "immersive" | "faded";
  /** NEW — backdrop picture blurred 22 px */
  bdBlur?: boolean;
  /** NEW — legacy preset ids an old page still wears (map 1:1 until the first edit) */
  theme?: string;
  ground?: string;
}

/** needt.docs → Doc */
export interface Doc {
  id: string;
  title: string;
  projectId?: ProjectId | null;
  /** UI label "Pinned" (was starred) */
  isFavorite: boolean;
  /** data URL, "art:<id>" or null (was style.cover) */
  coverUrl: string | null;
  trashedAt: IsoTimestamp | null;
  style: DocStyle | null;
  body: DocBlock[];
  /** NEW (computed) — cached project colour for cards */
  hue?: CssColor | null;
  /** NEW (computed) — human labels, should come from the timestamps below */
  updated?: string;
  viewed?: string;
  created?: string;
  createdAt?: IsoTimestamp;
  updatedAt?: IsoTimestamp;
  viewedAt?: IsoTimestamp;
  /** NEW (computed) — folder line for Template / Shared cards without a project */
  label?: string;
}

/** needt.templates → Template (the user's own; built-ins are code). */
export interface Template {
  id: string;
  title: string;
  style: DocStyle | null;
  body: DocBlock[];
  label?: string;
  /** "5 blocks" */
  meta?: string;
}

export type DocSortKey = "name" | "viewed" | "created" | "updated";
/** needt.docsSort */
export interface DocsSort {
  key: DocSortKey;
  dir: "asc" | "desc";
}
/** needt.mbSort (moodboards) */
export interface BoardsSort {
  key: "name" | "created" | "updated";
  dir: "asc" | "desc";
}
export type ShareRole = "owner" | "edit" | "view" | "comment";
export type AiToolId = "claude" | "chatgpt" | "cursor" | "gemini" | "perplexity" | "othermcp";
/** needt.docShare: doc id → its sharing (DocsScreen dcShareBlank). */
export interface DocShareEntry {
  members: { email: string; name?: string; role: ShareRole }[];
  access: "private" | "link";
  linkRole: "view" | "edit" | "comment";
  /** per AI tool: what it may do on this page */
  ai: Partial<Record<AiToolId, "none" | "read" | "edit">>;
}
export type DocShare = Record<string, DocShareEntry>;

/* ───────────────────────────── Habit ───────────────────────────── */

export interface HabitSchedule {
  time: HHmm | null;
  /** null = every day */
  perWeek: number | null;
}
/** needt.habits → Habit */
export interface Habit {
  /** seeds: "de", "walk"…; new: "h-<base36>" */
  id: string;
  title: string;
  projectId: ProjectId | null;
  /** null = the project's colour */
  color: CssColor | null;
  icon: string | null;
  schedule: HabitSchedule;
  archivedAt: IsoTimestamp | null;
}
/** needt.habitCheckins → HabitCheckin; record id = `${habitId}|${date}`. A miss is a missing row. */
export interface HabitCheckin {
  habitId: string;
  date: IsoDay;
  done: boolean;
}

/* ───────────────────────────── Event ───────────────────────────── */

export type EventSource = "needt" | "google" | "apple" | "outlook";
/** needt.events → Event (+ the synced seed C2_EVENTS). All-day: …T00:00 to the next day (end exclusive). */
export interface CalendarEvent {
  /** "u<base36>" (own), "sync-<provider>-n" / seed "e1"… (synced) */
  id: string;
  title: string;
  startAt: LocalStamp | null;
  endAt: LocalStamp | null;
  isAllDay: boolean;
  calendarId: CalendarId;
  source: EventSource;
  externalId: string | null;
}
/** needt.events.titles → EventOverride: event id → title (write back to the provider). */
export type EventTitleOverrides = Record<string, string>;

/* ───────────────────────────── Mail ───────────────────────────── */

export type MailThreadId = number | string;
export type MailAccountId = "gmail" | "outlook" | (string & {});
export interface MailAddress {
  name: string;
  email: string;
}
/** needt.mail.threads → MailThread. folder null = received; "sent" / "drafts" = the user's own. */
export interface MailThread {
  id: MailThreadId;
  accountId: MailAccountId;
  subject: string;
  from: string;
  fromEmail: string | null;
  receivedAt: LocalStamp | null;
  preview: string;
  /** paragraphs */
  body: string[];
  /** legacy single attachment label "proof.pdf · 2.4 MB" */
  attachment: string | null;
  isRead: boolean;
  isArchived: boolean;
  trashedAt: IsoTimestamp | null;
  /** the task made from it */
  taskId: TaskId | null;
  needsReply: boolean;
  suggestedTask: string | null;
  folder: "sent" | "drafts" | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  attachments: FileRef[];
  /** own mail (sent / drafts) */
  text?: string;
  inReplyTo?: MailThreadId | null;
  forwardOf?: MailThreadId | null;
  quote?: string | null;
}
/** mailApi.compose / reply / forward → a draft */
export interface MailDraft {
  id: MailThreadId | null;
  accountId: MailAccountId;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  subject: string;
  text: string;
  attachments: FileRef[];
  inReplyTo: MailThreadId | null;
  forwardOf: MailThreadId | null;
  quote: string | null;
}

/* ───────────────────────────── Boards ───────────────────────────── */

/** needt.boards → Board */
export interface Board {
  id: string;
  title: string;
  projectId: ProjectId | null;
  linkShare: boolean;
  /** pins are never stored — only the linked board */
  pinterestBoardId: string | null;
  trashedAt: IsoTimestamp | null;
  createdAt?: IsoTimestamp;
  pinterestStatus?: "ok" | "lost" | (string & {}) | null;
  pinterestSyncedAt?: IsoTimestamp | null;
}
export type BoardItemKind = "image" | "link" | "color" | "note";
/** needt.boardItems → BoardItem */
export interface BoardItem {
  id: string;
  boardId: string;
  kind: BoardItemKind;
  /** image: data URL / URL (→ an upload URL in the backend); link: the URL */
  url: string | null;
  color: CssColor | null;
  text: string | null;
  position: number;
  title?: string;
  /** height / width */
  ratio?: number;
  colorName?: string;
  source?: { name: string; domain: string } | null;
  thumbnailUrl?: string | null;
  createdAt?: IsoTimestamp;
}
/** needt.boardMembers → BoardMember; record id = `${boardId}|${email}` */
export interface BoardMember {
  boardId: string;
  email: string;
  role: "owner" | "edit" | "view";
  name?: string;
}

/* ───────────────────────────── Chat ───────────────────────────── */

export interface ChatTimelineRow {
  time: string;
  title: string;
  fresh?: boolean;
  busy?: boolean;
}
export type ChatCard =
  | { kind: "timeline"; title: string; rows: ChatTimelineRow[] }
  | { kind: "draft"; to: string | null; subject: string; text: string }
  | { kind: "changes"; changes: unknown[] }
  | { kind: "tasks"; label: string; items: unknown[] }
  | { kind: "overdue"; items: { id: TaskId; title: string; due: string; len: string }[] }
  | { kind: "doc"; docId?: string; id?: string; title: string; bullets?: string[]; meta?: string }
  | { kind: "slots"; items: unknown[] }
  | { kind: "found"; items: unknown[] };
/** the chip a question is scoped to (task / doc / day / workspace / project / file) */
export interface ChatContextChip {
  kind: "task" | "doc" | "day" | "workspace" | "project" | "file";
  id?: string | number;
  title?: string;
  chip?: string;
  sub?: string;
  art?: string;
  section?: string;
  meta?: string;
}
export interface ChatMessage {
  id: string;
  from: "you" | "needt";
  text: string;
  at: EpochMs;
  /** "This day" | "Everything" | … */
  scope?: string;
  /** what Needt looked at */
  scopeLine?: string;
  cards?: ChatCard[] | null;
  followups?: string[] | null;
  feedback?: "up" | "down" | null;
  context?: ChatContextChip[];
}
/** needt.chats → Chat ("c-…") */
export interface Chat {
  id: string;
  title: string;
  at: EpochMs;
  messages: ChatMessage[];
}

/* ───────────────────────────── Connections, links, plan ───────────────────────────── */

export type ConnectionState = "connected" | "disconnected" | "connecting" | "none";
export type KnownProviderId =
  | "gmail" | "outlook" | "icloudmail" | "protonmail" | "fastmail" | "slack" | "telegram" | "discord"
  | "gcal" | "ical" | "ocal" | "gdrive" | "figma" | "pinterest" | "notion" | "github" | "linear"
  | AiToolId;
export type ProviderId = KnownProviderId | (string & {});
/** needt.connections → Connection: provider id → state (CONN_DEFAULT seeds six) */
export type Connections = Partial<Record<ProviderId, ConnectionState>>;
/** needt.connections.sync → Connection.sync: provider id → "last synced" label (CN_SYNC_SEED) */
export type ConnectionSyncLabels = Partial<Record<ProviderId, string>>;
/** CN_CAL_SYNC — calendar provider → its needtSettings switch and the calendars it shows */
export type CalendarSyncDef = Record<"gcal" | "ical" | "ocal", { key: "google" | "apple" | "outlookCal"; cals: [string, string][] }>;

/** needt.mcpLinks / needt.apiLinks → AccessLink (kind mcp | api) */
export interface AccessLink {
  /** "lnk_<10>" */
  id: string;
  name: string;
  /** the secret URL (rotated by regenerate) */
  url: string;
  scope: "all" | "daily" | "projects";
  permission: "read" | "write";
  access: "private" | "public";
  projectIds: ProjectId[];
  createdAt: IsoTimestamp;
}
/** needt.plan.state → Subscription.plan (server-owned in the real API) */
export type PlanState = "free" | "trial" | "monthly" | "yearly" | "lifetime";

/** needt.focus.log → FocusSession (append log, last 400; a table in the DB) */
export interface FocusSession {
  /** ISO day */
  d: IsoDay;
  /** minutes */
  m: number;
  /** what was focused on */
  t: string;
}

/** needt.sidebar.v2 → UserSettings.sidebar */
export interface SidebarLayout {
  places: { id: SidebarPlaceId; on: boolean }[];
  sections: { id: "starred" | "projects" | (string & {}); on: boolean }[];
  collapsed: Record<string, boolean>;
}
export type SidebarPlaceId =
  | "today" | "calendar" | "tasks" | "docs" | "mail" | "projects" | "moodboards" | "habits"
  | "templates" | "shared" | "trash" | (string & {});

/* ───────────────────────────── Settings ───────────────────────────── */

export type ThemeSetting = "system" | "light" | "dark" | "time";
export type AccentId = "blue" | "pink" | "mint" | "violet" | "amber" | "graphite" | "aurora" | "sunset" | "lagoon";
/** Minutes as the select stores them: a string ("30"). */
export type MinutesString = string;

/**
 * needt.settings → UserSettings (a map: each key syncs as its own record).
 * Defaults = stores.jsx SETTINGS_DEFAULTS (shown as @default); keys without a default are set
 * by a screen and read with a fallback (shown as "fallback"). One writer: needtSettings.set(k, v).
 */
export interface Settings {
  /** @default "light" */ theme: ThemeSetting;
  /** @default "blue" */ accent: AccentId;
  /** Sky aura behind the shell. @default true */ aura: boolean;
  /** Working hours start. @default "09:00" */ start: HHmm;
  /** Working hours end. @default "18:00" */ end: HHmm;
  /** @default "mon" */ week: "mon" | "sun";
  /** @default "cet" */ tz: "cet" | "utc" | "est";
  /** Plan my day puts first. @default "deadline" */ order: "deadline" | "short" | "project";
  /** Min work block. @default "30" */ chunk: MinutesString;
  /** Buffer between blocks. @default "10" */ buffer: MinutesString;
  /** Auto-schedule. @default true */ auto: boolean;
  /** Protect focus time. @default true */ protect: boolean;
  /** Schedule on weekends. @default false */ weekends: boolean;
  /** Calendars chosen in onboarding. @default ["apple","google"] */ connected: string[];
  /** Apple calendar sync on. @default true */ apple: boolean;
  /** Google calendar sync on. @default true */ google: boolean;
  /** Outlook calendar sync on. @default true */ outlookCal: boolean;
  /** Show declined events. @default false */ declined: boolean;
  /** Show all-day events. @default true */ allDay: boolean;
  /** Write event changes back to the provider. @default true */ writeBack: boolean;
  /** Calendar view. @default "week" */ view: "week" | "days";
  /** Default estimate. @default "45" */ est: MinutesString;
  /** Default project. @default "none" */ project: "none" | ProjectId;
  /** Subtasks on. @default true */ parts: boolean;
  /** Money fields on. @default true */ money: boolean;
  /** Focus length. @default "50" */ len: MinutesString;
  /** Focus break. @default "10" */ brk: MinutesString;
  /** Focus start sound. @default "none" */ sound: "none" | "tick" | "chime";
  /** Hide alerts while focusing. @default true */ hideAlerts: boolean;
  /** @default false */ snapSound: boolean;
  /** @default true */ stopMark: boolean;
  /** Daily plan notification. @default true */ plan: boolean;
  /** Include mail in the plan. @default false */ mailPlan: boolean;
  /** @default "08:30" */ planTime: HHmm;
  /** @default false */ nudge: boolean;
  /** Weekly review. @default true */ review: boolean;
  /** Open document links in. @default "ask" */ links: "ask" | "web" | "app";
  /** Offline copy. @default true */ offline: boolean;
  /* --- no default in SETTINGS_DEFAULTS (set by a screen, read with a fallback) --- */
  /** Phone menu A's three places (+ "ask"). fallback mobile-nav MN_DEFAULT_TILES ["home","docs","ask"] */ mobileTiles?: string[];
  /** Desktop sidebar places in order. fallback: the sidebar's own layout */ sidebarTiles?: string[];
  /** Hide done tasks in the calendar. fallback false */ calHideDone?: boolean;
  /** Notifications master switch. fallback true */ notify?: boolean;
  /** Share anonymous usage data. fallback false */ usage?: boolean;
  /** What Needt is used for (onboarding). fallback ["work"] */ uses?: string[];
  /** Task dialog's scheduling section open. fallback false */ taskSchedOpen?: boolean;
  /** Projects screen layout. fallback "cards" */ projectsView?: "cards" | "list";
}
/** SETTINGS_DEFAULTS */
export type SettingsDefaults = Omit<Settings, "mobileTiles" | "sidebarTiles" | "calHideDone" | "notify" | "usage" | "uses" | "taskSchedOpen" | "projectsView">;

/* ───────────────────────────── the stored keys ───────────────────────────── */

export type SchemaKind = "collection" | "map" | "value";
/** NEEDT.schema entry (needtSync.register) */
export interface KeyDef {
  kind: SchemaKind;
  table?: string;
  /** collection record id when the row has no `id` */
  idOf?: (row: any) => string;
  /** kept on this device only, never sent */
  local?: boolean;
  /** stored as a bare string, not JSON */
  raw?: boolean;
  note?: string;
}

/** Every key in NEEDT.schema → its value type. Wildcard keys: needt.dayNotes.<day>, needt.upsellDismissed.<id>. */
export interface SyncKeyMap {
  "needt.tasks": Task[];
  "needt.projects.all": Project[];
  /** the user's own (derived from needt.projects.all — drop in the DB) */
  "needt.projects": Project[];
  "needt.projects.sort": ProjectSort;
  "needt.docs": Doc[];
  "needt.templates": Template[];
  "needt.habits": Habit[];
  "needt.habitCheckins": HabitCheckin[];
  "needt.events": CalendarEvent[];
  "needt.events.titles": EventTitleOverrides;
  "needt.mail.threads": MailThread[];
  "needt.boards": Board[];
  "needt.boardItems": BoardItem[];
  "needt.boardMembers": BoardMember[];
  "needt.chats": Chat[];
  "needt.settings": Partial<Settings>;
  /** mirror of settings.theme (raw) */
  "needt.theme": ThemeSetting;
  /** mirror of settings.accent (raw) */
  "needt.accent": AccentId;
  "needt.connections": Connections;
  "needt.connections.sync": ConnectionSyncLabels;
  "needt.mcpLinks": AccessLink[];
  "needt.apiLinks": AccessLink[];
  "needt.plan.state": PlanState;
  "needt.sidebar.v2": SidebarLayout;
  "needt.docsSort": DocsSort;
  "needt.mbSort": BoardsSort;
  "needt.docShare": DocShare;
  "needt.focus.log": FocusSession[];
  /** "1" when dismissed (raw) */
  "needt.promo.dismissed": "1";
  /* --- local only (this device / window) --- */
  "needt.openDoc": string;
  "needt.docPanel": string;
  "needt.docPanel.v2": string;
  "needt.cal.days": string;
  "needt.connections.tab": "apps" | "ai";
  "needt.phone.theme": "light" | "dark";
  "needt.states": Record<string, string>;
  /** a secret: never synced */
  "needt.mcp.key": string;
  "needt.sidebarTiles.applied": unknown;
}
export type SyncKey = keyof SyncKeyMap;
/** needt.dayNotes.<IsoDay> (raw text) and needt.upsellDismissed.<id> ("1") */
export type DynamicKey = `needt.dayNotes.${string}` | `needt.upsellDismissed.${string}`;
export type AnyKey = SyncKey | DynamicKey;
export type ValueOf<K extends string> = K extends SyncKey ? SyncKeyMap[K] : K extends `needt.dayNotes.${string}` ? string : K extends `needt.upsellDismissed.${string}` ? "1" : unknown;
export type RowOf<K extends SyncKey> = SyncKeyMap[K] extends (infer R)[] ? R : never;

/* ───────────────────────────── sync API ───────────────────────────── */

export type ChangeOp = "put" | "del" | "order" | "set" | "remove";
export type ChangeOrigin = "local" | "legacy" | "migrate" | "remote" | "error";
/** What travels between devices. */
export interface Change {
  key: string;
  op: ChangeOp;
  /** record id (collection / map); absent for set / remove / order */
  id?: string;
  /** put: the whole row; set: the whole value */
  value?: unknown;
  /** order: the list's id order */
  ids?: string[];
  /** ms, device clock made monotonic per tab (server may restamp) */
  at: EpochMs;
  rev: number;
  /** "device:tab" */
  by: string;
}
export interface PullResult {
  changes: Change[];
  cursor: string | null;
}
export interface PushResult {
  cursor: string | null;
  /** RemoteTransport: changes the server refused (a corrective change follows on the socket) */
  rejected?: { key: string; id?: string; reason: string }[];
}
/** setTransport(t). LocalTransport = BroadcastChannel("needt-sync") / storage events. */
export interface Transport {
  name: string;
  /** a durable transport's outbox is kept in needt.sync.outbox */
  durable: boolean;
  pull(since: string | null): Promise<PullResult>;
  push(changes: Change[]): Promise<PushResult>;
  onRemote(fn: (changes: Change[]) => void): () => void;
  start?(): void;
  stop?(): void;
}
export interface RemoteTransportOptions {
  /** default https://api.needt.app/v1 */
  baseUrl?: string;
  socketUrl?: string;
  token?: () => string;
}
/** Backend contract (PORT.md §1a). */
export interface SyncBackend {
  /** GET /v1/sync?since=<cursor> — since empty = every live row */
  pull(since: string | null): Promise<PullResult>;
  /** POST /v1/sync { device, changes } */
  push(body: { device: string; changes: Change[] }): Promise<PushResult>;
  /** wss://…/v1/sync/socket?cursor=<c> server → client */
  socketMessage: { type: "changes"; changes: Change[]; cursor: string };
}
export interface ChangeInfo {
  key: string;
  origin: ChangeOrigin;
  /** a binding's own token (skip its echo) */
  source?: unknown;
  changes?: Change[];
}
export interface SetOptions {
  origin?: "local" | "migrate" | "legacy";
  source?: unknown;
  raw?: boolean;
}
export interface SyncCollection<R> {
  key: string;
  list(): R[];
  get(id: string | number): R | null;
  put(row: R, opts?: SetOptions): R;
  patch(id: string | number, patch: Partial<R>, opts?: SetOptions): void;
  remove(id: string | number, opts?: SetOptions): void;
  subscribe(fn: (value: R[] | null, info: ChangeInfo) => void): () => void;
  meta(id: string | number): RecordMeta | null;
}
/** makeStore-shaped store ({ get, set, sub }) */
export interface Store<S> {
  get(): S;
  set(next: S | ((prev: S) => S)): void;
  sub(fn: (s: S) => void): () => void;
}
export interface BindOptions<S, V> {
  load?: (stored: V) => S;
  save?: (state: S) => V;
  origin?: "local" | "migrate";
  accept?: (info: ChangeInfo) => boolean;
}
export interface SyncStatus {
  transport: string | null;
  pending: number;
  lastError: string | null;
  cursor: string | null;
  device: string;
  tab: string;
}
/** needt.sync.meta.<key> */
export interface KeyMeta {
  /** id → [updatedAt ms, rev, by, deletedAt ms | 0] */
  recs: Record<string, [EpochMs, number, string, EpochMs | 0]>;
  at?: EpochMs;
  rev?: number;
  by?: string;
  orderAt?: EpochMs;
  orderBy?: string;
}
/** window.needtSync */
export interface NeedtSync {
  get<K extends AnyKey>(key: K, fallback?: ValueOf<K>): ValueOf<K> | null;
  getRaw(key: string): string | null;
  /** false = storage full; no-op when unchanged */
  set<K extends AnyKey>(key: K, value: ValueOf<K> | null, opts?: SetOptions): boolean;
  update<K extends AnyKey>(key: K, fn: (prev: ValueOf<K> | null) => ValueOf<K> | null, opts?: SetOptions): boolean;
  remove(key: AnyKey, opts?: SetOptions): boolean;
  subscribe<K extends AnyKey>(key: K | "*", fn: (value: ValueOf<K> | null, info: ChangeInfo) => void): () => void;
  collection<K extends SyncKey>(key: K): SyncCollection<RowOf<K>>;
  register(key: string, def: KeyDef): KeyDef;
  defOf(key: string): KeyDef | null;
  bind<S, V = S>(store: Store<S>, key: AnyKey, opts?: BindOptions<S, V>): () => void;
  /** React hook */
  use<K extends AnyKey>(key: K, fallback?: ValueOf<K>): [ValueOf<K> | null, (v: ValueOf<K> | ((prev: ValueOf<K> | null) => ValueOf<K>)) => void];
  applyRemote(changes: Change[]): void;
  mergeInto<R>(key: SyncKey, list: R[], changes: Change[]): R[];
  /** Settings → Reset prototype data: every needt.* key sent as remove, metadata + outbox cleared */
  resetAll(): void;
  flush(): Promise<void> | void;
  setTransport(t: Transport): void;
  LocalTransport(): Transport;
  RemoteTransport(opts: RemoteTransportOptions): Transport;
  outbox(): Change[];
  meta(key: string): KeyMeta;
  meta(key: string, id: string | number): KeyMeta["recs"][string] | null;
  status(): SyncStatus;
  device: string;
  tab: string;
}

/* ───────────────────────────── platform API ───────────────────────────── */

export type PlatformKind = "ios" | "android" | "mac" | "windows" | "web";
export type ShellKind = "capacitor" | "tauri" | "browser";
export type OsKind = "ios" | "android" | "mac" | "windows" | "linux" | "other";
export type HapticKind = "light" | "medium" | "heavy" | "selection" | "success" | "warning" | "error";
export type UiKind = "phone" | "desktop";
export interface PlatformResult {
  ok: boolean;
  via: "native" | "web" | "clipboard" | "toast" | "none";
}
export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** window.needtPlatform */
export interface NeedtPlatform {
  readonly kind: PlatformKind;
  readonly shell: ShellKind;
  readonly os: OsKind;
  /** 700 */
  readonly PHONE_MAX: number;
  /** iOS / Android, or window narrower than PHONE_MAX */
  readonly isPhone: boolean;
  readonly safeArea: SafeArea;
  /** ?ui=phone|desktop wins, else isPhone */
  ui(): UiKind;
  haptic(kind?: HapticKind): void;
  share(o: { title?: string; text?: string; url?: string }): Promise<PlatformResult>;
  /** [] when cancelled */
  pickFile(o?: { accept?: string; multiple?: boolean }): Promise<File[]>;
  notify(o: { title?: string; body?: string; at?: Date | string | number }): Promise<PlatformResult>;
  openExternal(url: string): unknown;
  copy(text: string): Promise<PlatformResult>;
  /** fires on resize / rotation when isPhone or the safe area changes */
  onChange(fn: (p: NeedtPlatform) => void): () => void;
}
/** window.needtApp (app-boot.js) */
export interface NeedtApp {
  readonly ui: UiKind;
  switchTo(ui: UiKind): Promise<void> | void;
  ready: Promise<unknown>;
}
/** window.needtSettings (stores.jsx) */
export interface NeedtSettings {
  defaults: SettingsDefaults;
  store: Store<Partial<Settings>>;
  get(): Settings;
  get<K extends keyof Settings>(k: K): Settings[K];
  /** the person chose this value (not just the default) */
  has(k: keyof Settings): boolean;
  set<K extends keyof Settings>(k: K, v: Settings[K]): void;
  patch(p: Partial<Settings>): void;
}

/* ───────────────────────────── phone kit (phone-kit.jsx public props) ───────────────────────────── */

type Node = import("react").ReactNode;
type Ref<T> = (el: T | null) => void;

export type PhonePlaceId =
  | "home" | "calendar" | "tasks" | "projects" | "docs" | "mail" | "habits" | "moodboards"
  | "connections" | "templates" | "shared" | "trash" | "settings";
/** place id + "ask" (menu A), used by mobileTiles / onScreen */
export type PhoneScreenId = PhonePlaceId | "ask";

export interface PullHit {
  id: string | number;
  title: string;
  meta?: string;
  done?: boolean;
  task?: Task;
}
/** PkScreen onPull / pkTaskPull() */
export interface PullConfig {
  search(q: string): PullHit[];
  onPick(hit: PullHit): void;
  onAdd?(text: string): void;
  placeholder?: string;
  hint?: string;
  addLabel?(q: string): string;
}
export interface PkScreenProps {
  title: Node;
  compactTitle?: string;
  sub?: Node;
  right?: Node;
  head?: Node;
  headClass?: string;
  onPull?: PullConfig;
  /** data-pk-screen */
  screen?: string;
  scrollRef?: Ref<HTMLElement>;
  /** false drops the 132px bottom spacer */
  tail?: boolean;
  className?: string;
  glyph?: PhoneScreenId;
  glyphKind?: string;
  children?: Node;
}
export interface PkPullDownProps {
  scroller: HTMLElement | null;
  search: PullConfig["search"];
  onPick: PullConfig["onPick"];
  onAdd?: PullConfig["onAdd"];
  placeholder?: string;
  hint?: string;
  addLabel?: PullConfig["addLabel"];
}
export interface PkSkyPlateProps {
  as?: string;
  className?: string;
  children?: Node;
  [rest: string]: unknown;
  radius?: number;
  label?: string;
}
export interface PkButtonProps {
  kind?: "primary" | "quiet" | "chip" | "ghost" | "inline";
  icon?: string;
  small?: boolean;
  block?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: (e: MouseEvent) => void;
  className?: string;
  children?: Node;
  [rest: string]: unknown;
}
export interface PkFieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  grow?: boolean;
  className?: string;
  inputProps?: Record<string, unknown>;
}
export interface PkNumberProps {
  /** may hold non-digits ("9 h") */
  value: string | number;
  className?: string;
  label?: string;
}
export interface PkEmptyProps {
  title?: Node;
  line?: Node;
  action?: Node;
  /** false drops the sky vignette */
  sky?: boolean;
}
export interface PkSweepProps {
  kind?: "row" | "screen";
}
export interface PkGlyphProps {
  place?: PhoneScreenId;
  /** a popovers.jsx Art name (doc, page, folder, template, task, event…) */
  kind?: string;
  size?: "s" | "m" | "l" | "xl" | number;
  tone?: "tint" | "glass" | "plain";
  className?: string;
  label?: string;
}
export interface PkGlassProps {
  as?: string;
  className?: string;
  strong?: boolean;
  round?: boolean;
  children?: Node;
  [rest: string]: unknown;
}
export interface PkSectionProps {
  title: Node;
  count?: number;
  tone?: "late" | (string & {});
  action?: Node;
  folded?: boolean;
  onFold?: () => void;
  big?: boolean;
  glyph?: PhoneScreenId;
  className?: string;
  children?: Node;
}
export type RowPhase = "check" | "done" | "later";
export interface PkRowProps {
  id: string | number;
  title: Node;
  meta?: Node;
  time?: Node;
  /** replaces the check ring */
  lead?: Node;
  /** one button at the end; a swipe never starts on it */
  action?: Node;
  done?: boolean;
  late?: boolean;
  phase?: RowPhase | null;
  out?: boolean;
  canDone?: boolean;
  canLater?: boolean;
  onCheck?: () => void;
  onOpen?: () => void;
  /** swipe right = "done", left = "later" */
  onSwipe?: (kind: "done" | "later") => void;
  doneLabel?: string;
  laterLabel?: string;
  doneIcon?: string;
  laterIcon?: string;
  /** false drops the ring (event rows) */
  check?: boolean;
  label?: string;
}
export interface PkTaskRowProps {
  t: Task;
  late?: boolean;
  phase?: RowPhase | null;
  out?: boolean;
  canDone?: boolean;
  canLater?: boolean;
  onCheck?: (t: Task) => void;
  onOpen?: (t: Task) => void;
  onSwipe?: (t: Task, kind: "done" | "later") => void;
  hideProject?: boolean;
  action?: Node;
}
export interface PkChipsProps {
  className?: string;
  label?: string;
  children?: Node;
}
/** a rect in the sheet layer's px */
export interface SheetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}
export interface PkSheetProps {
  open: boolean;
  onClose: () => void;
  title?: Node;
  meta?: Node;
  head?: Node;
  footer?: Node;
  /** fractions of the screen height, opens at the first, e.g. [0.5, 0.92] */
  detents?: number[];
  label?: string;
  className?: string;
  bodyClass?: string;
  /** grow out of / back into this rect (menu A's pill: pkPillRect) */
  from?: SheetRect | ((layer: HTMLElement) => SheetRect);
  /** once the sheet is fully put away */
  onShut?: () => void;
  children?: Node;
}
export interface PkScrimProps {
  scrimRef?: Ref<HTMLElement>;
  open?: boolean;
  onClick?: () => void;
}
export interface PkFogProps {
  fogRef?: Ref<HTMLElement>;
}
export interface PkTopBandProps {
  className?: string;
}
export interface PkHoldProps {
  /** 450 ms press without travel (8 px), or contextmenu */
  onHold: () => void;
  className?: string;
  data?: Record<string, string>;
  disabled?: boolean;
  children?: Node;
}
export interface PkAction {
  label: string;
  hint?: string;
  icon?: string;
  hue?: CssColor;
  /** a place id → PkGlyph */
  glyph?: PhoneScreenId;
  danger?: boolean;
  check?: boolean;
  more?: boolean;
  disabled?: boolean;
  onClick: () => void;
  data?: Record<string, string>;
}
export interface PkActs {
  title?: Node;
  meta?: Node;
  head?: Node;
  actions: PkAction[];
}
export interface PkActionsProps {
  acts: PkActs | null;
  onClose: () => void;
}
export interface PkHueTileProps {
  /** "pinterest" draws MbmPinMark */
  icon?: string;
  hue?: CssColor;
  glyph?: PhoneScreenId;
  size?: number;
}
export interface PkEventSheetProps {
  open: boolean;
  onClose: () => void;
  title?: Node;
  meta?: Node;
  facts?: Node;
  footer?: Node;
  children?: Node;
}
export interface PkTaskSheetProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (patch: Partial<Task>) => void;
  onDelete: () => void;
  onFocus?: (t: Task) => void;
}
/** coParse(line) → fields (+ attachments) for pkDay.create */
export interface ComposerFields {
  title?: string;
  rest?: string;
  found?: Record<string, { value: string } | undefined>;
  date?: string;
  time?: string;
  duration?: string;
  project?: string;
  priority?: string;
  label?: string;
  labels?: string[];
  note?: string;
  attachments?: FileRef[];
  dueDate?: IsoDay;
  hour?: number;
  minutes?: number;
  projectId?: ProjectId | null;
}
export interface PkComposerProps {
  open: boolean;
  onClose: () => void;
  onCreate: (fields: ComposerFields) => void;
  from?: PkSheetProps["from"];
  onShut?: () => void;
}
export interface PkSnack {
  text: string;
  undo?: () => void;
  key: number;
}

/** window.pkDay — the one copy of the phone's day rules */
export interface PkDay {
  part(at: number | null): "Morning" | "Afternoon" | "Evening" | "Anytime";
  sections(tasks: Task[], today?: number): { late: Task[]; day: Task[]; inbox: Task[]; next: Task[] };
  parts(list: Task[]): [string, Task[]][];
  nextUp(s: { late: Task[]; day: Task[] }, o?: { skipped?: TaskId[]; busy?: Record<string, unknown> }): {
    nu: Task | null; after: Task[]; cands: Task[]; fresh: boolean; lateOpen: number; open: number;
    skip(skipped: TaskId[]): TaskId[];
  };
  toggle(id: TaskId): void;
  update(id: TaskId, patch: Partial<Task>): void;
  /** → undo */
  trash(id: TaskId): () => void;
  /** → the new task's id */
  create(fields: string | ComposerFields): TaskId;
  added(id: TaskId): string;
  prio(p: string | null): TaskPriority | string | null;
  hour(v: string): number | null;
  /** to tomorrow → undo */
  later(t: Task): () => void;
  moveOverdue(tasks: Task[]): { label: string; undo: () => void } | null;
  snapshot(t: Task): Pick<Task, "overdue" | "dueDate" | "scheduledStart" | "scheduledEnd">;
  fileOf(f: File): FileRef;
  fileSize(bytes: number): string;
}

/**
 * The props every phone place gets (mobile-v2-plates.jsx V2pScreens + the shell hooks).
 * A place without a hook sends the same as a cancelable window event:
 * "needt:upgrade" (detail feature), "needt:theme" ("light"|"dark"), "needt:signout", "needt:go" (place id).
 */
export interface PlaceProps {
  tasks: Task[];
  onOpen: (t: Task) => void;
  onFocus: (t: Task) => void;
  /** the snack */
  say: (text: string, undo?: () => void) => void;
  /** the tasks pull-down (search + add to today) */
  pull: PullConfig;
  screen: PhonePlaceId;
  /** true = a full-screen layer is up, menu A steps aside */
  onCover: (covered: boolean) => void;
  onUpgrade?: (feature?: string) => void;
  onTheme?: (theme: "light" | "dark") => void;
  onSignOut?: () => void;
  onScreen?: (id: PhoneScreenId) => void;
}
/** window.PkPlaces: id → Component (home and calendar are drawn by mobile-v2-plates.jsx itself) */
export type PkPlacesRegistry = Partial<Record<PhonePlaceId, import("react").ComponentType<PlaceProps>>>;

/* ───────────────────────────── globals ───────────────────────────── */

declare global {
  interface Window {
    needtSync: NeedtSync;
    needtPlatform: NeedtPlatform;
    needtApp: NeedtApp;
    needtSettings: NeedtSettings;
    PkPlaces: PkPlacesRegistry;
    pkDay: PkDay;
    pkPillRect?: SheetRect | ((layer: HTMLElement) => SheetRect);
    pkTaskPull(o: { tasks: Task[]; onOpen: (t: Task) => void; onAdd?: (title: string) => void }): PullConfig;
    pkDotSweep(target?: Element | string, kind?: "row" | "screen"): void;
    pkSkyMood(theme: "light" | "dark", date?: Date): "periwinkle" | "rose" | "dusk" | "night" | null;
    pkFogLive(el: HTMLElement): () => void;
    pkOwnGesture(pointerId: number): () => void;
  }
}
