import { pageEditorSchema } from "@/lib/pages/page-editor-schema";

import {
  type Known,
  type LinkedItem,
  type RemoteTask,
  collectTaskItems,
  reconcile,
  removedTaskIds,
  taskItemIds,
  taskWriteBody,
} from "../task-link-sync";

const item = (over: Partial<LinkedItem> = {}): LinkedItem => ({
  taskId: "t1",
  text: "Pay the invoice",
  checked: false,
  due: null,
  ...over,
});
const remote = (over: Partial<RemoteTask> = {}): RemoteTask => ({
  id: "t1",
  title: "Pay the invoice",
  done: false,
  due: null,
  trashed: false,
  ...over,
});
const known = (over: Partial<Known> = {}): Known => ({
  text: "Pay the invoice",
  checked: false,
  due: null,
  ...over,
});
const run = (
  items: LinkedItem[],
  r: RemoteTask[],
  k: Record<string, Known>,
  remoteLoaded = true
) =>
  reconcile({
    items,
    remote: new Map(r.map((x) => [x.id, x])),
    known: new Map(Object.entries(k)),
    remoteLoaded,
  });

const li = (
  text: string,
  attrs: Record<string, unknown> = {},
  nested?: unknown
) => ({
  type: "taskItem",
  attrs,
  content: [
    { type: "paragraph", content: text ? [{ type: "text", text }] : [] },
    ...(nested ? [nested] : []),
  ],
});
const doc = (...items: unknown[]) =>
  pageEditorSchema.nodeFromJSON({
    type: "doc",
    content: [{ type: "taskList", content: items }],
  });

describe("collectTaskItems", () => {
  it("reads linked items only, with first-line text, tick and day", () => {
    const d = doc(
      li("Plain", { checked: true }),
      li("  Pay   the invoice ", {
        task: true,
        taskId: "t1",
        taskDue: "2026-10-20",
        checked: true,
      }),
      li("No id", { task: true })
    );
    expect(collectTaskItems(d)).toEqual([
      {
        taskId: "t1",
        text: "Pay the invoice",
        checked: true,
        due: "2026-10-20",
      },
    ]);
  });

  it("takes only the first line of an item as its title and finds nested items", () => {
    const d = doc(
      li(
        "Parent",
        { task: true, taskId: "a" },
        {
          type: "taskList",
          content: [li("Child", { task: true, taskId: "b" })],
        }
      )
    );
    expect(collectTaskItems(d).map((x) => [x.taskId, x.text])).toEqual([
      ["a", "Parent"],
      ["b", "Child"],
    ]);
  });

  it("lists an id once", () => {
    const d = doc(
      li("One", { task: true, taskId: "x" }),
      li("Two", { task: true, taskId: "x" })
    );
    expect(collectTaskItems(d)).toHaveLength(1);
  });
});

describe("removedTaskIds", () => {
  it("is what left the page; a moved item is not removed", () => {
    const a = li("A", { task: true, taskId: "a" });
    const b = li("B", { task: true, taskId: "b" });
    const c = li("C", { task: true, taskId: "c" });
    expect(removedTaskIds(doc(a, b, c), doc(a, c))).toEqual(["b"]);
    expect(removedTaskIds(doc(a, b, c), doc(c, b, a))).toEqual([]);
    expect(removedTaskIds(doc(a), doc(a, b))).toEqual([]);
    expect([...taskItemIds(doc(a, b))]).toEqual(["a", "b"]);
  });
});

describe("reconcile: a task that does not exist yet", () => {
  it("creates it once the item has text", () => {
    expect(run([item({ checked: true, due: "2026-10-20" })], [], {})).toEqual([
      {
        kind: "create",
        taskId: "t1",
        title: "Pay the invoice",
        checked: true,
        due: "2026-10-20",
      },
    ]);
  });

  it("waits for text", () => {
    expect(run([item({ text: "" })], [], {})).toEqual([]);
  });

  it("does nothing before the server has answered", () => {
    expect(run([item()], [], {}, false)).toEqual([]);
    expect(run([item()], [], { t1: known() }, false)).toEqual([]);
  });
});

describe("reconcile: first meeting", () => {
  it("the task is the record: the item takes its title, tick and day", () => {
    const actions = run(
      [item({ text: "Old", checked: false, due: null })],
      [remote({ title: "New", done: true, due: "2026-11-01" })],
      {}
    );
    expect(actions).toEqual([
      {
        kind: "sync",
        taskId: "t1",
        apply: { text: "New", checked: true, due: "2026-11-01" },
        push: null,
        next: { text: "New", checked: true, due: "2026-11-01" },
      },
    ]);
  });

  it("agreeing values only get remembered", () => {
    const [a] = run([item()], [remote()], {});
    expect(a).toMatchObject({ kind: "sync", apply: null, push: null });
  });
});

describe("reconcile: after they agreed", () => {
  const k = { t1: known() };

  it("nothing changed, nothing to do", () => {
    expect(run([item()], [remote()], k)).toEqual([]);
  });

  it("ticking the item completes the task", () => {
    const [a] = run([item({ checked: true })], [remote()], k);
    expect(a).toMatchObject({
      kind: "sync",
      push: { checked: true },
      apply: null,
      next: { checked: true },
    });
  });

  it("completing the task ticks the item", () => {
    const [a] = run([item()], [remote({ done: true })], k);
    expect(a).toMatchObject({
      kind: "sync",
      apply: { checked: true },
      push: null,
      next: { checked: true },
    });
  });

  it("a date chip sets the due date, and clearing it clears the date", () => {
    const [set] = run([item({ due: "2026-10-21" })], [remote()], k);
    expect(set).toMatchObject({ push: { due: "2026-10-21" } });
    const [clear] = run(
      [item({ due: null })],
      [remote({ due: "2026-10-21" })],
      { t1: known({ due: "2026-10-21" }) }
    );
    expect(clear).toMatchObject({ push: { due: null } });
  });

  it("a due date changed elsewhere reaches the chip", () => {
    const [a] = run([item()], [remote({ due: "2026-12-24" })], k);
    expect(a).toMatchObject({ apply: { due: "2026-12-24" }, push: null });
  });

  it("typing in the item renames the task; an empty line does not", () => {
    const [a] = run([item({ text: "Pay it now" })], [remote()], k);
    expect(a).toMatchObject({ push: { text: "Pay it now" } });
    expect(run([item({ text: "" })], [remote()], k)).toEqual([]);
  });

  it("a rename elsewhere reaches the item when it was not touched", () => {
    const [a] = run([item()], [remote({ title: "Pay the bill" })], k);
    expect(a).toMatchObject({ apply: { text: "Pay the bill" }, push: null });
  });

  it("changed on both sides: the item wins", () => {
    const [a] = run([item({ text: "Mine" })], [remote({ title: "Theirs" })], k);
    expect(a).toMatchObject({ push: { text: "Mine" }, apply: null });
  });

  it("different fields on each side both go through", () => {
    const [a] = run([item({ text: "Mine" })], [remote({ done: true })], k);
    expect(a).toMatchObject({
      push: { text: "Mine" },
      apply: { checked: true },
      next: { text: "Mine", checked: true },
    });
  });

  it("a tick the task already has is not sent again", () => {
    const [a] = run([item({ checked: true })], [remote({ done: true })], k);
    expect(a).toMatchObject({
      push: null,
      apply: null,
      next: { checked: true },
    });
  });
});

describe("reconcile: the task is gone", () => {
  it("one that was seen and is missing (deleted elsewhere) unlinks the item", () => {
    expect(run([item()], [], { t1: known() })).toEqual([
      { kind: "unlink", taskId: "t1" },
    ]);
  });

  it("one in Trash unlinks the item, seen before or not", () => {
    expect(run([item()], [remote({ trashed: true })], {})).toEqual([
      { kind: "unlink", taskId: "t1" },
    ]);
  });

  it("several items are each decided on their own", () => {
    const actions = run(
      [item(), item({ taskId: "t2", text: "Second" })],
      [remote()],
      { t1: known() }
    );
    expect(actions).toEqual([
      {
        kind: "create",
        taskId: "t2",
        title: "Second",
        checked: false,
        due: null,
      },
    ]);
  });
});

describe("taskWriteBody", () => {
  const iso = (d: string) => `${d}T00:00:00.000Z`;
  it("maps title, tick and day to the task fields", () => {
    expect(
      taskWriteBody({ text: "T", checked: true, due: "2026-10-20" }, iso)
    ).toEqual({
      title: "T",
      status: "completed",
      dueDate: "2026-10-20T00:00:00.000Z",
    });
    expect(taskWriteBody({ checked: false, due: null }, iso)).toEqual({
      status: "todo",
      dueDate: null,
    });
    expect(taskWriteBody({}, iso)).toEqual({});
  });
});
