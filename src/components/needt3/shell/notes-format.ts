/* What the bell's rows say, kept out of the component so it can be checked. */
import { format, isToday, isTomorrow, newDate } from "@/lib/date-utils";
import type { FeedItem } from "@/lib/needt3/hooks/notifications";

export type NoteType = "task" | "event" | "reminder" | "mention" | "system";

/**
 * The quiet glyph beside a row: what it is about. Reminders keep the alarm
 * whatever they are on; a calendar that needs reconnecting is an event.
 */
export function noteType(item: Pick<FeedItem, "kind" | "entity">): NoteType {
  switch (item.kind) {
    case "reminder":
      return "reminder";
    case "overdue":
    case "due":
      return "task";
    case "comment":
    case "share":
      return "mention";
    case "sync":
      return "event";
    default:
      return item.entity?.type === "task"
        ? "task"
        : item.entity?.type === "event"
          ? "event"
          : "system";
  }
}

/**
 * Splits a title into the part to set bold (the person, or "Needt") and the
 * rest. A title that does not begin with that name is left whole.
 */
export function splitLead(item: Pick<FeedItem, "actor" | "title">): {
  lead: string;
  rest: string;
} {
  const lead = item.actor ?? "Needt";
  return item.title.startsWith(lead)
    ? { lead, rest: item.title.slice(lead.length) }
    : { lead: "", rest: item.title };
}

/** "Overdue", "Today 14:30", "Tomorrow 09:00", or "Mon 12 Oct". */
export function whenLabel(item: Pick<FeedItem, "kind" | "at">, now: Date) {
  const at = newDate(item.at);
  if (item.kind === "due" && at < now) return "Overdue";
  const time = format(at, "HH:mm");
  if (isToday(at)) return `Today ${time}`;
  if (isTomorrow(at)) return `Tomorrow ${time}`;
  return format(at, "EEE d MMM");
}
