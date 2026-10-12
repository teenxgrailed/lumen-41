/** What a drop writes, against Tue 1 Sep 2026. */
import type { V3Task } from "@/lib/needt3/map";

import { type DropRequest, type ZoneSpec, dropPatch, slotHour } from "../drop";

const TODAY = "2026-09-01";
const TOMORROW = "2026-09-02";

const task = (id: string, over: Partial<V3Task> = {}) =>
  ({
    id,
    title: id,
    done: false,
    isFixed: false,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: 30,
    projectId: null,
    ...over,
  }) as V3Task;

const at = (id: string, h: string, over: Partial<V3Task> = {}) =>
  task(id, {
    scheduledStart: `${TODAY}T${h}`,
    scheduledEnd: `${TODAY}T${h}`,
    isFixed: true,
    ...over,
  });

const specs: Record<string, ZoneSpec> = {
  Overdue: { mode: "none" },
  Inbox: { mode: "move", date: null, label: "Inbox" },
  Today: { mode: "move", date: TODAY, timed: true, label: "Today" },
  Tomorrow: { mode: "move", date: TOMORROW, timed: true, label: "Tomorrow" },
  Ops: {
    mode: "move",
    date: "nb",
    fallback: TODAY,
    timed: true,
    projectId: "p-ops",
    label: "Operations",
  },
};

const drop = (
  id: string,
  from: string,
  to: string,
  after: string | null,
  before: string | null
): DropRequest => ({ id, from, to, after, before, folded: false });

describe("dropPatch: the day", () => {
  const list = [
    task("a"),
    task("b", { dueDate: TOMORROW }),
    task("i", { dueDate: null }),
  ];

  it("into another day's section moves the task to that day", () => {
    const d = dropPatch(
      drop("a", "Today", "Tomorrow", "b", null),
      specs,
      list,
      TODAY
    );
    expect(d?.patch).toMatchObject({ dueDate: TOMORROW });
    expect(d?.say).toBe("Moved to Tomorrow");
  });

  it("into Inbox clears the day and the place", () => {
    const placed = [at("a", "09:00")];
    const d = dropPatch(
      drop("a", "Today", "Inbox", null, null),
      specs,
      placed,
      TODAY
    );
    expect(d?.patch).toEqual({
      dueDate: null,
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
    expect(d?.say).toBe("Moved to Inbox");
  });

  it("an Inbox task dropped on Inbox changes nothing", () => {
    expect(
      dropPatch(drop("i", "Inbox", "Inbox", null, null), specs, list, TODAY)
    ).toBeNull();
  });

  it("a locked zone can be left, never entered", () => {
    expect(
      dropPatch(drop("a", "Today", "Overdue", null, null), specs, list, TODAY)
    ).toBeNull();
    const late = [task("l", { dueDate: "2026-08-30" })];
    expect(
      dropPatch(drop("l", "Overdue", "Today", null, null), specs, late, TODAY)
        ?.patch
    ).toMatchObject({ dueDate: TODAY });
  });

  it("an unknown task or zone writes nothing", () => {
    expect(
      dropPatch(drop("zz", "Today", "Today", null, null), specs, list, TODAY)
    ).toBeNull();
    expect(
      dropPatch(drop("a", "Today", "Nowhere", null, null), specs, list, TODAY)
    ).toBeNull();
  });
});

describe("dropPatch: the project and the neighbour's day", () => {
  it("a project section sets the project, and takes the day of the row it lands by", () => {
    const list = [
      task("a", { dueDate: null }),
      task("n", { dueDate: TOMORROW }),
    ];
    const d = dropPatch(
      drop("a", "Inbox", "Ops", "n", null),
      specs,
      list,
      TODAY
    );
    expect(d?.patch).toMatchObject({ projectId: "p-ops", dueDate: TOMORROW });
    expect(d?.say).toContain("Moved to Operations");
  });

  it("alone in the section it takes the fallback day", () => {
    const list = [task("a", { dueDate: null })];
    const d = dropPatch(
      drop("a", "Inbox", "Ops", null, null),
      specs,
      list,
      TODAY
    );
    expect(d?.patch).toMatchObject({ projectId: "p-ops", dueDate: TODAY });
  });
});

describe("dropPatch: the gap is a time", () => {
  const rows = [at("x", "09:00"), at("y", "11:00"), task("m")];

  it("right after the row above, rounded up to the half hour", () => {
    const d = dropPatch(
      drop("m", "Today", "Today", "x", "y"),
      specs,
      rows,
      TODAY
    );
    expect(d?.patch).toMatchObject({
      scheduledStart: `${TODAY}T09:30`,
      isFixed: true,
    });
    expect(d?.say).toBe("Now at 09:30");
  });

  it("just before the row below when it lands first", () => {
    const d = dropPatch(
      drop("m", "Today", "Today", null, "y"),
      specs,
      rows,
      TODAY
    );
    expect(d?.patch).toMatchObject({ scheduledStart: `${TODAY}T10:30` });
  });

  it("keeps an hour that already sorts there", () => {
    const own = [...rows.slice(0, 2), at("m", "10:00")];
    expect(
      dropPatch(drop("m", "Today", "Today", "x", "y"), specs, own, TODAY)
    ).toBeNull();
  });

  it("below an untimed row it has no time either", () => {
    const list = [task("u"), at("m", "10:00")];
    const d = dropPatch(
      drop("m", "Today", "Today", "u", null),
      specs,
      list,
      TODAY
    );
    expect(d?.patch).toEqual({
      dueDate: TODAY,
      scheduledStart: null,
      scheduledEnd: null,
      isFixed: false,
    });
  });

  it("cross-section drops say the new time too", () => {
    const list = [
      at("m", "09:00"),
      at("t", "13:00", {
        dueDate: TOMORROW,
        scheduledStart: `${TOMORROW}T13:00`,
      }),
    ];
    const d = dropPatch(
      drop("m", "Today", "Tomorrow", "t", null),
      specs,
      list,
      TODAY
    );
    expect(d?.patch).toMatchObject({
      dueDate: TOMORROW,
      scheduledStart: `${TOMORROW}T13:30`,
    });
    expect(d?.say).toBe("Moved to Tomorrow · 13:30");
  });
});

describe("slotHour", () => {
  const n = (h: string | null, min = 30, day = TODAY) => ({
    dueDate: day,
    scheduledStart: h ? `${day}T${h}` : null,
    estimatedMinutes: min,
  });
  it("after a row: its end, up to the half hour, but never past the row below", () => {
    expect(slotHour(n(null), TODAY, n("09:00", 45), null)).toBe(10);
    expect(slotHour(n(null), TODAY, n("09:00", 120), n("10:00"))).toBe(9);
  });
  it("never past midnight", () => {
    expect(slotHour(n(null), TODAY, n("23:30", 60), null)).toBe(23.5);
  });
  it("before a row: its start less the task's own length", () => {
    expect(slotHour(n(null, 60), TODAY, null, n("11:00"))).toBe(10);
    expect(slotHour(n(null, 120), TODAY, null, n("01:00"))).toBe(1);
  });
  it("a neighbour on another day is no neighbour", () => {
    expect(slotHour(n("14:00"), TODAY, n("09:00", 30, TOMORROW), null)).toBe(
      14
    );
  });
});
