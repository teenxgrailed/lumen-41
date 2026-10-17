import { launchActionOf } from "@/components/needt3/root/PwaBridge";
import { badgeCount, setBadge } from "@/components/needt3/root/appBadge";

import {
  ACTIONS_SNAP_AT,
  ACTIONS_W,
  actionsOffset,
  actionsReveal,
  actionsSettle,
} from "@/lib/needt3/gesture";
import { HAPTIC_MS, haptic } from "@/lib/needt3/haptics";
import type { V3Task } from "@/lib/needt3/map";
import {
  defaultKind,
  hasShare,
  kindsFor,
  readShare,
  shareQuery,
  sharedBody,
  sharedTitle,
} from "@/lib/needt3/share-target";

const TODAY = "2026-10-17";
const task = (id: string, o: Partial<V3Task> = {}) =>
  ({
    id,
    title: `Task ${id}`,
    done: false,
    noSlot: false,
    isFixed: false,
    dueDate: TODAY,
    scheduledStart: null,
    scheduledEnd: null,
    estimatedMinutes: null,
    trashedAt: null,
    projectId: null,
    ...o,
  }) as unknown as V3Task;

describe("row swipe left: the buttons behind the row", () => {
  it("follows the finger 1:1 to the buttons' width, then a rubber band", () => {
    expect(actionsOffset(-40)).toBe(-40);
    expect(actionsOffset(-ACTIONS_W)).toBe(-ACTIONS_W);
    const far = actionsOffset(-ACTIONS_W - 200);
    expect(far).toBeLessThan(-ACTIONS_W);
    expect(far).toBeGreaterThan(-ACTIONS_W - 48); // never runs away
    // resistance: the same extra finger travel moves it less and less
    const a = actionsOffset(-ACTIONS_W - 20) - actionsOffset(-ACTIONS_W);
    const b = actionsOffset(-ACTIONS_W - 120) - actionsOffset(-ACTIONS_W - 100);
    expect(Math.abs(b)).toBeLessThan(Math.abs(a));
  });

  it("the colour reveal grows with the drag and is full at the width", () => {
    expect(actionsReveal(0)).toBe(0);
    expect(actionsReveal(-ACTIONS_W / 2)).toBeCloseTo(0.5);
    expect(actionsReveal(-ACTIONS_W * 2)).toBe(1);
    expect(actionsReveal(30)).toBe(0);
  });

  it("a closed row opens past the snap point or on a flick, else goes home", () => {
    expect(actionsSettle(-ACTIONS_SNAP_AT + 10, 0, false)).toBe(false);
    expect(actionsSettle(-ACTIONS_SNAP_AT - 4, 0, false)).toBe(true);
    // a short, fast flick left counts
    expect(actionsSettle(-30, -0.8, false)).toBe(true);
    // a flick the other way does not
    expect(actionsSettle(-50, 0.8, false)).toBe(false);
  });

  it("an open row shuts only when pulled back a clear way", () => {
    expect(actionsSettle(-ACTIONS_W + 20, 0, true)).toBe(true);
    expect(actionsSettle(-ACTIONS_W + 80, 0, true)).toBe(false);
    expect(actionsSettle(-ACTIONS_W + 10, 0.9, true)).toBe(false);
  });
});

describe("haptics", () => {
  it("pulses where vibrate exists", () => {
    const vibrate = jest.fn(() => true);
    expect(haptic("tick", { vibrate }, false)).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_MS.tick);
    expect(haptic("success", { vibrate }, false)).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith(HAPTIC_MS.success);
  });

  it("does nothing where it does not (iOS Safari has no vibrate)", () => {
    expect(haptic("success", {}, false)).toBe(false);
    expect(haptic("success", undefined, false)).toBe(false);
  });

  it("stays quiet for reduced motion and survives a throwing browser", () => {
    const vibrate = jest.fn(() => true);
    expect(haptic("tick", { vibrate }, true)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    expect(
      haptic(
        "tick",
        {
          vibrate: () => {
            throw new Error("blocked");
          },
        },
        false
      )
    ).toBe(false);
  });

  it("the pulses are short", () => {
    const total = (v: number | number[]) =>
      Array.isArray(v) ? v.reduce((a, b) => a + b, 0) : v;
    expect(total(HAPTIC_MS.tick)).toBeLessThanOrEqual(15);
    expect(total(HAPTIC_MS.success)).toBeLessThanOrEqual(100);
  });
});

describe("the app badge", () => {
  const tasks = [
    task("today1"),
    task("today2", { scheduledStart: "2026-10-17T09:00" }),
    task("late", { dueDate: "2026-10-15" }),
    task("done", { done: true }),
    task("tomorrow", { dueDate: "2026-10-18" }),
    task("inbox", { dueDate: null }),
    task("trashed", { trashedAt: "2026-10-16T00:00" }),
  ];

  it("counts today's open tasks plus the overdue ones", () => {
    expect(badgeCount(tasks, TODAY)).toBe(3);
  });

  it("is zero on a clear day", () => {
    expect(badgeCount([], TODAY)).toBe(0);
    expect(badgeCount([task("done", { done: true })], TODAY)).toBe(0);
  });

  it("sets the number, and clears at zero", () => {
    const nav = {
      setAppBadge: jest.fn(() => Promise.resolve()),
      clearAppBadge: jest.fn(() => Promise.resolve()),
    };
    expect(setBadge(3, nav)).toBe(true);
    expect(nav.setAppBadge).toHaveBeenCalledWith(3);
    expect(setBadge(0, nav)).toBe(true);
    expect(nav.clearAppBadge).toHaveBeenCalledTimes(1);
    expect(nav.setAppBadge).toHaveBeenCalledTimes(1);
  });

  it("does nothing, and asks for nothing, where the API is missing", () => {
    expect(setBadge(3, {})).toBe(false);
    expect(setBadge(0, {})).toBe(false);
    expect(setBadge(3, undefined)).toBe(false);
  });

  it("a rejected call is not an error", () => {
    const nav = { setAppBadge: () => Promise.reject(new Error("denied")) };
    expect(() => setBadge(2, nav)).not.toThrow();
  });
});

describe("app icon shortcuts", () => {
  it("reads the launch action from the deep link", () => {
    expect(launchActionOf("?launch=new-task")).toBe("new-task");
    expect(launchActionOf("?launch=ask")).toBe("ask");
    expect(launchActionOf("?launch=other")).toBeNull();
    expect(launchActionOf("")).toBeNull();
  });
});

describe("Share to Needt", () => {
  const get = (o: Record<string, string>) => (k: string) => o[k] ?? null;

  it("reads the title, text and link", () => {
    const p = readShare(
      get({ title: " Trip ", text: "Dates", url: "https://example.com/a" })
    );
    expect(p).toMatchObject({
      title: "Trip",
      text: "Dates",
      url: "https://example.com/a",
      stash: null,
      files: 0,
    });
  });

  it("lifts the link out of the text (Android often shares it there)", () => {
    const p = readShare(
      get({ text: "Read this https://example.com/post now" })
    );
    expect(p.url).toBe("https://example.com/post");
    expect(p.text).toBe("Read this now");
  });

  it("drops a url that is not http(s)", () => {
    expect(readShare(get({ url: "javascript:alert(1)" })).url).toBe("");
  });

  it("accepts only a well-formed stash id and a sane file count", () => {
    expect(readShare(get({ stash: "../../etc", files: "3" })).stash).toBeNull();
    const p = readShare(
      get({ stash: "11111111-2222-3333-4444-555555555555", files: "99" })
    );
    expect(p.stash).toBe("11111111-2222-3333-4444-555555555555");
    expect(p.files).toBe(10);
  });

  it("names the thing: title, else first line, else the site", () => {
    expect(sharedTitle(readShare(get({ title: "A", text: "B" })))).toBe("A");
    expect(sharedTitle(readShare(get({ text: "First\nSecond" })))).toBe(
      "First"
    );
    expect(
      sharedTitle(readShare(get({ url: "https://www.example.com/x" })))
    ).toBe("example.com");
    expect(sharedTitle(readShare(get({})))).toBe("Shared to Needt");
  });

  it("keeps the text then the link as the body", () => {
    expect(
      sharedBody(readShare(get({ text: "Hello", url: "https://a.co" })))
    ).toBe("Hello\n\nhttps://a.co");
  });

  it("builds the Share page query without files", () => {
    expect(
      shareQuery(readShare(get({ title: "T", url: "https://a.co" })))
    ).toBe("title=T&url=https%3A%2F%2Fa.co");
  });

  it("offers Task, Doc and Moodboard item for a link; a task never takes files", () => {
    const link = readShare(get({ url: "https://a.co" }));
    expect(kindsFor(link)).toEqual(["task", "doc", "board"]);
    expect(defaultKind(link, kindsFor(link))).toBe("task");
    const pics = readShare(
      get({ stash: "11111111-2222-3333-4444-555555555555", files: "2" })
    );
    expect(kindsFor(pics, ["image/png"])).toEqual(["doc", "board"]);
    expect(defaultKind(pics, kindsFor(pics, ["image/png"]))).toBe("doc");
  });

  it("knows an empty share", () => {
    expect(hasShare(readShare(get({})))).toBe(false);
    expect(hasShare(readShare(get({ text: "x" })))).toBe(true);
  });
});
