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
    expect(out).toContain("data-gl-upgrade");
    expect(out).not.toContain("No goals yet");
  });

  it("shows Pro an empty state that starts a goal", () => {
    const out = render({});
    expect(out).toContain("No goals yet");
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
    expect(out).toContain("2 active goals · never scheduled");
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
