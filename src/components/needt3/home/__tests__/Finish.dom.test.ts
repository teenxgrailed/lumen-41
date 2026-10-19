/**
 * @jest-environment jsdom
 *
 * The finished-day card and the End day sheet: the title never says "All done"
 * while something Home lists is open, the picks hide themselves, "Pull
 * something in" is one tap, and the sheet hands back its choices.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { pickFinishNext } from "../finish";
import { HaAllDone } from "../ha/HaAllDone";
import { HaEndDay } from "../ha/HaEndDay";
import { haAllDoneOf } from "../ha/model";
import { TODAY, task } from "./fixtures";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (el: unknown) =>
  act(async () => root.render(el as Parameters<Root["render"]>[0]));
const tap = (sel: string, from: ParentNode = host) =>
  (from.querySelector(sel) as HTMLButtonElement).click();

const picks = pickFinishNext(
  [
    task({ title: "Pay rent", dueDate: "2026-08-30" }),
    task({ title: "Plan trip", dueDate: "2026-09-02" }),
  ],
  TODAY,
  120
);

describe("haAllDoneOf", () => {
  const base = {
    count: 3,
    focusMinutes: 90,
    open: { late: 0, inbox: 0 },
    picks,
    freeMinutes: 170,
  };
  it("says All done when nothing else is open", () => {
    const a = haAllDoneOf(base);
    expect(a.title).toBe("All done for today");
    expect(a.meta).toBe("3 of 3 · 1 h 30 focused");
    expect(a.free).toBe("2 h 50");
    expect(a.pull.map((p) => p.title)).toEqual(picks.map((p) => p.task.title));
  });
  it("does not say All done while overdue or inbox tasks are open", () => {
    const a = haAllDoneOf({ ...base, open: { late: 2, inbox: 1 } });
    expect(a.title).not.toMatch(/all done/i);
    expect(a.meta).toContain("2 overdue · 1 in Inbox still open");
  });
  it("leaves out the focus time and the free time it does not have", () => {
    const a = haAllDoneOf({ ...base, focusMinutes: null, freeMinutes: 0 });
    expect(a.meta).toBe("3 of 3");
    expect(a.free).toBeUndefined();
  });
});

describe("HaAllDone", () => {
  const props = (over = {}) => ({
    ...haAllDoneOf({
      count: 3,
      focusMinutes: null,
      open: { late: 0, inbox: 0 },
      picks,
      freeMinutes: 60,
    }),
    onEndDay: jest.fn(),
    onSeeTomorrow: jest.fn(),
    onUndo: jest.fn(),
    onPull: jest.fn(),
    ...over,
  });

  it("offers each pick with one tap, and the pulled one leaves the list", async () => {
    const p = props();
    await render(h(HaAllDone, p));
    expect(host.querySelectorAll("[data-ha-pick]")).toHaveLength(2);
    tap('[data-ha="pull"]', host.querySelector("[data-ha-pick]") as Element);
    expect(p.onPull).toHaveBeenCalledWith(picks[0]?.task.id);
    await act(async () => undefined);
    expect(host.querySelectorAll("[data-ha-pick]")).toHaveLength(1);
  });

  it("hides the list when there is nothing to offer", async () => {
    await render(h(HaAllDone, props({ pull: [] })));
    expect(host.querySelector("[data-ha-pull]")).toBeNull();
  });

  it("opens End day, sees tomorrow, undoes the last", async () => {
    const p = props();
    await render(h(HaAllDone, p));
    tap('[data-ha="end-day"]');
    tap('[data-ha="see-tomorrow"]');
    tap('[data-ha="undo-last"]');
    expect(p.onEndDay).toHaveBeenCalled();
    expect(p.onSeeTomorrow).toHaveBeenCalled();
    expect(p.onUndo).toHaveBeenCalled();
  });

  it("has no See tomorrow when there is nothing tomorrow", async () => {
    await render(h(HaAllDone, props({ onSeeTomorrow: undefined })));
    expect(host.querySelector('[data-ha="see-tomorrow"]')).toBeNull();
  });
});

describe("HaEndDay", () => {
  const base = {
    title: "End of Wednesday",
    summary: "1 done · 2 left",
    done: ["Write report"],
    leftovers: [
      { id: "l1", title: "Pay rent", meta: "Overdue" },
      { id: "l2", title: "Email Anna", meta: "Today" },
    ],
    moves: { l2: "date" as const },
    date: "2026-09-09",
    minDate: "2026-09-02",
    note: "",
    busy: false,
    onMove: jest.fn(),
    onDate: jest.fn(),
    onNote: jest.fn(),
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  };

  it("shows what got done and what is left, with a date field only for a picked date", async () => {
    await render(h(HaEndDay, base));
    expect(host.textContent).toContain("End of Wednesday");
    expect(host.textContent).toContain("Write report");
    expect(host.querySelectorAll("[data-ha-left]")).toHaveLength(2);
    expect(host.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("hides empty sections and the date field", async () => {
    await render(h(HaEndDay, { ...base, done: [], leftovers: [], moves: {} }));
    expect(host.querySelector("[data-ha-left]")).toBeNull();
    expect(host.querySelector('input[type="date"]')).toBeNull();
    expect(host.querySelector("textarea")).not.toBeNull();
  });

  it("reports a destination, the note, and closes the day", async () => {
    const p = {
      ...base,
      onMove: jest.fn(),
      onSubmit: jest.fn(),
      onNote: jest.fn(),
    };
    await render(h(HaEndDay, p));
    const row = host.querySelector('[data-ha-left="l1"]') as HTMLElement;
    expect(
      row.querySelector('[data-ha-to="tomorrow"]')?.getAttribute("aria-pressed")
    ).toBe("true");
    tap('[data-ha-to="inbox"]', row);
    expect(p.onMove).toHaveBeenCalledWith("l1", "inbox");
    tap('[data-ha="close-day"]');
    expect(p.onSubmit).toHaveBeenCalled();
  });
});
