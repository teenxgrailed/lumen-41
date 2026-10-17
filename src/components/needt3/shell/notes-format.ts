/* What the bell's rows say, kept out of the component so it can be checked. */
import { format, isToday, isTomorrow, newDate } from "@/lib/date-utils";
import type { FeedItem } from "@/lib/needt3/hooks/notifications";

import type { ArtName } from "../menu/Art";

/** The drawing beside a row that was not written by a person. */
export function artFor(kind: FeedItem["kind"]): ArtName {
  switch (kind) {
    case "sync":
      return "event";
    case "import":
      return "import";
    default:
      return "task";
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
