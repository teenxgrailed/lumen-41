/* THE MAP — prototype names ↔ database columns, in one place.
 *
 * The prototype (docs/port/prototype/Data.js) speaks its own field names;
 * several of them already have a column under another name. Screens use the
 * v3 shapes below and never see a Prisma column; the hooks call `fromApi*`
 * on the way in and `*ToApi` on the way out. Every mapping round-trips — see
 * __tests__/map.test.ts.
 *
 *   isFixed   ↔ Task.scheduleLocked          auto     ↔ Task.isAutoScheduled
 *   movedFrom ↔ Task.previousScheduledStart  value    ↔ Task.valueCents (×100)
 *   earned    ↔ Task.earnedCents (×100)      Stage    ↔ Task.globalStage
 *   chunk     ↔ Task.minChunkMinutes         holder   ↔ Task.assigneeId
 *   blockedBy ↔ Task.dependsOnId             priority ↔ Task.priorityLevel
 *   done      ↔ Task.status === "completed"  notes    ↔ Task.description (as text)
 *   source    ↔ Task.originKind/originId/originQuote
 *   schedule  ↔ Habit.at / Habit.quota
 *   startAt   ↔ CalendarEvent.start (local) calendarId ↔ CalendarEvent.feedId
 *
 * Dates: the prototype's day is "YYYY-MM-DD" and its stamp is local
 * "YYYY-MM-DDTHH:mm"; the API speaks UTC ISO. Every conversion takes the
 * person's IANA time zone.
 */
import { formatInTimeZone, fromZonedTime } from "@/lib/date-utils";
import { notesText } from "@/lib/needt3/derive";
import {
  PREVIEW_MAX_ROWS,
  PREVIEW_ROW_TEXT,
  type PagePreviewBlock,
} from "@/lib/pages/page-preview";

export type V3StageId = "todo" | "doing" | "review" | "done";
export type DbTaskStage = "TODO" | "DOING" | "REVIEW" | "DONE";
export type V3Priority = "urgent" | "high" | "medium" | "low";
export type DbPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type V3OriginKind = "mail" | "doc" | "chat";

const STAGE_TO_DB: Record<V3StageId, DbTaskStage> = {
  todo: "TODO",
  doing: "DOING",
  review: "REVIEW",
  done: "DONE",
};
const STAGE_FROM_DB: Record<DbTaskStage, V3StageId> = {
  TODO: "todo",
  DOING: "doing",
  REVIEW: "review",
  DONE: "done",
};
const PRIORITY_TO_DB: Record<V3Priority, DbPriority> = {
  urgent: "URGENT",
  high: "HIGH",
  medium: "MEDIUM",
  low: "LOW",
};
const PRIORITY_FROM_DB: Record<DbPriority, V3Priority> = {
  URGENT: "urgent",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
};

export const stageToDb = (s: V3StageId | null | undefined) =>
  s ? STAGE_TO_DB[s] : null;
export const stageFromDb = (s: string | null | undefined): V3StageId | null =>
  s && s in STAGE_FROM_DB ? STAGE_FROM_DB[s as DbTaskStage] : null;
export const priorityToDb = (p: V3Priority) => PRIORITY_TO_DB[p];
export const priorityFromDb = (p: string | null | undefined): V3Priority =>
  p && p in PRIORITY_FROM_DB ? PRIORITY_FROM_DB[p as DbPriority] : "medium";

/** Money: the prototype counts whole units, the database integer cents. */
export const toCents = (v: number | null | undefined) =>
  v == null ? null : Math.round(v * 100);
export const fromCents = (c: number | null | undefined) =>
  c == null ? null : c / 100;

/* ---------- dates ---------- */

/** An instant at exactly UTC midnight: how a date-only value is stored. */
const UTC_MIDNIGHT = /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.0+)?(?:Z|\+00:00)$/;

/**
 * UTC ISO → local "YYYY-MM-DD" in `tz`. A value at exactly UTC midnight is a
 * date-only day (the API, task sync and the old screens store "2026-10-12" as
 * `2026-10-12T00:00:00Z`), so it keeps its day: read in a zone west of UTC it
 * would otherwise land on the day before and turn overdue a day early. v3
 * itself writes local midnight (`localToIso`), which is UTC midnight only in
 * a zero-offset zone, where both readings agree.
 */
export function isoToDay(iso: string | null | undefined, tz: string) {
  if (!iso) return null;
  const m = UTC_MIDNIGHT.exec(iso);
  return m ? m[1] : formatInTimeZone(iso, tz, "yyyy-MM-dd");
}
/** UTC ISO → local "YYYY-MM-DDTHH:mm" in `tz`. */
export function isoToStamp(iso: string | null | undefined, tz: string) {
  return iso ? formatInTimeZone(iso, tz, "yyyy-MM-dd'T'HH:mm") : null;
}
/** Local "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" in `tz` → UTC ISO. */
export function localToIso(local: string | null | undefined, tz: string) {
  if (!local) return null;
  const stamp = local.length === 10 ? `${local}T00:00` : local.slice(0, 16);
  return fromZonedTime(`${stamp}:00`, tz).toISOString();
}

/* ---------- tasks ---------- */

/** The subset of a Task row the API returns that v3 reads. */
export interface ApiTask {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  projectId?: string | null;
  scheduleLocked?: boolean;
  isAutoScheduled?: boolean;
  noSlot?: boolean;
  entry?: string | null;
  minChunkMinutes?: number | null;
  splitAllowed?: boolean;
  deadline?: string | null;
  hardDeadline?: boolean;
  priorityLevel?: string | null;
  assigneeId?: string | null;
  dependsOnId?: string | null;
  valueCents?: number | null;
  earnedCents?: number | null;
  globalStage?: string | null;
  previousScheduledStart?: string | null;
  trashedAt?: string | null;
  originKind?: string | null;
  originId?: string | null;
  originQuote?: string | null;
  isRecurring?: boolean;
  recurrenceRule?: string | null;
  scheduleId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** TaskPart rows, ordered by `position` (GET /api/tasks, /api/tasks/[id]). */
  parts?: ApiTaskPart[];
  /** Open TaskWait rows (`resolvedAt: null`). */
  waits?: ApiTaskWait[];
}

export interface ApiTaskPart {
  id: string;
  title: string;
  done: boolean;
  position?: number;
}

export interface ApiTaskWait {
  id: string;
  reason: string;
  resolvedAt?: string | null;
  waitingOnUserId: string;
  waitingOnUser?: {
    id: string;
    name?: string | null;
    image?: string | null;
  } | null;
}

/** One part of a task (TaskPart). */
export interface V3TaskPart {
  id: string;
  title: string;
  done: boolean;
}

/** What a task waits on (TaskWait): a person (`on`, a user id) for `for`. */
export interface V3TaskWait {
  id: string;
  on: string;
  onName: string | null;
  for: string;
}

export function partFromApi(row: ApiTaskPart): V3TaskPart {
  return { id: row.id, title: row.title, done: row.done };
}

export function waitFromApi(row: ApiTaskWait): V3TaskWait {
  return {
    id: row.id,
    on: row.waitingOnUserId,
    onName: row.waitingOnUser?.name ?? null,
    for: row.reason,
  };
}

export interface V3TaskSource {
  kind: V3OriginKind;
  id: string | null;
  quote: string | null;
}

/** A task in the prototype's words (Data.js THE TASKS). */
export interface V3Task {
  id: string;
  title: string;
  /** Plain text, newlines kept (Data.js NOTES 09.10.26). */
  notes: string | null;
  done: boolean;
  /** Raw lifecycle status ("todo" | "in_progress" | "completed"). */
  status: string;
  projectId: string | null;
  /** "YYYY-MM-DD", local. */
  dueDate: string | null;
  estimatedMinutes: number | null;
  /** "YYYY-MM-DDTHH:mm", local. */
  scheduledStart: string | null;
  scheduledEnd: string | null;
  isFixed: boolean;
  auto: boolean;
  noSlot: boolean;
  entry: string | null;
  chunk: number | null;
  splitAllowed: boolean;
  /** "YYYY-MM-DD", local. */
  deadline: string | null;
  hardDeadline: boolean;
  priority: V3Priority;
  holder: string | null;
  blockedBy: string | null;
  value: number | null;
  earned: number | null;
  Stage: V3StageId | null;
  /** "YYYY-MM-DDTHH:mm", local — where the scheduler moved it from. */
  movedFrom: string | null;
  trashedAt: string | null;
  source: V3TaskSource | null;
  repeat: string | null;
  scheduleId: string | null;
  updatedAt: string | null;
  /** Parts in order; `[]` when the task has none. */
  parts: V3TaskPart[];
  /** Open waits; `[]` when the task waits on no one. */
  waits: V3TaskWait[];
}

const isOrigin = (k: unknown): k is V3OriginKind =>
  k === "mail" || k === "doc" || k === "chat";

export function taskFromApi(row: ApiTask, tz: string): V3Task {
  return {
    id: row.id,
    title: row.title,
    notes: notesText(row.description),
    done: row.status === "completed",
    status: row.status,
    projectId: row.projectId ?? null,
    dueDate: isoToDay(row.dueDate, tz),
    estimatedMinutes: row.estimatedMinutes ?? null,
    scheduledStart: isoToStamp(row.scheduledStart, tz),
    scheduledEnd: isoToStamp(row.scheduledEnd, tz),
    isFixed: row.scheduleLocked ?? false,
    auto: row.isAutoScheduled ?? false,
    noSlot: row.noSlot ?? false,
    entry: row.entry ?? null,
    chunk: row.minChunkMinutes ?? null,
    splitAllowed: row.splitAllowed ?? true,
    deadline: isoToDay(row.deadline, tz),
    hardDeadline: row.hardDeadline ?? false,
    priority: priorityFromDb(row.priorityLevel),
    holder: row.assigneeId ?? null,
    blockedBy: row.dependsOnId ?? null,
    value: fromCents(row.valueCents),
    earned: fromCents(row.earnedCents),
    Stage: stageFromDb(row.globalStage),
    movedFrom: isoToStamp(row.previousScheduledStart, tz),
    trashedAt: row.trashedAt ?? null,
    source: isOrigin(row.originKind)
      ? {
          kind: row.originKind,
          id: row.originId ?? null,
          quote: row.originQuote ?? null,
        }
      : null,
    repeat: row.isRecurring ? (row.recurrenceRule ?? null) : null,
    scheduleId: row.scheduleId ?? null,
    updatedAt: row.updatedAt ?? null,
    parts: [...(row.parts ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(partFromApi),
    waits: (row.waits ?? []).filter((w) => !w.resolvedAt).map(waitFromApi),
  };
}

/** Fields a v3 screen may write. `done` maps to `status`. */
export type V3TaskPatch = Partial<
  Omit<V3Task, "id" | "status" | "updatedAt" | "movedFrom" | "parts" | "waits">
>;

/**
 * A v3 patch → the body `PUT /api/tasks/[id]` (or `POST /api/tasks`) takes.
 * Only keys present in the patch are written; `null` clears.
 */
export function taskPatchToApi(
  patch: V3TaskPatch,
  tz: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const has = (k: keyof V3TaskPatch) =>
    Object.prototype.hasOwnProperty.call(patch, k);
  if (has("title")) out.title = patch.title;
  if (has("notes")) out.description = patch.notes;
  if (has("done")) out.status = patch.done ? "completed" : "todo";
  if (has("projectId")) out.projectId = patch.projectId;
  if (has("dueDate")) out.dueDate = localToIso(patch.dueDate, tz);
  if (has("estimatedMinutes")) out.estimatedMinutes = patch.estimatedMinutes;
  if (has("scheduledStart"))
    out.scheduledStart = localToIso(patch.scheduledStart, tz);
  if (has("scheduledEnd"))
    out.scheduledEnd = localToIso(patch.scheduledEnd, tz);
  if (has("isFixed")) out.scheduleLocked = patch.isFixed;
  if (has("auto")) out.isAutoScheduled = patch.auto;
  if (has("noSlot")) out.noSlot = patch.noSlot;
  if (has("entry")) out.entry = patch.entry;
  if (has("chunk")) out.minChunkMinutes = patch.chunk;
  if (has("splitAllowed")) out.splitAllowed = patch.splitAllowed;
  if (has("deadline")) out.deadline = localToIso(patch.deadline, tz);
  if (has("hardDeadline")) out.hardDeadline = patch.hardDeadline;
  if (has("priority") && patch.priority)
    out.priorityLevel = priorityToDb(patch.priority);
  if (has("holder")) out.assigneeId = patch.holder;
  if (has("blockedBy")) out.dependsOnId = patch.blockedBy;
  if (has("value")) out.valueCents = toCents(patch.value);
  if (has("earned")) out.earnedCents = toCents(patch.earned);
  if (has("Stage")) out.globalStage = stageToDb(patch.Stage);
  if (has("trashedAt")) out.trashedAt = patch.trashedAt;
  if (has("source")) {
    out.originKind = patch.source?.kind ?? null;
    out.originId = patch.source?.id ?? null;
    out.originQuote = patch.source?.quote ?? null;
  }
  if (has("repeat")) out.recurrenceRule = patch.repeat;
  if (has("scheduleId")) out.scheduleId = patch.scheduleId;
  return out;
}

/* ---------- projects ---------- */

export interface ApiProject {
  id: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  ground?: string | null;
  position?: number;
  status?: string;
  description?: string | null;
}

export interface V3Project {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  ground: string | null;
  position: number;
  archived: boolean;
}

export function projectFromApi(row: ApiProject): V3Project {
  return {
    id: row.id,
    name: row.name,
    color: row.color ?? null,
    icon: row.icon ?? null,
    ground: row.ground ?? null,
    position: row.position ?? 0,
    archived: row.status === "archived",
  };
}

export function projectPatchToApi(
  patch: Partial<Omit<V3Project, "id">>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["name", "color", "icon", "ground", "position"] as const) {
    if (k in patch) out[k] = patch[k];
  }
  if ("archived" in patch) out.status = patch.archived ? "archived" : "active";
  return out;
}

/* ---------- habits ---------- */

export interface ApiHabit {
  id: string;
  title: string;
  projectId?: string | null;
  color?: string | null;
  icon?: string | null;
  at?: string | null;
  quota?: number | null;
  archivedAt?: string | null;
}

export interface V3Habit {
  id: string;
  title: string;
  projectId: string | null;
  color: string | null;
  icon: string | null;
  schedule: { time: string | null; perWeek: number | null };
  archivedAt: string | null;
}

export function habitFromApi(row: ApiHabit): V3Habit {
  return {
    id: row.id,
    title: row.title,
    projectId: row.projectId ?? null,
    color: row.color ?? null,
    icon: row.icon ?? null,
    schedule: { time: row.at ?? null, perWeek: row.quota ?? null },
    archivedAt: row.archivedAt ?? null,
  };
}

export function habitPatchToApi(
  patch: Partial<Omit<V3Habit, "id" | "archivedAt">>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ["title", "projectId", "color", "icon"] as const) {
    if (k in patch) out[k] = patch[k];
  }
  if (patch.schedule) {
    if ("time" in patch.schedule) out.at = patch.schedule.time;
    if ("perWeek" in patch.schedule) out.quota = patch.schedule.perWeek;
  }
  return out;
}

/* ---------- events ---------- */

export interface ApiEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  feedId: string;
  externalEventId?: string | null;
  location?: string | null;
  description?: string | null;
  isRecurring?: boolean | null;
  recurrenceRule?: string | null;
  masterEventId?: string | null;
}

export type V3EventSource = "needt" | "google" | "apple" | "outlook";

export interface V3Event {
  id: string;
  title: string;
  /** "YYYY-MM-DDTHH:mm", local; all-day = "T00:00", end exclusive. */
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  calendarId: string;
  source: V3EventSource;
  externalId: string | null;
  /** A series master or one of its stored occurrences. */
  isRecurring?: boolean;
  /** RRULE text of the series; occurrences are not expanded in v3. */
  recurrenceRule?: string | null;
}

/** CalendarFeed.type → the prototype's event source. */
export function eventSourceFromFeedType(
  type: string | null | undefined
): V3EventSource {
  switch (type) {
    case "GOOGLE":
      return "google";
    case "OUTLOOK":
      return "outlook";
    case "CALDAV":
      return "apple";
    default:
      return "needt";
  }
}

export function eventFromApi(
  row: ApiEvent,
  tz: string,
  feedType?: string | null
): V3Event {
  const allDay = row.allDay ?? false;
  /* All-day rows are stored at UTC midnight; reading them in the person's
     zone would shift the day west of Greenwich. */
  const zone = allDay ? "UTC" : tz;
  return {
    id: row.id,
    title: row.title,
    startAt: isoToStamp(row.start, zone) ?? "",
    endAt: isoToStamp(row.end, zone) ?? "",
    isAllDay: allDay,
    calendarId: row.feedId,
    source: eventSourceFromFeedType(feedType),
    externalId: row.externalEventId ?? null,
    isRecurring: !!row.isRecurring || !!row.masterEventId,
    recurrenceRule: row.recurrenceRule ?? null,
  };
}

export function eventPatchToApi(
  patch: Partial<Pick<V3Event, "title" | "startAt" | "endAt" | "isAllDay">>,
  tz: string,
  isAllDay = false
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const allDay = patch.isAllDay ?? isAllDay;
  const zone = allDay ? "UTC" : tz;
  if ("title" in patch) out.title = patch.title;
  if ("isAllDay" in patch) out.allDay = patch.isAllDay;
  if ("startAt" in patch) out.start = localToIso(patch.startAt, zone);
  if ("endAt" in patch) out.end = localToIso(patch.endAt, zone);
  return out;
}

/* ---------- mail (read-only at the provider) ---------- */

export interface ApiMailMessage {
  id: string;
  accountId: string;
  threadId?: string | null;
  subject: string;
  fromName?: string | null;
  fromAddress?: string | null;
  snippet: string;
  date: string;
  isRead: boolean;
  isArchived: boolean;
  trashedAt?: string | null;
  needsReply?: boolean | null;
  suggestedTask?: string | null;
  toAddresses?: unknown;
  ccAddresses?: unknown;
  bccAddresses?: unknown;
  attachments?: unknown;
}

export interface V3MailAttachment {
  name: string;
  size: number | null;
  type: string | null;
}

export interface V3MailThread {
  id: string;
  accountId: string;
  threadId: string | null;
  subject: string;
  from: string;
  fromEmail: string | null;
  /** "YYYY-MM-DDTHH:mm", local. */
  receivedAt: string;
  preview: string;
  isRead: boolean;
  isArchived: boolean;
  trashedAt: string | null;
  needsReply: boolean;
  suggestedTask: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  attachments: V3MailAttachment[];
}

function addressList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((a) =>
      typeof a === "string"
        ? a
        : a && typeof a === "object" && "address" in a
          ? String((a as { address: unknown }).address)
          : null
    )
    .filter((a): a is string => !!a);
}

function attachmentList(v: unknown): V3MailAttachment[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((a) => a && typeof a === "object" && "name" in a)
    .map((a) => {
      const o = a as Record<string, unknown>;
      return {
        name: String(o.name),
        size: typeof o.size === "number" ? o.size : null,
        type: typeof o.type === "string" ? o.type : null,
      };
    });
}

export function mailFromApi(row: ApiMailMessage, tz: string): V3MailThread {
  return {
    id: row.id,
    accountId: row.accountId,
    threadId: row.threadId ?? null,
    subject: row.subject,
    from: row.fromName || row.fromAddress || "",
    fromEmail: row.fromAddress ?? null,
    receivedAt: isoToStamp(row.date, tz) ?? "",
    preview: row.snippet,
    isRead: row.isRead,
    isArchived: row.isArchived,
    trashedAt: row.trashedAt ?? null,
    needsReply: row.needsReply ?? false,
    suggestedTask: row.suggestedTask ?? null,
    to: addressList(row.toAddresses),
    cc: addressList(row.ccAddresses),
    bcc: addressList(row.bccAddresses),
    attachments: attachmentList(row.attachments),
  };
}

/* ---------- moodboards ---------- */

export interface ApiMoodboard {
  id: string;
  title: string;
  createdAt?: string;
  updatedAt?: string;
  projectId?: string | null;
  linkShare?: boolean;
  pinterestBoardId?: string | null;
  pinterestStatus?: string | null;
  pinterestSync?: boolean;
  pinterestSyncedAt?: string | null;
  trashedAt?: string | null;
  /** Only the single-board route sends the caller's role. */
  accessRole?: string | null;
  /** The list route only: how many references the board holds. */
  itemCount?: number;
  /** The list route only: the board's first references, for the grid cover. */
  preview?: ApiBoardPreview[];
  /** The list route only: the old canvas stored something (its bytes are not read). */
  hasCanvas?: boolean;
  /** The list route only: who made the board. */
  owner?: { id?: string; name?: string | null; email?: string | null } | null;
  /** The list route only: people other than the owner, how many and the first few. */
  memberCount?: number;
  members?: ApiBoardMember[];
  /** The single-board route, for people with full access, once link sharing is on. */
  shareToken?: string | null;
}

export interface ApiBoardMember {
  userId: string;
  role?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

/** One reference as the list sends it: just what a cover tile draws. */
export interface ApiBoardPreview {
  id: string;
  kind: string;
  url?: string | null;
  color?: string | null;
  text?: string | null;
  thumbnailUrl?: string | null;
}

/** What the caller may do on a board (`MoodboardAccessRole`). */
export type BoardRole = "FULL_ACCESS" | "EDITOR" | "VIEWER";

export interface V3Board {
  id: string;
  title: string;
  createdAt: string | null;
  projectId: string | null;
  linkShare: boolean;
  pinterestBoardId: string | null;
  pinterestStatus: string | null;
  /** The daily worker pass appends new Pins from the linked Pinterest board. */
  pinterestSync: boolean;
  pinterestSyncedAt: string | null;
  trashedAt: string | null;
  /** The caller's role; null when the route did not send it (the list). */
  accessRole?: BoardRole | null;
  /** References on the board; null when the route did not say (the single-board read). */
  itemCount?: number | null;
  /** The first references in wall order (at most three), for the grid cover. */
  preview?: V3BoardPreview[];
  /** The old canvas stored something: the grid shows it read-only. */
  hasCanvas?: boolean;
  /** Who made the board (the list only). */
  owner?: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
  /** People on the board besides the owner: a count and the first few (the list only). */
  memberCount?: number | null;
  members?: V3BoardMember[];
  /** Secret half of the public address `/b/<id>/<token>`; full access only, link sharing on. */
  shareToken?: string | null;
}

export interface V3BoardMember {
  userId: string;
  role: BoardRole;
  name: string | null;
  email: string | null;
  image: string | null;
}

export type V3BoardPreviewKind = "image" | "link" | "color" | "note";

export interface V3BoardPreview {
  id: string;
  kind: V3BoardPreviewKind;
  url: string | null;
  color: string | null;
  text: string | null;
  thumbnailUrl: string | null;
}

const PREVIEW_KINDS: readonly string[] = ["image", "link", "color", "note"];

export function boardFromApi(row: ApiMoodboard): V3Board {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt ?? null,
    projectId: row.projectId ?? null,
    linkShare: row.linkShare ?? false,
    pinterestBoardId: row.pinterestBoardId ?? null,
    pinterestStatus: row.pinterestStatus ?? null,
    pinterestSync: row.pinterestSync ?? false,
    pinterestSyncedAt: row.pinterestSyncedAt ?? null,
    trashedAt: row.trashedAt ?? null,
    accessRole:
      row.accessRole === "FULL_ACCESS" ||
      row.accessRole === "EDITOR" ||
      row.accessRole === "VIEWER"
        ? row.accessRole
        : null,
    itemCount: typeof row.itemCount === "number" ? row.itemCount : null,
    hasCanvas: row.hasCanvas === true,
    owner: row.owner
      ? {
          id: row.owner.id ?? null,
          name: row.owner.name ?? null,
          email: row.owner.email ?? null,
        }
      : null,
    memberCount: typeof row.memberCount === "number" ? row.memberCount : null,
    members: (row.members ?? []).map((m) => ({
      userId: m.userId,
      role: m.role === "EDITOR" || m.role === "FULL_ACCESS" ? m.role : "VIEWER",
      name: m.name ?? null,
      email: m.email ?? null,
      image: m.image ?? null,
    })),
    shareToken: row.shareToken ?? null,
    preview: (row.preview ?? [])
      .filter((p) => PREVIEW_KINDS.includes(p.kind))
      .map((p) => ({
        id: p.id,
        kind: p.kind as V3BoardPreviewKind,
        url: p.url ?? null,
        color: p.color ?? null,
        text: p.text ?? null,
        thumbnailUrl: p.thumbnailUrl ?? null,
      })),
  };
}

/* ---------- docs ---------- */

export interface ApiPage {
  id: string;
  title: string;
  icon?: string | null;
  coverUrl?: string | null;
  isFavorite?: boolean;
  trashedAt?: string | null;
  projectId?: string | null;
  style?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
  /** Present on `GET /api/pages/:id`: a database page has no text editor. */
  database?: { id: string } | null;
  /** The first blocks as plain rows (`GET /api/pages`); absent from other routes. */
  preview?: unknown;
}

export interface V3Doc {
  id: string;
  title: string;
  icon: string | null;
  coverUrl: string | null;
  isFavorite: boolean;
  trashedAt: string | null;
  projectId: string | null;
  style: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** A database page: rows, not blocks, so no Insert tab. */
  isDatabase?: boolean;
  /**
   * The page's first blocks for the card's miniature. `undefined` when the
   * route sent none (a single page, an older server): the card draws no
   * miniature; `[]` is an empty page.
   */
  preview?: PagePreviewBlock[];
}

const PREVIEW_TYPES: ReadonlySet<string> = new Set([
  "h1",
  "h2",
  "h3",
  "p",
  "lead",
  "li",
  "ol",
  "todo",
  "quote",
  "callout",
  "code",
  "rule",
  "image",
]);

/**
 * The server's preview, read defensively: only known row types, text only,
 * clipped again to the server's own caps. Anything else is dropped, so the
 * card never draws a row it does not know how to.
 */
export function previewFromApi(raw: unknown): PagePreviewBlock[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rows: PagePreviewBlock[] = [];
  for (const item of raw.slice(0, PREVIEW_MAX_ROWS * 4)) {
    if (rows.length >= PREVIEW_MAX_ROWS) break;
    if (typeof item !== "object" || item === null) continue;
    const { type, text, checked } = item as Record<string, unknown>;
    if (typeof type !== "string" || !PREVIEW_TYPES.has(type)) continue;
    const marker = type === "rule" || type === "image";
    if (!marker && (typeof text !== "string" || text === "")) continue;
    const row: PagePreviewBlock = {
      type: type as PagePreviewBlock["type"],
      text:
        marker || typeof text !== "string"
          ? ""
          : text.slice(0, PREVIEW_ROW_TEXT),
    };
    if (type === "todo" && checked === true) row.checked = true;
    rows.push(row);
  }
  return rows;
}

export function docFromApi(row: ApiPage): V3Doc {
  const preview = previewFromApi(row.preview);
  return {
    id: row.id,
    title: row.title,
    icon: row.icon ?? null,
    coverUrl: row.coverUrl ?? null,
    isFavorite: row.isFavorite ?? false,
    trashedAt: row.trashedAt ?? null,
    projectId: row.projectId ?? null,
    style: row.style ?? null,
    createdAt: row.createdAt ?? null,
    updatedAt: row.updatedAt ?? null,
    ...(row.database ? { isDatabase: true } : null),
    ...(preview ? { preview } : {}),
  };
}
