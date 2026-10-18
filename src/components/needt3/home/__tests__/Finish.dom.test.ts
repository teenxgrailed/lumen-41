/**
 * @jest-environment jsdom
 *
 * The finished-day card and the End day body: the headline never says "All
 * done" while something Home lists is open, the picks hide themselves, "Do
 * today" is one tap, and the sheet hands back its choices.
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { FinishCard, FinishPicks } from "../FinishCard";
import { ShutdownBody } from "../Shutdown";
import { pickFinishNext } from "../finish";
import { TODAY, task } from "./fixtures";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../phone/kit", () => ({
  PkButton: ({ children, ...p }: { children: string }) =>
    h("button", p, children),
  PkSheet: ({ children }: { children: unknown }) => children,
}));
jest.mock("../../ctx/PortalScope", () => ({
  useV3PortalContainer: () => null,
}));

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

const picks = pickFinishNext(
  [
    task({ title: "Pay rent", dueDate: "2026-08-30" }),
    task({ title: "Plan trip", dueDate: "2026-09-02" }),
  ],
  TODAY,
  120
);

const card = (open: { late: number; inbox: number }, over = {}) =>
  h(FinishCard, {
    count: 3,
    mins: 90,
    habits: 1,
    open,
    picks,
    onDoToday: jest.fn(),
    onEndDay: jest.fn(),
    onPlan: jest.fn(),
    onUndo: jest.fn(),
    ...over,
  });

describe("FinishCard", () => {
  it("says All done when nothing else is open", async () => {
    await render(card({ late: 0, inbox: 0 }));
    expect(host.querySelector("h2")?.textContent).toBe("All done for today");
    expect(
      host.querySelector("[data-fin-card]")?.getAttribute("data-fin-all-done")
    ).toBe("true");
  });

  it("does not say All done while overdue or inbox tasks are open", async () => {
    await render(card({ late: 2, inbox: 1 }));
    expect(host.querySelector("h2")?.textContent).not.toMatch(/all done/i);
    expect(host.textContent).toContain("2 overdue · 1 in Inbox");
  });

  it("offers each pick with one Do today tap", async () => {
    const onDoToday = jest.fn();
    await render(card({ late: 0, inbox: 0 }, { onDoToday }));
    const rows = host.querySelectorAll("[data-fin-pick]");
    expect(rows).toHaveLength(2);
    (
      rows[0]?.querySelector('[data-fin="do-today"]') as HTMLButtonElement
    ).click();
    expect(onDoToday).toHaveBeenCalledWith(picks[0]);
  });

  it("hides the list when there is nothing to offer", async () => {
    await render(card({ late: 0, inbox: 0 }, { picks: [] }));
    expect(host.querySelector("[data-fin-picks]")).toBeNull();
  });

  it("opens End day", async () => {
    const onEndDay = jest.fn();
    await render(card({ late: 0, inbox: 0 }, { onEndDay }));
    (host.querySelector('[data-fin="end-day"]') as HTMLButtonElement).click();
    expect(onEndDay).toHaveBeenCalled();
  });
});

describe("FinishPicks on the phone", () => {
  it("draws nothing without picks", async () => {
    await render(
      h(FinishPicks, { phone: true, picks: [], onDoToday: jest.fn() })
    );
    expect(host.innerHTML).toBe("");
  });
});

describe("ShutdownBody", () => {
  const base = {
    done: [{ id: "d1", title: "Write report" }],
    leftovers: [
      { id: "l1", title: "Pay rent", meta: "Overdue" },
      { id: "l2", title: "Email Anna", meta: "Today" },
    ],
    choices: { l2: "date" as const },
    date: "2026-09-09",
    minDate: "2026-09-02",
    note: "",
    busy: false,
    onChoice: jest.fn(),
    onDate: jest.fn(),
    onNote: jest.fn(),
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  };

  it("shows what got done and what is left", async () => {
    await render(h(ShutdownBody, base));
    expect(host.querySelector("[data-fin-done]")?.textContent).toContain(
      "Write report"
    );
    expect(host.querySelectorAll("[data-fin-left-row]")).toHaveLength(2);
    // a date field only while someone picked "Pick a date"
    expect(host.querySelector('input[type="date"]')).not.toBeNull();
  });

  it("hides empty sections and the date field", async () => {
    await render(
      h(ShutdownBody, { ...base, done: [], leftovers: [], choices: {} })
    );
    expect(host.querySelector("[data-fin-done]")).toBeNull();
    expect(host.querySelector("[data-fin-left]")).toBeNull();
    expect(host.querySelector('input[type="date"]')).toBeNull();
    expect(host.querySelector("textarea")).not.toBeNull();
  });

  it("reports a destination and submits", async () => {
    const onChoice = jest.fn();
    const onSubmit = jest.fn();
    await render(h(ShutdownBody, { ...base, onChoice, onSubmit }));
    const row = host.querySelector('[data-fin-left-row="l1"]') as HTMLElement;
    expect(
      row
        .querySelector('[data-fin-to="tomorrow"]')
        ?.getAttribute("aria-checked")
    ).toBe("true");
    (row.querySelector('[data-fin-to="inbox"]') as HTMLButtonElement).click();
    expect(onChoice).toHaveBeenCalledWith("l1", "inbox");
    (
      host.querySelector('[data-fin="confirm-end-day"]') as HTMLButtonElement
    ).click();
    expect(onSubmit).toHaveBeenCalled();
  });
});
