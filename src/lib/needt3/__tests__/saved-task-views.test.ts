import { savedViewInputSchema } from "@/lib/saved-views";

import {
  DEFAULT_TASK_VIEW_STATE,
  SAVED_NO_PROJECT,
  type TaskViewState,
  activeSavedView,
  fromSavedView,
  resolveProject,
  toSavedViewQuery,
} from "../saved-task-views";

const state = (over: Partial<TaskViewState> = {}): TaskViewState => ({
  ...DEFAULT_TASK_VIEW_STATE,
  ...over,
});

const row = (id: string, s: TaskViewState, name = id) => ({
  id,
  name,
  userId: "u1",
  visibility: "PERSONAL" as const,
  position: 0,
  ...toSavedViewQuery(s),
});

describe("saved task views", () => {
  const cases: TaskViewState[] = [
    state(),
    state({ tab: "all", project: "p1", sort: "priority", group: "project" }),
    state({
      tab: "inbox",
      project: SAVED_NO_PROJECT,
      sort: "due",
      group: "priority",
      completed: "hide",
      overdueFirst: false,
    }),
  ];

  it.each(cases)("round-trips %o", (s) => {
    expect(fromSavedView(toSavedViewQuery(s))).toEqual(s);
  });

  it.each(cases)("writes a query the API contract accepts", (s) => {
    const parsed = savedViewInputSchema.safeParse({
      name: "View",
      visibility: "PERSONAL",
      ...toSavedViewQuery(s),
    });
    expect(parsed.success).toBe(true);
  });

  it("encodes the contract fields", () => {
    const q = toSavedViewQuery(
      state({ tab: "upcoming", project: "p9", sort: "due" })
    );
    expect(q.groupBy).toBe("date");
    expect(q.filters).toContainEqual({
      field: "list",
      operator: "is",
      value: "upcoming",
    });
    expect(q.filters).toContainEqual({
      field: "projectId",
      operator: "eq",
      value: "p9",
    });
    expect(q.sort).toEqual([
      { field: "overdue", direction: "desc" },
      { field: "dueDate", direction: "asc" },
    ]);
  });

  it("reads a malformed or foreign view as the default", () => {
    expect(
      fromSavedView({ groupBy: "stage", filters: "nope", sort: [null, 3] })
    ).toEqual({ ...DEFAULT_TASK_VIEW_STATE, overdueFirst: false });
    expect(
      fromSavedView({
        groupBy: null,
        filters: [{ field: "priority", operator: "in", value: ["high"] }],
        sort: [{ field: "createdAt", direction: "desc" }],
      }).sort
    ).toBe(DEFAULT_TASK_VIEW_STATE.sort);
  });

  it("drops a project that is gone", () => {
    expect(resolveProject("gone", ["p1"])).toBeNull();
    expect(resolveProject("p1", ["p1"])).toBe("p1");
    expect(resolveProject(SAVED_NO_PROJECT, [])).toBe(SAVED_NO_PROJECT);
    expect(resolveProject(null, ["p1"])).toBeNull();
  });

  it("finds the view the list matches", () => {
    const views = [
      row("a", state({ tab: "all" })),
      row("b", state({ tab: "all", project: "p1" })),
      row("c", state({ tab: "all", project: "gone" })),
    ];
    expect(
      activeSavedView(views, state({ tab: "all", project: "p1" }), ["p1"])?.id
    ).toBe("b");
    // first match wins; a view on a gone project reads as every project
    expect(activeSavedView(views, state({ tab: "all" }), ["p1"])?.id).toBe("a");
    expect(activeSavedView(views, state({ tab: "inbox" }), ["p1"])).toBeNull();
  });
});
