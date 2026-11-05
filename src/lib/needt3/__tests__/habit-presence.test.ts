import {
  EMPTY_MEMORY,
  ISLAND_GAP_MS,
  LATER_MS,
  type PresenceInput,
  inQuiet,
  nextIsland,
  readMemory,
  rememberLater,
  rememberShown,
} from "@/lib/needt3/habit-presence";

const settings = {
  habitReminders: true,
  habitCheckin: true,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  quietHours: false,
  quietStart: "23:00",
  quietEnd: "07:00",
};
const german = {
  id: "de",
  title: "German",
  at: "18:00",
  keptToday: false,
  remindersEnabled: true,
  of14: 10,
};
const input = (patch: Partial<PresenceInput> = {}): PresenceInput => ({
  now: new Date("2026-11-04T18:05:00Z"),
  timeZone: "UTC",
  dos: [german],
  quits: [],
  settings,
  memory: EMPTY_MEMORY,
  busy: false,
  ...patch,
});

describe("reminders", () => {
  it("speak up at the habit's time and not before or long after", () => {
    expect(nextIsland(input())).toMatchObject({
      kind: "reminder",
      title: "German, 18:00",
      body: "Your slot starts now · 10 of 14",
      canLater: true,
    });
    expect(
      nextIsland(input({ now: new Date("2026-11-04T17:55:00Z") }))
    ).toBeNull();
    expect(
      nextIsland(input({ now: new Date("2026-11-04T18:45:00Z") }))
    ).toBeNull();
  });

  it("stay quiet once the habit is done, or with its reminder off", () => {
    expect(
      nextIsland(input({ dos: [{ ...german, keptToday: true }] }))
    ).toBeNull();
    expect(
      nextIsland(input({ dos: [{ ...german, remindersEnabled: false }] }))
    ).toBeNull();
    expect(
      nextIsland(input({ settings: { ...settings, habitReminders: false } }))
    ).toBeNull();
  });

  it("show once a day, and come back once after Later", () => {
    const first = nextIsland(input())!;
    const now = new Date("2026-11-04T18:05:00Z").getTime();
    let memory = rememberShown(EMPTY_MEMORY, first.key, now);
    memory = { ...memory, lastShownAt: null };
    expect(nextIsland(input({ memory }))).toBeNull();

    memory = rememberLater(memory, first.key, now);
    expect(
      nextIsland(input({ memory, now: new Date(now + LATER_MS - 60_000) }))
    ).toBeNull();
    const again = nextIsland(input({ memory, now: new Date(now + LATER_MS) }));
    expect(again).toMatchObject({ kind: "reminder", canLater: false });
    memory = { ...rememberShown(memory, again!.key, now), lastShownAt: null };
    expect(
      nextIsland(input({ memory, now: new Date(now + LATER_MS + 60_000) }))
    ).toBeNull();
  });
});

describe("what holds every island back", () => {
  it("never while the panel is open, a focus runs or the agent answers", () => {
    expect(nextIsland(input({ busy: true }))).toBeNull();
  });

  it("at most one island per twenty minutes", () => {
    const now = new Date("2026-11-04T18:05:00Z");
    const memory = {
      ...EMPTY_MEMORY,
      lastShownAt: now.getTime() - ISLAND_GAP_MS + 1,
    };
    expect(nextIsland(input({ memory }))).toBeNull();
  });

  it("nothing in quiet hours, which may cross midnight", () => {
    const quiet = {
      ...settings,
      quietHours: true,
      quietStart: "17:00",
      quietEnd: "19:00",
    };
    expect(nextIsland(input({ settings: quiet }))).toBeNull();
    expect(inQuiet({ ...settings, quietHours: true }, 23 * 60 + 30)).toBe(true);
    expect(inQuiet({ ...settings, quietHours: true }, 6 * 60)).toBe(true);
    expect(inQuiet({ ...settings, quietHours: true }, 12 * 60)).toBe(false);
  });
});

describe("milestones", () => {
  const quit = {
    id: "q",
    title: "Smoking",
    runStart: "2026-10-21T09:00:00Z",
    best: 31,
    remindersEnabled: true,
  };

  it("names the step reached, once per run, before anything else", () => {
    const m = nextIsland(input({ quits: [quit] }));
    expect(m).toMatchObject({
      kind: "milestone",
      title: "Two weeks without smoking",
      body: "14 days. Best run is 31.",
    });
    const memory = {
      ...rememberShown(EMPTY_MEMORY, m!.key, 0),
      lastShownAt: null,
    };
    expect(nextIsland(input({ quits: [quit], memory }))?.kind).toBe("reminder");
  });

  it("starts over with a new run", () => {
    const m = nextIsland(input({ quits: [quit] }))!;
    const memory = {
      ...rememberShown(EMPTY_MEMORY, m.key, 0),
      lastShownAt: null,
    };
    const restarted = { ...quit, runStart: "2026-11-03T08:00:00Z" };
    expect(nextIsland(input({ quits: [restarted], memory }))).toMatchObject({
      kind: "milestone",
      title: "One day without smoking",
    });
  });

  it("stay quiet for a habit whose switch is off", () => {
    expect(
      nextIsland(
        input({ quits: [{ ...quit, remindersEnabled: false }], dos: [] })
      )
    ).toBeNull();
  });

  it("stay off with the setting off", () => {
    expect(
      nextIsland(
        input({
          quits: [quit],
          dos: [],
          settings: { ...settings, habitMilestones: false },
        })
      )
    ).toBeNull();
  });
});

describe("the evening check-in", () => {
  it("comes at its time while something is still open, once a day", () => {
    const now = new Date("2026-11-04T21:10:00Z");
    const c = nextIsland(input({ now, dos: [{ ...german, at: null }] }));
    expect(c).toMatchObject({
      kind: "checkin",
      title: "Evening check-in",
      body: "1 habit · takes ten seconds",
    });
    const memory = {
      ...rememberShown(EMPTY_MEMORY, c!.key, 0),
      lastShownAt: null,
    };
    expect(
      nextIsland(input({ now, memory, dos: [{ ...german, at: null }] }))
    ).toBeNull();
  });

  it("is skipped when everything is marked", () => {
    const now = new Date("2026-11-04T21:10:00Z");
    expect(
      nextIsland(
        input({ now, dos: [{ ...german, at: null, keptToday: true }] })
      )
    ).toBeNull();
  });
});

describe("the device's memory", () => {
  it("survives garbage", () => {
    expect(readMemory("not json")).toEqual(EMPTY_MEMORY);
    expect(
      readMemory(JSON.stringify({ seen: ["a", 2], lastShownAt: 5 }))
    ).toEqual({
      seen: ["a"],
      later: {},
      lastShownAt: 5,
    });
  });
});
