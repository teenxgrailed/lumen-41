/* THE V3 PARSE — the existing composer parser, read against the real
 * workspace, plus the three shorthands people type anyway.
 *
 * `coParse` (src/components/needt/composer/co-parse.ts) stays the one rule
 * for what a sentence means: days, clocks, "for 30 min", "by friday",
 * "every day", the priority words and the project names. It is reused, not
 * copied. This module only
 *   - hands it the workspace's own projects as vocabulary (never the
 *     fixture's), and no labels — a task has no label column yet;
 *   - claims, in the words `coParse` left unclaimed, `#project`, `!priority`
 *     and a bare length ("30m", "2h"), which the v3 hint text promises
 *     ("Type a day, a time, a length or a #project in the line");
 *   - turns the verdict into the drafts the v3 hooks take.
 *
 * Pure: text, a reference date and the projects in, a verdict out.
 */
import {
  type CoCadence,
  type CoFacetKind,
  type CoKind,
  type CoMark,
  type CoParse,
  type CoSpan,
  type CoVocabulary,
  coParse,
} from "@/components/needt/composer/co-parse";

import { toLocalDateKey } from "@/lib/date-utils";
import { addMinutes, hhmm } from "@/lib/needt3/derive";
import type { V3Priority, V3Project, V3TaskPatch } from "@/lib/needt3/map";

export type { CoFacetKind, CoKind, CoMark };

/** A recognised run, as the chip says it back. */
export interface ComposerFacet {
  readonly label: string;
  readonly span: CoSpan;
}

export interface ComposerDay extends ComposerFacet {
  /** "YYYY-MM-DD", local. */
  readonly day: string;
}

export interface ComposerMinutes extends ComposerFacet {
  readonly minutes: number;
}

export interface ComposerRepeat extends ComposerFacet {
  readonly cadence: CoCadence;
}

export interface ComposerPriority extends ComposerFacet {
  readonly level: V3Priority;
}

export interface ComposerProject extends ComposerFacet {
  readonly id: string;
  readonly color: string | null;
}

export interface ComposerParse {
  readonly text: string;
  /** The words nothing claimed — the name the thing is saved under. */
  readonly title: string;
  /** The whole sentence before the first `/`, whitespace-normalised. */
  readonly sentence: string;
  readonly parts: readonly string[];
  readonly kind: CoKind;
  readonly date: ComposerDay | null;
  readonly time: ComposerMinutes | null;
  readonly duration: ComposerMinutes | null;
  readonly deadline: ComposerDay | null;
  readonly repeat: ComposerRepeat | null;
  readonly priority: ComposerPriority | null;
  readonly project: ComposerProject | null;
  /** Every claimed run, in line order, for the underlay. */
  readonly marks: readonly CoMark[];
}

/** The workspace's projects as `coParse` vocabulary. No labels, no aliases. */
export function composerVocabulary(
  projects: readonly Pick<V3Project, "id" | "name" | "color" | "icon">[]
): CoVocabulary {
  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      hue: p.color ?? "",
      glyph: p.icon ?? "",
    })),
    aliases: {},
    labels: [],
  };
}

/* ── The shorthands ─────────────────────────────────────────────────────── */

const WORDS_TO_LEVEL: Readonly<Record<string, V3Priority>> = {
  urgent: "urgent",
  important: "high",
  whenever: "low",
};

const SIGIL_TO_LEVEL: Readonly<Record<string, V3Priority>> = {
  urgent: "urgent",
  asap: "urgent",
  "1": "urgent",
  high: "high",
  important: "high",
  "2": "high",
  medium: "medium",
  normal: "medium",
  "3": "medium",
  low: "low",
  whenever: "low",
  "4": "low",
};

const LEVEL_LABEL: Readonly<Record<V3Priority, string>> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const RE_SIGIL_PROJECT = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;
const RE_SIGIL_PRIORITY =
  /(^|\s)!(urgent|asap|high|important|medium|normal|low|whenever|[1-4])(?![\p{L}\p{N}])/giu;
const RE_BARE_DURATION =
  /\b(\d{1,4})\s?(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/gi;

const fold = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");

/** "ops" abbreviates "operations": same first letter, the rest in order. */
function abbreviates(short: string, name: string) {
  if (!short || short[0] !== name[0]) return false;
  let at = 0;
  for (const ch of name) if (ch === short[at] && ++at === short.length) break;
  return at === short.length;
}

/**
 * `#ops` → the project it names: the exact name (spaces and dashes
 * ignored), else the one name it starts, else the one whose words it starts,
 * else the one whose initials it is ("#ds" → Design system), else the one it
 * abbreviates — same first letter, the rest in order ("#ops" → Operations).
 * Ambiguity at any step is no
 * match — a guess that files a task in the wrong place is worse than none.
 */
export function projectForSigil<P extends Pick<V3Project, "name">>(
  word: string,
  projects: readonly P[]
): P | null {
  const w = fold(word);
  if (!w) return null;
  const tiers: ((p: P) => boolean)[] = [
    (p) => fold(p.name) === w,
    (p) => fold(p.name).startsWith(w),
    (p) =>
      p.name
        .toLowerCase()
        .split(/[\s_-]+/)
        .some((part) => part.startsWith(w)),
    (p) =>
      p.name
        .toLowerCase()
        .split(/[\s_-]+/)
        .filter(Boolean)
        .map((part) => part[0])
        .join("") === w,
    (p) => abbreviates(w, fold(p.name)),
  ];
  for (const test of tiers) {
    const hits = projects.filter(test);
    if (hits.length === 1) return hits[0];
    if (hits.length > 1) return null;
  }
  return null;
}

function free(span: CoSpan, taken: readonly CoSpan[]) {
  return !taken.some((t) => span.from < t.to && t.from < span.to);
}

/** First match of `re` in `body` that overlaps nothing taken. */
function claim(
  body: string,
  taken: readonly CoSpan[],
  re: RegExp,
  accept: (m: RegExpExecArray, span: CoSpan) => boolean
): { m: RegExpExecArray; span: CoSpan } | null {
  // `re` is one of the module's global literals; rewind it before a scan.
  re.lastIndex = 0;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    // A leading-space group is context, not part of the claim.
    const lead = m[1] && /^\s$/.test(m[1]) ? m[1].length : 0;
    const span = { from: m.index + lead, to: m.index + m[0].length };
    if (free(span, taken) && accept(m, span)) return { m, span };
  }
  return null;
}

/** Strip the claimed runs out of the sentence and tidy what is left. */
export function unclaimed(body: string, marks: readonly CoSpan[]) {
  let out = "";
  let at = 0;
  [...marks]
    .sort((a, b) => a.from - b.from)
    .forEach(({ from, to }) => {
      out += `${body.slice(at, from)} `;
      at = Math.max(at, to);
    });
  return (out + body.slice(at))
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

/* ── The parse ──────────────────────────────────────────────────────────── */

export function composerParse(
  text: string,
  now: Date,
  projects: readonly V3Project[] = []
): ComposerParse {
  const base: CoParse = coParse(text, now, composerVocabulary(projects));
  const cut = text.indexOf("/");
  const body = cut < 0 ? text : text.slice(0, cut);
  const marks: CoMark[] = [...base.marks];
  const f = base.found;

  let project: ComposerProject | null = null;
  if (f.project) {
    const p = projects.find((x) => x.id === f.project?.project.id);
    project = {
      label: f.project.label,
      span: f.project.span,
      id: f.project.project.id,
      color: p?.color ?? null,
    };
  } else {
    let hit: V3Project | null = null;
    const got = claim(body, marks, RE_SIGIL_PROJECT, (m) => {
      hit = projectForSigil(m[2], projects);
      return !!hit;
    });
    const found = hit as V3Project | null;
    if (got && found) {
      marks.push({ ...got.span, kind: "project" });
      project = {
        label: found.name,
        span: got.span,
        id: found.id,
        color: found.color,
      };
    }
  }

  let priority: ComposerPriority | null = null;
  if (f.priority) {
    priority = {
      label: f.priority.label,
      span: f.priority.span,
      level: WORDS_TO_LEVEL[f.priority.level] ?? "medium",
    };
  } else {
    const got = claim(body, marks, RE_SIGIL_PRIORITY, () => true);
    if (got) {
      const level = SIGIL_TO_LEVEL[got.m[2].toLowerCase()];
      marks.push({ ...got.span, kind: "priority" });
      priority = { label: LEVEL_LABEL[level], span: got.span, level };
    }
  }

  let duration: ComposerMinutes | null = f.duration
    ? {
        label: f.duration.label,
        span: f.duration.span,
        minutes: f.duration.minutes,
      }
    : null;
  if (!duration) {
    const got = claim(body, marks, RE_BARE_DURATION, (m) => Number(m[1]) > 0);
    if (got) {
      const size = Number(got.m[1]);
      const hours = /^h/i.test(got.m[2]);
      marks.push({ ...got.span, kind: "duration" });
      duration = {
        label: hours ? `${size} h` : `${size} min`,
        span: got.span,
        minutes: hours ? size * 60 : size,
      };
    }
  }

  const day = (on: Date) => toLocalDateKey(on);
  marks.sort((a, b) => a.from - b.from);
  const sentence = body.replace(/\s+/g, " ").trim();

  return {
    text,
    title: unclaimed(body, marks) || sentence,
    sentence,
    parts: base.parts,
    // A habit counts per day or week; "every month" is drafted as a task.
    kind:
      base.kind === "habit" && f.repeat?.cadence === "month"
        ? "task"
        : base.kind,
    date: f.date
      ? { label: f.date.label, span: f.date.span, day: day(f.date.on) }
      : null,
    time: f.time
      ? { label: f.time.label, span: f.time.span, minutes: f.time.minutes }
      : null,
    duration,
    deadline: f.deadline
      ? {
          label: f.deadline.label,
          span: f.deadline.span,
          day: day(f.deadline.on),
        }
      : null,
    repeat: f.repeat
      ? {
          label: f.repeat.label,
          span: f.repeat.span,
          cadence: f.repeat.cadence,
        }
      : null,
    priority,
    project,
    marks,
  };
}

/**
 * Cut one recognised run out of the line, tidying the spaces it leaves.
 * The pickers and chip × use this, so the sentence stays the one source of
 * truth and the parse reports a pick like anything typed.
 */
export function stripFacet(
  text: string,
  facet: ComposerFacet | null | undefined
): string {
  if (!facet) return text;
  return (text.slice(0, facet.span.from) + text.slice(facet.span.to))
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/, "");
}

/** Replace (or add) one facet's words at the end of the line. */
export function pickFacet(
  text: string,
  facet: ComposerFacet | null | undefined,
  words: string
): string {
  const base = stripFacet(text, facet).replace(/\s+$/, "");
  return base ? `${base} ${words}` : words;
}

/* ── The drafts ─────────────────────────────────────────────────────────── */

/** The default length when the line names none (SCREENS.md, Add task). */
export const DEFAULT_ESTIMATE = 30;
const EVENT_DEFAULT_AT = "09:00";
const EVENT_DEFAULT_LENGTH = 60;

export type ComposerDraft =
  | {
      kind: "task";
      task: V3TaskPatch & { title: string };
      parts: string[];
    }
  | {
      kind: "event";
      event: {
        title: string;
        startAt: string;
        endAt: string;
        isAllDay: false;
      };
    }
  | { kind: "doc"; doc: { title: string; projectId: string | null } }
  | {
      kind: "habit";
      habit: {
        title: string;
        projectId: string | null;
        schedule: { time: string | null; perWeek: number | null };
      };
    };

/**
 * What the hooks are asked to make. `kind` is the segment's verdict (the
 * parse's, unless overruled). An event is a real calendar event; a monthly
 * cadence is drafted as a task, since a habit counts per day or week only.
 */
export function composerDraft(
  p: ComposerParse,
  now: Date,
  kind: CoKind = p.kind,
  note?: string | null
): ComposerDraft {
  const today = toLocalDateKey(now);
  const projectId = p.project?.id ?? null;
  const clock = p.time ? hhmm(p.time.minutes / 60) : null;

  if (kind === "doc") return { kind, doc: { title: p.title, projectId } };

  //todo: monthly habits — the habit API counts per week only, so a monthly
  // cadence is a task (its repeat has no v3 write path yet either).
  if (kind === "habit" && p.repeat?.cadence === "month")
    return composerDraft(p, now, "task", note);

  if (kind === "habit") {
    const c = p.repeat?.cadence;
    return {
      kind,
      habit: {
        title: p.title,
        projectId,
        schedule: {
          time: clock,
          perWeek: c === "week" || c === "weekday" ? 1 : null,
        },
      },
    };
  }

  // An event with no clock lands at 09:00 for an hour (App.jsx eventAt).
  const timed = clock ?? (kind === "event" ? EVENT_DEFAULT_AT : null);
  const est =
    p.duration?.minutes ??
    (kind === "event" ? EVENT_DEFAULT_LENGTH : DEFAULT_ESTIMATE);
  const day = p.date?.day ?? today;
  if (kind === "event") {
    const startAt = `${day}T${timed}`;
    return {
      kind,
      event: {
        title: p.title,
        startAt,
        endAt: addMinutes(startAt, est) ?? startAt,
        isAllDay: false,
      },
    };
  }
  const task: V3TaskPatch & { title: string } = {
    title: p.title,
    projectId,
    estimatedMinutes: est,
    // The prototype files a deadline as the due day (App.jsx composerCreate).
    dueDate: p.deadline?.day ?? day,
  };
  if (p.deadline) task.deadline = p.deadline.day;
  if (timed) {
    const start = `${day}T${timed}`;
    task.scheduledStart = start;
    task.scheduledEnd = addMinutes(start, est);
    task.isFixed = true;
    task.auto = false;
  }
  if (p.priority) task.priority = p.priority.level;
  const text = note?.trim();
  if (text) task.notes = text;
  //todo: a task's repeat and labels have no v3 write path yet.
  return { kind, task, parts: [...p.parts] };
}
