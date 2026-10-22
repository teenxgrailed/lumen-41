import { BlockingMode } from "@prisma/client";

import { type BlockingProfileRule, resolveActiveBlocking } from "../active";

const at = (iso: string) => new Date(iso);

function profile(over: Partial<BlockingProfileRule>): BlockingProfileRule {
  return {
    id: "p1",
    name: "Deep work",
    sites: ["youtube.com"],
    apps: [],
    mode: BlockingMode.BLOCKLIST,
    onFocusSession: false,
    eventKeywords: [],
    calendarFeedIds: [],
    projectIds: [],
    enabled: true,
    ...over,
  };
}

const none = { session: null, events: [], blocks: [] };

describe("resolveActiveBlocking", () => {
  it("is inactive when nothing is under way", () => {
    const result = resolveActiveBlocking({
      profiles: [profile({ onFocusSession: true })],
      ...none,
    });
    expect(result).toMatchObject({ active: false, sites: [], mode: null });
  });

  it("holds during a focus session and ends with it", () => {
    const result = resolveActiveBlocking({
      profiles: [profile({ onFocusSession: true })],
      ...none,
      session: {
        id: "s1",
        startedAt: at("2026-10-21T10:00:00Z"),
        endsAt: at("2026-10-21T10:25:00Z"),
        taskTitle: "Write brief",
      },
    });
    expect(result.active).toBe(true);
    expect(result.sites).toEqual(["youtube.com"]);
    expect(result.until).toEqual(at("2026-10-21T10:25:00Z"));
    expect(result.profiles[0].reason).toMatchObject({
      kind: "focus_session",
      title: "Write brief",
    });
  });

  it("matches event titles case-insensitively and by calendar", () => {
    const events = [
      {
        id: "e1",
        title: "DEEP WORK: launch",
        feedId: "f9",
        end: at("2026-10-21T12:00:00Z"),
      },
    ];
    const byWord = resolveActiveBlocking({
      profiles: [profile({ eventKeywords: ["deep work"] })],
      ...none,
      events,
    });
    const byFeed = resolveActiveBlocking({
      profiles: [profile({ calendarFeedIds: ["f9"] })],
      ...none,
      events,
    });
    expect(byWord.profiles[0].reason.kind).toBe("event");
    expect(byFeed.active).toBe(true);
  });

  it("matches a scheduled block of a task in a chosen project", () => {
    const result = resolveActiveBlocking({
      profiles: [profile({ projectIds: ["proj"] })],
      ...none,
      blocks: [
        {
          taskId: "t1",
          taskTitle: "Thesis",
          projectId: "proj",
          end: at("2026-10-21T15:30:00Z"),
        },
      ],
    });
    expect(result.profiles[0].reason).toMatchObject({
      kind: "task_block",
      title: "Thesis",
    });
  });

  it("skips disabled profiles", () => {
    const result = resolveActiveBlocking({
      profiles: [profile({ onFocusSession: true, enabled: false })],
      ...none,
      session: {
        id: "s1",
        startedAt: at("2026-10-21T10:00:00Z"),
        endsAt: null,
        taskTitle: null,
      },
    });
    expect(result.active).toBe(false);
  });

  it("merges block lists and lets an allow list win, ending at the earliest end", () => {
    const session = {
      id: "s1",
      startedAt: at("2026-10-21T10:00:00Z"),
      endsAt: null,
      taskTitle: null,
    };
    const events = [
      {
        id: "e1",
        title: "Focus",
        feedId: "f",
        end: at("2026-10-21T11:00:00Z"),
      },
    ];
    const merged = resolveActiveBlocking({
      profiles: [
        profile({ id: "a", onFocusSession: true, sites: ["x.com"] }),
        profile({
          id: "b",
          eventKeywords: ["focus"],
          sites: ["reddit.com", "x.com"],
        }),
      ],
      session,
      events,
      blocks: [],
    });
    expect(merged.mode).toBe(BlockingMode.BLOCKLIST);
    expect(merged.sites).toEqual(["reddit.com", "x.com"]);
    expect(merged.until).toEqual(at("2026-10-21T11:00:00Z"));

    const strict = resolveActiveBlocking({
      profiles: [
        profile({ id: "a", onFocusSession: true, sites: ["x.com"] }),
        profile({
          id: "b",
          eventKeywords: ["focus"],
          mode: BlockingMode.ALLOWLIST,
          sites: ["docs.google.com"],
        }),
      ],
      session,
      events,
      blocks: [],
    });
    expect(strict.mode).toBe(BlockingMode.ALLOWLIST);
    expect(strict.sites).toEqual(["docs.google.com"]);
    expect(strict.profiles).toHaveLength(2);
  });

  it("has no end while only an open-ended session holds", () => {
    const result = resolveActiveBlocking({
      profiles: [profile({ onFocusSession: true })],
      ...none,
      session: {
        id: "s1",
        startedAt: at("2026-10-21T10:00:00Z"),
        endsAt: null,
        taskTitle: null,
      },
    });
    expect(result.until).toBeNull();
  });
});
