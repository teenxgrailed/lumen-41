import { applyImportPlan } from "../apply";
import { mapTodoistPriority, planTodoistImport } from "../todoist/mapper";
import { todoistSnapshotSchema } from "../todoist/types";
import { ImportCancelledError, type ImportLimitGuard } from "../types";
import fixture from "./fixtures/todoist-sync.json";
import { createMemoryStore } from "./memory-store";

const snapshot = todoistSnapshotSchema.parse(fixture);
const allowAll: ImportLimitGuard = {
  allowCreate: async () => ({ allowed: true }),
};

describe("mapTodoistPriority", () => {
  it("maps Todoist API priorities 4/3/2/1 to URGENT/HIGH/MEDIUM/LOW", () => {
    expect(mapTodoistPriority(4)).toBe("URGENT");
    expect(mapTodoistPriority(3)).toBe("HIGH");
    expect(mapTodoistPriority(2)).toBe("MEDIUM");
    expect(mapTodoistPriority(1)).toBe("LOW");
  });
});

describe("planTodoistImport", () => {
  const plan = planTodoistImport(snapshot);
  const task = (id: string) => plan.tasks.find((t) => t.externalId === id);

  it("flattens projects, keeps the parent path, leaves out Inbox and archived", () => {
    expect(plan.projects.map((p) => p.name)).toEqual(["Work", "Clients"]);
    const clients = plan.projects.find((p) => p.name === "Clients")!;
    expect(clients.description).toContain("In Todoist: Work / Clients");
    expect(clients.description).toContain(
      "2026-09-22: Main contact: billing@acme.example"
    );
  });

  it("turns sections into stages in section order, not Inbox sections", () => {
    expect(plan.stages.map((s) => s.name)).toEqual(["Backlog", "Doing"]);
    expect(plan.warnings.map((w) => w.code)).toContain("inbox_section_skipped");
  });

  it("maps a task's dates, estimate, priority, labels and comments", () => {
    const roadmap = task("6X7rM8997g3RQmvh")!;
    expect(roadmap.title).toBe("Ship the Q4 roadmap");
    expect(roadmap.projectExternalId).toBe("6Jf8VQXxpwv56VQ8");
    expect(roadmap.stageExternalId).toBe("6X7FxXvX84jHphx2");
    expect(roadmap.dueDate?.toISOString()).toBe("2026-10-20T00:00:00.000Z");
    expect(roadmap.deadline?.toISOString()).toBe("2026-10-24T00:00:00.000Z");
    expect(roadmap.estimatedMinutes).toBe(90);
    expect(roadmap.priorityLevel).toBe("URGENT");
    expect(roadmap.tagNames).toEqual(["deep-work"]);
    expect(roadmap.description).toContain("Draft is in the shared drive.");
    expect(roadmap.description).toContain(
      "2026-10-02: Remember the hiring slide"
    );
  });

  it("makes first-level sub-tasks parts and deeper ones separate tasks", () => {
    expect(plan.parts.map((p) => p.title)).toEqual([
      "Collect team input",
      "Write the summary",
    ]);
    expect(
      plan.parts.every((p) => p.taskExternalId === "6X7rM8997g3RQmvh")
    ).toBe(true);
    const deep = task("6X7rM8997g3RQmv3")!;
    expect(deep.projectExternalId).toBe("6Jf8VQXxpwv56VQ8");
    expect(deep.stageExternalId).toBe("6X7FxXvX84jHphx2");
    expect(deep.description).toContain('Sub-task of "Write the summary"');
    expect(plan.warnings.map((w) => w.code)).toContain(
      "subtask_details_dropped"
    );
  });

  it("converts recurrence it can read and warns about the rest", () => {
    expect(task("6X7rM8997g3RQmv5")!.recurrenceRule).toBe(
      "FREQ=WEEKLY;BYDAY=FR"
    );
    expect(task("6X7rM8997g3RQmv6")!.recurrenceRule).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=-1"
    );
    const passport = task("6X7rM8997g3RQmv7")!;
    expect(passport.recurrenceRule).toBeNull();
    expect(passport.description).toContain(
      "Repeats in Todoist: every 3rd workday of the month"
    );
    expect(passport.projectExternalId).toBeNull(); // Inbox → Needt Inbox
    expect(passport.stageExternalId).toBeNull();
    expect(plan.warnings.map((w) => w.code)).toContain(
      "recurrence_unsupported"
    );
  });

  it("keeps shared labels as tags and skips deleted ones", () => {
    expect(plan.tags.map((t) => t.name).sort()).toEqual([
      "calls",
      "deep-work",
      "team-shared",
    ]);
  });

  it("does not estimate in days", () => {
    expect(task("6X7rM8997g3RQmv6")!.estimatedMinutes).toBeNull();
    expect(plan.warnings.map((w) => w.code)).toContain("duration_days_skipped");
  });

  it("skips completed, archived-project and deleted objects, attachments and reminders", () => {
    const ids = plan.tasks.map((t) => t.externalId);
    expect(ids).not.toContain("6X7rM8997g3RQmv4"); // checked sub-task
    expect(ids).not.toContain("6X7rM8997g3RQmv8"); // checked
    expect(ids).not.toContain("6X7rM8997g3RQmv9"); // archived project
    // archived project, inbox section, deleted label, 3 items,
    // 1 attachment, 1 reminder
    expect(plan.skipped).toBe(8);
    expect(plan.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["attachment_skipped", "reminders_skipped"])
    );
  });
});

describe("applyImportPlan", () => {
  it("writes everything once and re-running updates instead of duplicating", async () => {
    const mem = createMemoryStore();
    const plan = planTodoistImport(snapshot);

    const first = await applyImportPlan(plan, mem.store, allowAll);
    const sizes = () => ({
      projects: mem.projects.size,
      stages: mem.stages.size,
      tags: mem.tags.size,
      tasks: mem.tasks.size,
      parts: mem.parts.size,
    });
    const afterFirst = sizes();
    expect(afterFirst).toEqual({
      projects: 2,
      stages: 2,
      tags: 3,
      tasks: 5,
      parts: 2,
    });
    expect(first.counts).toEqual({
      total: 14 + plan.skipped,
      done: 14,
      skipped: plan.skipped,
      failed: 0,
    });

    // Second run with an edited title: same rows, new title.
    const edited = todoistSnapshotSchema.parse({
      ...fixture,
      items: fixture.items.map((i) =>
        i.id === "6X7rM8997g3RQmvh" ? { ...i, content: "Ship the roadmap" } : i
      ),
    });
    const second = await applyImportPlan(
      planTodoistImport(edited),
      mem.store,
      allowAll
    );
    expect(sizes()).toEqual(afterFirst);
    expect(second.counts.done).toBe(14);
    const titles = [...mem.tasks.values()].map((t) => t.title);
    expect(titles).toContain("Ship the roadmap");
    expect(titles).not.toContain("Ship the Q4 roadmap");
  });

  it("links tasks to their project, stage and tags", async () => {
    const mem = createMemoryStore();
    await applyImportPlan(planTodoistImport(snapshot), mem.store, allowAll);
    const roadmapId = mem.maps.get("task:6X7rM8997g3RQmvh")!;
    const roadmap = mem.tasks.get(roadmapId)!;
    expect(roadmap.projectId).toBe(mem.maps.get("project:6Jf8VQXxpwv56VQ8"));
    expect(roadmap.stageId).toBe(mem.maps.get("stage:6X7FxXvX84jHphx2"));
    expect(roadmap.tagIds).toEqual([mem.tags.get("deep-work")]);
    const partTaskIds = [...mem.parts.values()].map((p) => p.taskId);
    expect(new Set(partTaskIds)).toEqual(new Set([roadmapId]));
  });

  it("counts a row the plan limit refuses as skipped, with a warning, and goes on", async () => {
    const mem = createMemoryStore();
    const plan = planTodoistImport(snapshot);
    const noNewProjects: ImportLimitGuard = {
      allowCreate: async (entityType) =>
        entityType === "project"
          ? { allowed: false, reason: "Your plan allows no more projects." }
          : { allowed: true },
    };
    const result = await applyImportPlan(plan, mem.store, noNewProjects);
    expect(mem.projects.size).toBe(0);
    // Stages need a project, so they are skipped too; tasks land in Inbox.
    expect(mem.stages.size).toBe(0);
    expect(mem.tasks.size).toBe(5);
    expect([...mem.tasks.values()].every((t) => t.projectId === null)).toBe(
      true
    );
    expect(result.counts.failed).toBe(0);
    expect(result.counts.skipped).toBe(plan.skipped + 2 + 2);
    expect(result.warnings.filter((w) => w.code === "plan_limit")).toHaveLength(
      2
    );
    expect(
      result.counts.done + result.counts.skipped + result.counts.failed
    ).toBe(result.counts.total);
  });

  it("counts a failed write and keeps going", async () => {
    const mem = createMemoryStore();
    const store = {
      ...mem.store,
      writeTask: jest
        .fn()
        .mockRejectedValueOnce(new Error("boom"))
        .mockImplementation(mem.store.writeTask),
    };
    const result = await applyImportPlan(
      planTodoistImport(snapshot),
      store,
      allowAll
    );
    expect(result.counts.failed).toBe(1);
    expect(mem.tasks.size).toBe(4);
    expect(result.warnings.some((w) => w.code === "write_failed")).toBe(true);
  });

  it("stops at the next check once the run is cancelled", async () => {
    const mem = createMemoryStore();
    const big = todoistSnapshotSchema.parse({
      ...fixture,
      items: Array.from({ length: 60 }, (_, n) => ({
        id: `bulk-${n}`,
        project_id: "6Jf8VQXxpwv56VQ8",
        content: `Bulk ${n}`,
        priority: 1,
        labels: [],
      })),
    });
    await expect(
      applyImportPlan(planTodoistImport(big), mem.store, allowAll, {
        isCancelled: async () => true,
      })
    ).rejects.toBeInstanceOf(ImportCancelledError);
    expect(mem.tasks.size).toBeLessThan(60);
  });
});
