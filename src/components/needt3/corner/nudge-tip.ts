/* THE TIP'S RULES — kept out of the component so they can be checked.
 *
 * The tip is the painted-sky card above the Ask pill (prototype Chat.jsx
 * `ChatTip`). Rare on purpose (PORT §corner): the first one after ~9 s, then
 * minutes apart, never while the panel is open, the agent is mid-run, a
 * notice is already speaking, or the person is in a setup or money place.
 */
import type { ApiNudge, NudgeType } from "@/lib/needt3/hooks/nudges";

export const TIP_FIRST_MS = 9_000;
export const TIP_EVERY_MS = 75_000;
/** Auto-dismiss; hovering or focusing the card pauses the clock. */
export const TIP_AUTO_MS = 8_000;
/** What is left of the clock after a pause never drops below this. */
export const TIP_MIN_LEFT_MS = 1_200;

export type TipAct =
  /** Runs the scheduler (preview → apply, with Undo). */
  | { kind: "fill"; label: string }
  /** Moves the app to a place. */
  | { kind: "go"; label: string; href: string };

export interface TipNote {
  id: string;
  type: NudgeType;
  title: string;
  body: string;
  act: TipAct;
}

const ACT_LABEL: Record<NudgeType, string> = {
  FREE_TIME: "Fill it",
  OVERBOOKED_DAY: "See the plan",
  OVERDUE_TASK: "Open",
  DEADLINE_UNREACHABLE: "Open",
  MISSED_FOCUS: "Start",
};

/** A same-origin path, or "/today": a deep link is data, never trusted. */
export function safeHref(link: string): string {
  return /^\/(?!\/)/.test(link) ? link : "/today";
}

export function noteFromNudge(n: ApiNudge): TipNote {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    act:
      n.type === "FREE_TIME"
        ? { kind: "fill", label: ACT_LABEL.FREE_TIME }
        : {
            kind: "go",
            label: ACT_LABEL[n.type] ?? "Open",
            href: safeHref(n.deepLink),
          },
  };
}

/** Places where the tip stays away: setup and money. */
export function quietPlace(pathname: string | null | undefined): boolean {
  const first = (pathname ?? "").split("/")[1] ?? "";
  return ["connections", "settings", "setup", "auth", "onboarding"].includes(
    first
  );
}

export interface TipGate {
  now: number;
  mountedAt: number;
  /** When the last tip appeared, or null if none has. */
  lastShownAt: number | null;
  /** Panel open, agent running, a notice up, a quiet place, or a tip showing. */
  blocked: boolean;
  queued: number;
}

/** True when a queued nudge may surface now. */
export function mayShowTip(g: TipGate): boolean {
  if (g.blocked || g.queued <= 0) return false;
  if (g.lastShownAt === null) return g.now - g.mountedAt >= TIP_FIRST_MS;
  return g.now - g.lastShownAt >= TIP_EVERY_MS;
}

/**
 * How long ago, as the bell says it: "now", "12 min", "3 h", "Yesterday",
 * then a short date ("3 Sep"). Times are epoch milliseconds.
 */
export function agoLabel(then: number, now: number): string {
  const min = Math.max(0, Math.floor((now - then) / 60_000));
  if (min < 1) return "Now";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(then);
}
