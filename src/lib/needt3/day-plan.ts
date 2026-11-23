/**
 * The day plan on the phone, pure: what Today shows of a plan, what the
 * evening close sends to the server, and what tomorrow will look like.
 * Nothing here reads the clock or the network. The server (src/services/
 * day-plan) owns the rules; this only shapes its answers for the screens.
 */
import type {
  DayPlanSnapshot,
  PlanItemView,
  PlanView,
  TaskLite,
} from "@/services/day-plan/plan";

export type { DayPlanSnapshot, PlanItemView, PlanView, TaskLite };

export type CloseChoice = "tomorrow" | "someday" | "delete";

export interface CloseResolution {
  taskId: string;
  resolution: CloseChoice;
}

export interface CloseBody {
  date: string;
  resolutions: CloseResolution[];
  confirmOverflow?: boolean;
}

export interface DayPlanSections {
  /** The plan’s main tasks (up to the main limit), in plan order. */
  main: PlanItemView[];
  /** The rest of the plan, in plan order. */
  rest: PlanItemView[];
  /** Earlier leftovers that wait for a decision, outside today’s limit. */
  needsDecision: TaskLite[];
}

const finished = (item: PlanItemView) =>
  item.status === "completed" ||
  item.resolution === "done" ||
  item.resolution === "deleted";

/** Today’s plan as the screen draws it: main, the rest, needs a decision. */
export function planSections(snapshot: DayPlanSnapshot | undefined | null) {
  const plan = snapshot?.plan;
  const sections: DayPlanSections = {
    main: [],
    rest: [],
    needsDecision: snapshot?.needsDecision ?? [],
  };
  if (!plan) return sections;
  for (const item of plan.items) {
    (item.isMain ? sections.main : sections.rest).push(item);
  }
  return sections;
}

/**
 * The ids of the plan's picks that still belong to today's count: items not
 * yet resolved, and the ones that are done. A leftover the evening close sent
 * to tomorrow or Someday keeps its item (with a resolution) but is no longer
 * today's. The one source of `include` for `daySummary` on Home, the Calendar
 * and the menu.
 */
const NO_PICKS: ReadonlySet<string> = new Set();
export function planPickIds(
  snapshot: DayPlanSnapshot | undefined | null
): ReadonlySet<string> {
  const items = snapshot?.plan?.items;
  if (!items?.length) return NO_PICKS;
  return new Set(
    items
      .filter(
        (i) =>
          i.resolution == null ||
          i.resolution === "done" ||
          i.status === "completed"
      )
      .map((i) => i.taskId)
  );
}

/** Whether Today should be drawn from the plan: one exists for the day. */
export const planIsShown = (snapshot: DayPlanSnapshot | undefined | null) =>
  !!snapshot?.plan && snapshot.plan.taskCount > 0;

const hours = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/** "3 of 5 tasks · 2 h 10 min of 4 h focus", the one quiet line. */
export function planLine(plan: PlanView): string {
  return [
    `${plan.taskCount} of ${plan.limit} tasks`,
    `${hours(plan.focusMinutes)} of ${hours(plan.focusBudgetMinutes)} focus`,
  ].join(" · ");
}

/** Planned tasks that are still open: what the evening has to settle. */
export function leftoversOf(plan: PlanView | null | undefined): PlanItemView[] {
  if (!plan || plan.status === "closed") return [];
  return plan.items.filter((item) => !finished(item));
}

/** What a leftover with no pick goes to: tomorrow, the gentlest answer. */
export const DEFAULT_CHOICE: CloseChoice = "tomorrow";

/**
 * The close request: every leftover gets exactly one resolution (its pick, or
 * tomorrow) or the server refuses and nothing changes.
 */
export function closeBody(
  date: string,
  leftovers: readonly { taskId: string }[],
  choices: Readonly<Record<string, CloseChoice>>,
  confirmOverflow = false
): CloseBody {
  return {
    date,
    resolutions: leftovers.map((l) => ({
      taskId: l.taskId,
      resolution: choices[l.taskId] ?? DEFAULT_CHOICE,
    })),
    ...(confirmOverflow ? { confirmOverflow: true } : {}),
  };
}

export interface TomorrowPreview {
  titles: string[];
  count: number;
  limit: number;
  /** More than the limit: the server asks for a confirmation. */
  over: boolean;
}

/**
 * Tomorrow’s plan as it will stand after the close: what is already in it,
 * then the leftovers sent to tomorrow (a task already there is not repeated).
 */
export function tomorrowPreview(
  tomorrow: PlanView | null | undefined,
  leftovers: readonly { taskId: string; title: string }[],
  choices: Readonly<Record<string, CloseChoice>>,
  limit: number
): TomorrowPreview {
  const have = new Map(
    (tomorrow?.items ?? []).map((item) => [item.taskId, item.title])
  );
  const added = leftovers.filter(
    (l) =>
      (choices[l.taskId] ?? DEFAULT_CHOICE) === "tomorrow" &&
      !have.has(l.taskId)
  );
  const titles = [...have.values(), ...added.map((l) => l.title)];
  return {
    titles,
    count: titles.length,
    limit,
    over: titles.length > limit,
  };
}

/** The server said the day plan is switched off (the `day_plan` kill switch). */
export function isPlanOff(error: unknown): boolean {
  const e = error as { status?: number; message?: string } | null;
  return !!e && e.status === 404 && e.message === "disabled";
}

/** Closing would put more into tomorrow than its limit and wants a yes. */
export function isOverflow(error: unknown): boolean {
  const e = error as { status?: number; message?: string } | null;
  return !!e && e.status === 409 && e.message === "overflow";
}
