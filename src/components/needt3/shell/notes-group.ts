/* THE BELL'S BURSTS — pure, so it is tested without a DOM.
 *
 * A burst of the same thing reads as one line: "6 tasks overdue" instead of
 * six rows saying "Overdue". Overdue tasks always fold into one row (two or
 * more); other kinds fold when three or more arrive back to back within two
 * hours. People are never folded: a comment from Lena and one from Tom are
 * two different things to answer.
 */
import type { FeedItem } from "@/lib/needt3/hooks/notifications";

export type NoteRow =
  | { type: "one"; item: FeedItem }
  | {
      type: "group";
      key: string;
      kind: FeedItem["kind"];
      title: string;
      items: FeedItem[];
      unread: boolean;
      at: string;
    };

const BURST_MS = 2 * 3_600_000;
const FOLDABLE = new Set<FeedItem["kind"]>([
  "reminder",
  "agent",
  "import",
  "nudge",
  "sync",
  "notification",
]);

function groupTitle(kind: FeedItem["kind"], n: number): string {
  switch (kind) {
    case "overdue":
      return `${n} tasks overdue`;
    case "reminder":
      return `${n} reminders`;
    case "agent":
      return `Needt made ${n} changes`;
    case "import":
      return `${n} imports finished`;
    case "sync":
      return `${n} calendars need reconnecting`;
    default:
      return `${n} notifications`;
  }
}

function group(kind: FeedItem["kind"], items: FeedItem[]): NoteRow {
  return {
    type: "group",
    key: `group:${kind}:${items[0].key}`,
    kind,
    title: groupTitle(kind, items.length),
    items,
    unread: items.some((i) => i.unread),
    at: items[0].at,
  };
}

/** Rows for the Activity list, newest first as the feed gives them. */
export function groupFeed(items: FeedItem[]): NoteRow[] {
  const overdue = items.filter((i) => i.kind === "overdue");
  const rest =
    overdue.length >= 2 ? items.filter((i) => i.kind !== "overdue") : items;
  const out: NoteRow[] = [];
  let run: FeedItem[] = [];
  const flush = () => {
    if (run.length >= 3) out.push(group(run[0].kind, run));
    else for (const item of run) out.push({ type: "one", item });
    run = [];
  };
  for (const item of rest) {
    const head = run[0];
    const joins =
      head &&
      FOLDABLE.has(item.kind) &&
      item.kind === head.kind &&
      Math.abs(Date.parse(head.at) - Date.parse(item.at)) <= BURST_MS;
    if (!joins) flush();
    if (FOLDABLE.has(item.kind) && !item.actor) run.push(item);
    else out.push({ type: "one", item });
  }
  flush();
  if (overdue.length >= 2) {
    // The overdue row sits where its newest member would have.
    const g = group("overdue", overdue);
    const at = Date.parse(g.type === "group" ? g.at : "");
    const index = out.findIndex(
      (r) => Date.parse(r.type === "one" ? r.item.at : r.at) < at
    );
    out.splice(index === -1 ? out.length : index, 0, g);
  }
  return out;
}

/** Every item key under a row, for marking it read or snoozing it. */
export function rowKeys(row: NoteRow): string[] {
  return row.type === "one" ? [row.item.key] : row.items.map((i) => i.key);
}
