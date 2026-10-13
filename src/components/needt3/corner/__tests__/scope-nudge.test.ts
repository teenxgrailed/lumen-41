import type { ApiNudge } from "@/lib/needt3/hooks/nudges";

import {
  TIP_EVERY_MS,
  TIP_FIRST_MS,
  agoLabel,
  mayShowTip,
  noteFromNudge,
  quietPlace,
  safeHref,
} from "../nudge-tip";
import {
  type AskScope,
  firstName,
  greetingFor,
  helloLine,
  matchCommands,
  mentionQuery,
  sameScope,
  scopeLabel,
  scopesFor,
  suggestionsFor,
  withMentions,
} from "../scope";

const nudge = (extra: Partial<ApiNudge> = {}): ApiNudge => ({
  id: "n1",
  taskId: null,
  type: "FREE_TIME",
  title: "2 hours opened up",
  body: "14:00–16:00 today is free.",
  deepLink: "/today",
  deliveredAt: null,
  readAt: null,
  createdAt: "2026-10-14T10:00:00.000Z",
  ...extra,
});

describe("suggestions follow the scope", () => {
  const task: AskScope = { kind: "task", id: "t1", title: "Tank graphic" };

  it("task scope: the six cards of the mockup, naming the task", () => {
    const cards = suggestionsFor(task);
    expect(cards.map((c) => c.title)).toEqual([
      "Break it into steps",
      "Move it to tomorrow",
      "Plan my day",
      "Find free time this week",
      "What's overdue?",
      "Move low-priority to tomorrow",
    ]);
    expect(cards[0].say).toContain("Tank graphic");
    expect(cards[1].sub).toBe("Next free slot, with the reason");
    expect(cards[1].say).toContain("Tank graphic");
  });

  it("every scope offers six cards", () => {
    for (const sc of [
      task,
      { kind: "doc", title: "Plan" },
      { kind: "day", title: "Today" },
      { kind: "workspace" },
    ] as AskScope[]) {
      expect(suggestionsFor(sc)).toHaveLength(6);
    }
  });

  it("doc scope leads with the doc's own actions", () => {
    const cards = suggestionsFor({ kind: "doc", title: "Roadmap" });
    expect(cards[0].title).toBe("Summarise this doc");
    expect(cards[0].sub).toBe("“Roadmap” in three lines");
  });

  it("the hello line names what it is looking at", () => {
    expect(helloLine(task)).toBe(
      "I'm looking at “Tank graphic”. Ask what to do with it."
    );
  });
});

describe("scopes", () => {
  const base = { place: "tasks", task: null, docTitle: null, dayName: "Today" };

  it("a clicked task comes first, then everything, then the day", () => {
    const list = scopesFor({ ...base, task: { id: "t", title: "A" } });
    expect(list.map((s) => s.kind)).toEqual(["task", "workspace", "day"]);
  });

  it("on Home the day outranks everything", () => {
    expect(scopesFor({ ...base, place: "today" }).map((s) => s.kind)).toEqual([
      "day",
      "workspace",
    ]);
  });

  it("an open doc is a scope, even untitled", () => {
    const list = scopesFor({ ...base, place: "pages", docTitle: "" });
    expect(list[0]).toEqual({ kind: "doc", title: "Untitled" });
  });

  it("labels and identity", () => {
    expect(scopeLabel({ kind: "workspace" })).toBe("Everything");
    expect(scopeLabel({ kind: "task", id: "1", title: "X" })).toBe("Task: X");
    expect(
      sameScope(
        { kind: "task", id: "1", title: "X" },
        { kind: "task", id: "1", title: "renamed" }
      )
    ).toBe(true);
    expect(sameScope({ kind: "workspace" }, null)).toBe(false);
  });
});

describe("greeting and composer helpers", () => {
  it("greets by the hour and by first name", () => {
    expect(greetingFor(20, "Maksym")).toBe("Good evening, Maksym");
    expect(greetingFor(9, null)).toBe("Good morning");
    expect(greetingFor(14, "A")).toBe("Good afternoon, A");
    expect(firstName("  Maksym Kovalenko ")).toBe("Maksym");
    expect(firstName("")).toBeNull();
  });

  it("slash commands match by prefix, only as the whole draft", () => {
    expect(matchCommands("/").map((c) => c.cmd)).toHaveLength(4);
    expect(matchCommands("/pl").map((c) => c.cmd)).toEqual(["/plan"]);
    expect(matchCommands("plan /pl")).toEqual([]);
  });

  it("@ completes only a trailing mention", () => {
    expect(mentionQuery("move @ta")).toBe("ta");
    expect(mentionQuery("@")).toBe("");
    expect(mentionQuery("mail me@x.com")).toBeNull();
    expect(mentionQuery("done")).toBeNull();
  });

  it("mentions are added to the line that is sent", () => {
    expect(withMentions("hi", [])).toBe("hi");
    expect(
      withMentions("move", [{ kind: "task", id: "1", label: "Tank" }])
    ).toContain("task “Tank”");
  });
});

describe("the nudge tip", () => {
  it("maps a free-time nudge to Fill it, the rest to a link", () => {
    expect(noteFromNudge(nudge()).act).toEqual({
      kind: "fill",
      label: "Fill it",
    });
    const over = noteFromNudge(
      nudge({ type: "OVERDUE_TASK", deepLink: "/today?task=1" })
    );
    expect(over.act).toEqual({
      kind: "go",
      label: "Open",
      href: "/today?task=1",
    });
  });

  it("never follows an off-site deep link", () => {
    expect(safeHref("https://evil.example/x")).toBe("/today");
    expect(safeHref("//evil.example")).toBe("/today");
    expect(safeHref("/focus?task=1")).toBe("/focus?task=1");
  });

  it("is rare: first after 9 s, then 75 s apart, never when blocked", () => {
    const g = { mountedAt: 0, lastShownAt: null, blocked: false, queued: 1 };
    expect(mayShowTip({ ...g, now: TIP_FIRST_MS - 1 })).toBe(false);
    expect(mayShowTip({ ...g, now: TIP_FIRST_MS })).toBe(true);
    expect(mayShowTip({ ...g, now: TIP_FIRST_MS, blocked: true })).toBe(false);
    expect(mayShowTip({ ...g, now: TIP_FIRST_MS, queued: 0 })).toBe(false);
    const next = { ...g, lastShownAt: 20_000 };
    expect(mayShowTip({ ...next, now: 20_000 + TIP_EVERY_MS - 1 })).toBe(false);
    expect(mayShowTip({ ...next, now: 20_000 + TIP_EVERY_MS })).toBe(true);
  });

  it("stays away from setup and money places", () => {
    expect(quietPlace("/connections")).toBe(true);
    expect(quietPlace("/settings/billing")).toBe(true);
    expect(quietPlace("/today")).toBe(false);
    expect(quietPlace(null)).toBe(false);
  });

  it("says how long ago, the way the bell does", () => {
    const now = Date.UTC(2026, 9, 14, 12);
    expect(agoLabel(now - 20_000, now)).toBe("Now");
    expect(agoLabel(now - 12 * 60_000, now)).toBe("12 min");
    expect(agoLabel(now - 3 * 3_600_000, now)).toBe("3 h");
    expect(agoLabel(now - 30 * 3_600_000, now)).toBe("Yesterday");
    expect(agoLabel(now - 3 * 86_400_000, now)).toBe("3 days ago");
  });
});
