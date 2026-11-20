/**
 * The Goals screen and a project's goals strip: Free sees Pro, Pro sees the
 * list with progress, an open goal shows its tasks, check-in and history.
 * Server markup with plain props.
 */
import { createElement as h } from "react";

import { renderToStaticMarkup } from "react-dom/server";

import type { GoalView } from "@/lib/goals";

import { draftFromForm } from "../GoalsScreen";
import {
  EMPTY_GOAL_FORM,
  type GoalDetailData,
  GoalsView,
  type GoalsViewProps,
  ProjectGoalsView,
} from "../GoalsView";

jest.mock("../../root/V3Root", () => ({ useDesignV3: () => false }));
jest.mock("next/navigation", () => ({
  usePathname: () => "/goals",
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function goal(fields: Partial<GoalView> = {}): GoalView {
  return {
    id: "g1",
    title: "Save 2 500 CHF",
    description: "So a broken laptop is not a crisis",
    deadline: "2026-12-31T00:00:00.000Z",
    area: "money",
    status: "active",
    achievedAt: null,
    parentId: null,
    position: 1,
    targetValue: 2500,
    currentValue: 1000,
    unit: "CHF",
    manualPercent: null,
    checkIn: { enabled: true, weekday: 1, hour: 9, lastAt: null },
    projectIds: [],
    childIds: [],
    sourceTaskId: null,
    archivedAt: null,
    progress: {
      source: "manual",
      ratio: 0.4,
      percent: 40,
      done: 0,
      total: 0,
      current: 1000,
      target: 2500,
      unit: "CHF",
    },
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    href: "/goals?goal=g1",
    ...fields,
  };
}

const noop = () => undefined;
const base: GoalsViewProps = {
  goals: [],
  pro: true,
  selectedId: null,
  detail: undefined,
  form: null,
  onSelect: noop,
  onNew: noop,
  onUpgrade: noop,
  onFormChange: noop,
  onFormClose: noop,
  onFormSave: noop,
  onCheckIn: noop,
  onStatus: noop,
  onArchive: noop,
  onAddTask: noop,
  onLinkTask: noop,
  onToggleTask: noop,
};
const render = (props: Partial<GoalsViewProps>) =>
  renderToStaticMarkup(h(GoalsView, { ...base, ...props }));

describe("Goals screen", () => {
  it("shows Free the Pro label and a way to the plans, not a form", () => {
    const out = render({ pro: false });
    expect(out).toContain("Goals are part of Pro");
    expect(out).toContain('data-pro-badge="locked"');
    // Free keeps the round +, which opens the plans
    expect(out).toContain("data-page-add");
    expect(out).not.toContain("data-gl-new");
    expect(out).toContain("data-gl-upgrade");
    expect(out).not.toContain("No goals yet");
  });

  it("shows Pro an empty state that starts a goal", () => {
    const out = render({});
    expect(out).toContain("No goals yet");
    // one New goal only: the empty state's, none in the header
    expect(out.match(/data-gl-new/g)).toHaveLength(1);
    expect(out).not.toContain("data-page-add");
    expect(out).not.toContain("data-pro-badge");
  });

  it("lists goals with progress, subgoals under their parent, closed ones folded", () => {
    const out = render({
      goals: [
        goal(),
        goal({
          id: "g2",
          title: "Open a savings account",
          parentId: "g1",
          progress: {
            ...goal().progress,
            source: "tasks",
            done: 1,
            total: 2,
            percent: 50,
          },
        }),
        goal({ id: "g3", title: "Old idea", status: "dropped" }),
      ],
    });
    expect(out).toContain("2 active goals");
    expect(out).not.toContain("never scheduled");
    // "+ New goal" ends the header; Pro has no second, round +
    expect(out).toContain("data-gl-new");
    expect(out).not.toContain("data-page-add");
    expect(out).toContain("1 000 / 2 500 CHF");
    expect(out).toContain("1 of 2 tasks");
    expect(out).toContain('class="gl-row nx-press nx-focus is-sub"');
    expect(out).toContain("Money · by 31 Dec 2026");
    expect(out).toContain('data-gl-bar="40"');
    expect(out).toContain("Closed goals (1)");
    expect(out).not.toContain("Old idea");
  });

  it("opens a goal with its why, check-in, tasks and history", () => {
    const detail: GoalDetailData = {
      goal: goal(),
      subgoals: [],
      tasks: [
        {
          id: "t1",
          title: "Set a monthly transfer",
          status: "todo",
          goalId: "g1",
        },
        {
          id: "t2",
          title: "Sell the old bike",
          status: "completed",
          goalId: null,
        },
      ],
      checkIns: [
        {
          id: "c1",
          goalId: "g1",
          value: 1000,
          percent: null,
          note: "Bonus",
          createdAt: "2026-10-26T09:00:00.000Z",
        },
      ],
    };
    const out = render({
      goals: [goal()],
      selectedId: "g1",
      detail,
      linkable: [{ id: "t9", title: "Cancel the gym" }],
    });
    expect(out).toContain('data-gl-panel="g1"');
    expect(out).toContain("So a broken laptop is not a crisis");
    expect(out).toContain("data-gl-checkin");
    expect(out).toContain("Now (CHF)");
    expect(out).toContain("Set a monthly transfer");
    expect(out).toContain("from a linked project");
    expect(out).toContain("Link a task");
    // The shared select renders only its selected label until it is opened.
    expect(out).toContain("Link a task…");
    expect(out).not.toContain("Cancel the gym");
    expect(out).toContain("1000 CHF · Bonus");
    expect(out).toContain("data-gl-achieve");
  });

  it("asks no check-in when linked tasks measure the goal", () => {
    const measured = goal({
      progress: { ...goal().progress, source: "tasks", done: 1, total: 3 },
    });
    const out = render({
      goals: [measured],
      selectedId: "g1",
      detail: { goal: measured, subgoals: [], tasks: [], checkIns: [] },
    });
    expect(out).not.toContain("data-gl-checkin");
  });

  it("draws the new-goal sheet and turns it into a create body", () => {
    const out = render({ form: { ...EMPTY_GOAL_FORM, title: "Run" } });
    expect(out).toContain("data-gl-sheet");
    expect(out).toContain("Relationships");
    expect(
      draftFromForm({
        ...EMPTY_GOAL_FORM,
        title: " Save ",
        area: "money",
        targetValue: "2 500",
        unit: "CHF",
        deadline: "2026-12-31",
      })
    ).toEqual({
      title: "Save",
      area: "money",
      deadline: "2026-12-31",
      targetValue: 2500,
      currentValue: 0,
      unit: "CHF",
    });
  });
});

describe("Project goals", () => {
  it("shows a project's active goals with progress, as links", () => {
    const out = renderToStaticMarkup(
      h(ProjectGoalsView, {
        goals: [goal(), goal({ id: "g2", title: "Done", status: "achieved" })],
      })
    );
    expect(out).toContain('data-gl-project-goal="g1"');
    expect(out).toContain('href="/goals?goal=g1"');
    expect(out).toContain("40%");
    expect(out).not.toContain("g2");
  });

  it("draws nothing without goals", () => {
    expect(renderToStaticMarkup(h(ProjectGoalsView, { goals: [] }))).toBe("");
  });
});

describe("Goal cards (habits_cards_v1)", () => {
  const cards = {
    nextSteps: { g1: { id: "t1", title: "Open the account" } },
    today: "2026-11-15",
  };

  it("off: the list as before, with no cards", () => {
    const out = render({ goals: [goal()] });
    expect(out).toContain("data-gl-list");
    expect(out).toContain('data-gl-goal="g1"');
    expect(out).not.toContain("data-gl-cards");
    expect(out).not.toContain("data-gl-card=");
  });

  it("on: each goal is a card with its next step, deadline and progress", () => {
    const out = render({ goals: [goal()], cards });
    expect(out).toContain("data-gl-cards");
    expect(out).toContain('data-gl-card="g1"');
    expect(out).toContain("Open the account");
    expect(out).toContain("by 31 Dec 2026");
    expect(out).toContain("1 000 / 2 500 CHF");
    expect(out).not.toContain("data-gl-list");
  });

  // 40 days from creation to deadline, 30 gone, 20% done: behind, 10 days left
  const risky = goal({
    id: "g2",
    title: "Ship the report",
    deadline: "2026-11-25T00:00:00.000Z",
    createdAt: "2026-10-16T00:00:00.000Z",
    progress: { ...goal().progress, percent: 20, ratio: 0.2 },
  });

  it("puts a goal at risk first, with the days left; the others are on track", () => {
    const out = render({
      goals: [goal(), risky],
      cards: { ...cards, nextSteps: {} },
    });
    expect(out.indexOf('data-gl-card="g2"')).toBeLessThan(
      out.indexOf('data-gl-card="g1"')
    );
    expect(out).toContain("At risk · 10d left");
    expect(out).toContain('data-gl-risk="at-risk"');
    expect(out).toContain("On track");
    expect(out).toContain('data-gl-risk="on-track"');
  });

  it("does not call a far deadline at risk, however far behind", () => {
    const far = goal({
      deadline: "2027-03-01T00:00:00.000Z",
      progress: { ...goal().progress, percent: 0, ratio: 0 },
    });
    const out = render({ goals: [far], cards });
    expect(out).not.toContain("At risk");
    expect(out).toContain("On track");
  });

  it("shows the next step with Schedule, or the day it is already on", () => {
    const withSchedule = {
      goals: [goal()],
      cards,
      onSchedule: noop,
    };
    const open = render(withSchedule);
    expect(open).toContain("Open the account");
    expect(open).toContain('data-gl-schedule="g1"');
    expect(open).toContain("Schedule");

    const placed = render({
      ...withSchedule,
      cards: { ...cards, stepDays: { t1: "2026-11-16" } },
    });
    expect(placed).toContain("Tomorrow");
    expect(placed).not.toContain("data-gl-schedule");
  });

  it("offers Plan a task only when nothing is planned this week", () => {
    const props = { goals: [goal()], onSchedule: noop };
    const none = render({
      ...props,
      cards: { ...cards, planned: { g1: false } },
    });
    expect(none).toContain('data-gl-plan="g1"');
    expect(none).toContain("Plan a task");

    const some = render({
      ...props,
      cards: { ...cards, planned: { g1: true } },
    });
    expect(some).not.toContain("data-gl-plan");

    // not known yet: no flash of the button before the tasks are read
    expect(render({ ...props, cards })).not.toContain("data-gl-plan");
  });
});
