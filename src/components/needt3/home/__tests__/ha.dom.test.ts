/**
 * @jest-environment jsdom
 */
import { act, createElement as h } from "react";

import { type Root, createRoot } from "react-dom/client";

import { clearFocusGift, showFocusGift } from "@/lib/needt3/focus-early";

import { HaBrief } from "../ha/HaBrief";
import { HaHabits } from "../ha/HaHabits";
import { HaHighlight } from "../ha/HaHighlight";
import { HaTimeLeft } from "../ha/HaTimeLeft";
import { HaWeather } from "../ha/HaWeather";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../../orb/AiOrb", () => ({ AiOrb: () => null }));
jest.mock("../../paywall/Pro", () => ({
  ProBadge: () => h("span", { "data-pro": "" }, "PRO"),
}));
jest.mock("../../phone/kit", () => ({
  PkSkyPlate: ({ children }: { children: unknown }) =>
    h("section", { "data-sky": "" }, children as never),
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

const render = (el: Parameters<Root["render"]>[0]) =>
  act(async () => root.render(el));
const tap = (sel: string) =>
  (host.querySelector(sel) as HTMLButtonElement).click();

const card = { id: "t1", title: "Ship the report", sub: "Due today." };

describe("HaHighlight", () => {
  it("suggest: Yes sets it, Another cycles, the dots say how many", async () => {
    const onYes = jest.fn();
    const onAnother = jest.fn();
    await render(
      h(HaHighlight, {
        state: "suggest",
        card,
        index: 1,
        count: 3,
        onYes,
        onAnother,
      })
    );
    expect(host.textContent).toContain("Suggested highlight");
    expect(host.textContent).toContain("Due today.");
    expect(host.querySelectorAll(".ha-hl-dots i")).toHaveLength(3);
    expect(host.querySelector(".ha-hl-dots i.on")).toBe(
      host.querySelectorAll(".ha-hl-dots i")[1]
    );
    tap("[data-ha-yes]");
    tap("[data-ha-another]");
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onAnother).toHaveBeenCalledTimes(1);
  });

  it("suggest, Free: Yes carries PRO and opens the paywall, not the highlight", async () => {
    const onYes = jest.fn();
    const onUpgrade = jest.fn();
    await render(
      h(HaHighlight, {
        state: "suggest",
        card,
        count: 2,
        locked: true,
        onYes,
        onUpgrade,
      })
    );
    expect(
      host.querySelector('[data-ha-yes="locked"] [data-pro]')
    ).toBeTruthy();
    tap("[data-ha-yes]");
    expect(onUpgrade).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
  });

  it("suggest: one suggestion has no Another and no dots", async () => {
    await render(h(HaHighlight, { state: "suggest", card, count: 1 }));
    expect(host.querySelector("[data-ha-another]")).toBeNull();
    expect(host.querySelector(".ha-hl-dots")).toBeNull();
  });

  it("set: Start focus, Done and Unset", async () => {
    const p = {
      onStart: jest.fn(),
      onDone: jest.fn(),
      onUnset: jest.fn(),
      onOpen: jest.fn(),
    };
    await render(h(HaHighlight, { state: "set", card, ...p }));
    expect(host.textContent).toContain("Highlight");
    tap("[data-ha-start]");
    tap("[data-ha-done]");
    tap(".ha-hl-skip");
    tap(".ha-hl-open");
    expect(p.onStart).toHaveBeenCalledTimes(1);
    expect(p.onDone).toHaveBeenCalledTimes(1);
    expect(p.onUnset).toHaveBeenCalledTimes(1);
    expect(p.onOpen).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".ha-hl.is-highlight")).toBeTruthy();
  });

  it("nextup: the plain Next up, Overdue in words when late, Skip when there is another", async () => {
    const onSkip = jest.fn();
    await render(h(HaHighlight, { state: "nextup", card, late: true, onSkip }));
    expect(host.querySelector(".ha-kicker")?.textContent).toBe("Overdue");
    expect(host.querySelector(".ha-hl.is-highlight")).toBeNull();
    tap("[data-ha-skip]");
    expect(onSkip).toHaveBeenCalledTimes(1);
    await render(h(HaHighlight, { state: "nextup", card }));
    expect(host.querySelector("[data-ha-skip]")).toBeNull();
    expect(host.querySelector(".ha-kicker")?.textContent).toBe("Next up");
  });

  it("phone: the card is the sky plate; desktop: a plain section", async () => {
    await render(h(HaHighlight, { phone: true, state: "nextup", card }));
    expect(host.querySelector("[data-sky]")).toBeTruthy();
    await render(h(HaHighlight, { state: "nextup", card }));
    expect(host.querySelector("[data-sky]")).toBeNull();
    expect(host.querySelector("section.ha-hl")).toBeTruthy();
  });
});

describe("HaBrief", () => {
  it("shows the lines and yesterday's note, and the x hides it until tomorrow", async () => {
    const onClose = jest.fn();
    await render(
      h(HaBrief, {
        lines: ["Two tasks matter.", "Free from 15:00."],
        note: "Start with the listings.",
        onClose,
      })
    );
    expect(host.textContent).toContain("Two tasks matter.");
    expect(host.textContent).toContain(
      "From yesterday Start with the listings."
    );
    (host.querySelector(".ha-x") as HTMLButtonElement).click();
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(host.querySelector("[data-ha-brief]")).toBeNull();
  });

  it("is the note alone when the agent said nothing, and nothing with neither", async () => {
    await render(h(HaBrief, { lines: [], note: "Call Anna." }));
    expect(host.textContent).toContain("Call Anna.");
    await render(h(HaBrief, { lines: [] }));
    expect(host.querySelector("[data-ha-brief]")).toBeNull();
  });

  it("Free: PRO and Try Pro, which opens the paywall", async () => {
    const onUpgrade = jest.fn();
    await render(h(HaBrief, { locked: true, onUpgrade }));
    expect(host.querySelector("[data-pro]")).toBeTruthy();
    tap(".ha-btn");
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

describe("HaHabits", () => {
  const habits = [
    {
      id: "d",
      name: "Duolingo",
      emoji: "🦉",
      kind: "daily" as const,
      done: false,
    },
    {
      id: "w",
      name: "Lift",
      emoji: "",
      kind: "week" as const,
      target: 3,
      count: 2,
      done: true,
    },
  ];
  it("draws a pill per habit with its count, and a tap writes the opposite", async () => {
    const onToggle = jest.fn();
    await render(h(HaHabits, { habits, onToggle }));
    expect(host.textContent).toContain("Duolingo");
    expect(host.textContent).toContain("2/3");
    expect(host.querySelector('[data-ha-habit="w"]')?.className).toContain(
      "is-done"
    );
    tap('[data-ha-habit="d"]');
    tap('[data-ha-habit="w"]');
    expect(onToggle).toHaveBeenNthCalledWith(1, "d", true);
    expect(onToggle).toHaveBeenNthCalledWith(2, "w", false);
  });
  it("draws nothing without habits", async () => {
    await render(h(HaHabits, { habits: [] }));
    expect(host.querySelector(".ha-habits")).toBeNull();
  });
});

describe("HaWeather and HaTimeLeft", () => {
  it("weather: nothing to say draws nothing", async () => {
    await render(h(HaWeather, { wx: null }));
    expect(host.querySelector(".ha-wx")).toBeNull();
    await render(
      h(HaWeather, {
        wx: { ic: "🌧", t: "12°", d: "light rain", first: "10:00" },
      })
    );
    expect(host.textContent).toContain("first event 10:00");
    expect(host.textContent).not.toMatch(/leave/i);
  });
  it("time left: overbooked says by how much; nothing to compare draws nothing", async () => {
    await render(h(HaTimeLeft, { t: null }));
    expect(host.querySelector(".ha-tl")).toBeNull();
    await render(
      h(HaTimeLeft, {
        t: {
          planned: "9 h",
          used: 0.34,
          plan: 0.66,
          now: 0.34,
          over: { by: "40 min", ends: "18:00" },
        },
      })
    );
    expect(host.textContent).toContain("Overbooked by 40 min");
    expect(host.querySelector(".ha-tl.is-over")).toBeTruthy();
    expect(host.querySelector(".ha-tl-warn button")).toBeNull();
  });
  it("time left: the bar draws done, planned, free and the day's end", async () => {
    await render(
      h(HaTimeLeft, {
        t: {
          planned: "3 h",
          free: "2 h",
          used: 0.25,
          plan: 0.5,
          now: 0.25,
          ends: "18:00",
        },
      })
    );
    const style = (sel: string) =>
      (host.querySelector(sel) as HTMLElement).style;
    expect(style(".ha-tl-bar .past").width).toBe("25%");
    expect(style(".ha-tl-bar .plan").left).toBe("25%");
    expect(style(".ha-tl-bar .plan").width).toBe("50%");
    expect(style(".ha-tl-bar .free").left).toBe("75%");
    expect(host.querySelector(".ha-tl-bar .spill")).toBeNull();
    expect(host.querySelector(".ha-tl-ticks .at-end")?.textContent).toBe(
      "18:00"
    );
  });
  it("time left: a green slice of the returned minutes sits right after now, and +N min says so", async () => {
    const base = {
      planned: "3 h",
      free: "2 h",
      used: 0.25,
      plan: 0.5,
      now: 0.25,
      dayMinutes: 600,
    };
    await render(h(HaTimeLeft, { t: base, gift: { minutes: 12, key: 1 } }));
    const style = (sel: string) =>
      (host.querySelector(sel) as HTMLElement).style;
    // 12 of 600 working minutes = 2 %, starting at now; the plan and the free
    // track make room for it
    expect(style(".ha-tl-bar .fd-gift").left).toBe("25%");
    expect(style(".ha-tl-bar .fd-gift").width).toBe("2%");
    expect(style(".ha-tl-bar .plan").left).toBe("27%");
    expect(style(".ha-tl-bar .free").left).toBe("77%");
    expect(host.querySelector("[data-fd-back]")?.textContent).toContain(
      "+12 min"
    );
    // gone: the bar is the plain one again
    await render(h(HaTimeLeft, { t: base, gift: null }));
    expect(host.querySelector(".fd-gift")).toBeNull();
    expect(host.querySelector("[data-fd-back]")).toBeNull();
    expect(style(".ha-tl-bar .plan").left).toBe("25%");
  });
  it("time left: follows the shared slice when no gift is passed, and draws none when overbooked", async () => {
    const t = {
      planned: "3 h",
      free: "2 h",
      used: 0.25,
      plan: 0.5,
      now: 0.25,
      dayMinutes: 600,
    };
    await render(h(HaTimeLeft, { t }));
    expect(host.querySelector(".fd-gift")).toBeNull();
    await act(async () => showFocusGift(12));
    expect(host.querySelector(".fd-gift")).toBeTruthy();
    await act(async () => clearFocusGift());
    expect(host.querySelector(".fd-gift")).toBeNull();
    await act(async () => showFocusGift(12));
    await render(
      h(HaTimeLeft, {
        t: { ...t, free: undefined, over: { by: "1 h", ends: "18:00" } },
      })
    );
    expect(host.querySelector(".fd-gift")).toBeNull();
    await act(async () => clearFocusGift());
  });
  it("time left: overbooked, the day's end is a tick and the rest runs past it", async () => {
    await render(
      h(HaTimeLeft, {
        t: {
          planned: "9 h",
          used: 0.5,
          plan: 0.5,
          now: 0.5,
          ends: "18:00",
          over: { by: "1 h", ends: "18:00" },
          overFrac: 1,
        },
      })
    );
    const style = (sel: string) =>
      (host.querySelector(sel) as HTMLElement).style;
    // the whole axis is two working days wide: the day ends at its middle
    expect(style(".ha-tl-bar .end").left).toBe("50%");
    expect(style(".ha-tl-bar .spill").left).toBe("50%");
    expect(style(".ha-tl-bar .spill").width).toBe("50%");
    expect(host.querySelector(".ha-tl-bar .free")).toBeNull();
  });
});
