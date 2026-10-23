/**
 * Quick-add text to task fields, deterministic and without AI:
 *   "Call Anna tomorrow at 3pm 30m #Work !high"
 *   "отчёт в пятницу 2ч #работа"
 * Dates and times come from chrono-node (English, Russian, Ukrainian, German,
 * French, Spanish, Italian, Portuguese, Dutch); durations, priority and
 * project are Needt's own tokens. Pure apart from the clock passed in.
 */
import * as chrono from "chrono-node";

export type QuickAddPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface QuickAddToken {
  kind: "date" | "duration" | "priority" | "project";
  /** The text as typed, for highlighting it in an input. */
  text: string;
  index: number;
}

export interface QuickAdd {
  title: string;
  /** A time was given ("at 3pm", "в 15:00"): when to start. */
  start?: string;
  /** Only a day was given: due by the end of that day. */
  deadline?: string;
  estimatedMinutes?: number;
  priorityLevel?: QuickAddPriority;
  /** The project name as typed after "#"; the caller matches it to an id. */
  project?: string;
  tokens: QuickAddToken[];
}

const PARSERS = [
  chrono.casual,
  chrono.ru.casual,
  chrono.uk.casual,
  chrono.de.casual,
  chrono.fr.casual,
  chrono.es.casual,
  chrono.it.casual,
  chrono.pt.casual,
  chrono.nl.casual,
];

const PRIORITY: Record<string, QuickAddPriority> = {
  low: "LOW",
  medium: "MEDIUM",
  med: "MEDIUM",
  high: "HIGH",
  urgent: "URGENT",
  "1": "URGENT",
  "2": "HIGH",
  "3": "MEDIUM",
  "4": "LOW",
};

const DURATION =
  /(?<![\p{L}\d])(\d+(?:[.,]\d+)?)\s?(h|hr|hrs|hours?|ч|час(?:а|ов)?)(?:\s?(\d+)\s?(m|min|мин|м))?(?![\p{L}])|(?<![\p{L}\d])(\d+)\s?(m|min|mins|minutes?|мин|минут|м)(?![\p{L}])/iu;
const PRIORITY_TOKEN = /(?<!\S)!(low|medium|med|high|urgent|[1-4])(?!\S)/i;
const PROJECT_TOKEN = /(?<!\S)#([\p{L}\p{N}_-]+)/u;

/** Minutes east of UTC for a zone at an instant ("Europe/Kyiv" -> 180). */
export function zoneOffsetMinutes(timeZone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const name = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!m) return 0;
  const minutes = Number(m[2]) * 60 + Number(m[3] ?? 0);
  return m[1] === "-" ? -minutes : minutes;
}

/** End of a calendar day (23:59 local in `offset`) as a UTC instant. */
function endOfLocalDay(date: Date, offset: number): Date {
  const local = new Date(date.getTime() + offset * 60_000);
  local.setUTCHours(23, 59, 0, 0);
  return new Date(local.getTime() - offset * 60_000);
}

function cut(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

export function parseQuickAdd(
  input: string,
  options: { now: Date; timeZone?: string }
): QuickAdd {
  const tokens: QuickAddToken[] = [];
  let text = input.trim().slice(0, 500);
  const out: QuickAdd = { title: "", tokens };

  const priority = text.match(PRIORITY_TOKEN);
  if (priority?.index !== undefined) {
    out.priorityLevel = PRIORITY[priority[1].toLowerCase()];
    tokens.push({ kind: "priority", text: priority[0], index: priority.index });
    text = cut(text, priority.index, priority[0].length);
  }

  const project = text.match(PROJECT_TOKEN);
  if (project?.index !== undefined) {
    out.project = project[1];
    tokens.push({ kind: "project", text: project[0], index: project.index });
    text = cut(text, project.index, project[0].length);
  }

  const duration = text.match(DURATION);
  if (duration?.index !== undefined) {
    const minutes = duration[1]
      ? Math.round(parseFloat(duration[1].replace(",", ".")) * 60) +
        (duration[3] ? Number(duration[3]) : 0)
      : Number(duration[5]);
    if (minutes > 0 && minutes <= 24 * 60) {
      out.estimatedMinutes = minutes;
      tokens.push({
        kind: "duration",
        text: duration[0],
        index: duration.index,
      });
      text = cut(text, duration.index, duration[0].length);
    }
  }

  const offset = options.timeZone
    ? zoneOffsetMinutes(options.timeZone, options.now)
    : 0;
  const reference = { instant: options.now, timezone: offset };
  let best: chrono.ParsedResult | null = null;
  for (const parser of PARSERS) {
    const [hit] = parser.parse(text, reference, { forwardDate: true });
    if (hit && (!best || hit.text.length > best.text.length)) best = hit;
  }
  if (best) {
    const date = best.start.date();
    if (best.start.isCertain("hour")) out.start = date.toISOString();
    else out.deadline = endOfLocalDay(date, offset).toISOString();
    tokens.push({ kind: "date", text: best.text, index: best.index });
    text = cut(text, best.index, best.text.length);
  }

  out.title = text
    .replace(/\s+/g, " ")
    .replace(/\s+(at|on|by|в|во|до|на|um|am)$/i, "")
    .trim();
  return out;
}
