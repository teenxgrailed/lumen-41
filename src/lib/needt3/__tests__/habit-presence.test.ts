import {
  EMPTY_MEMORY,
  ISLAND_GAP_MS,
  type PresenceInput,
  type PresenceQuit,
  checkinTimeOptions,
  inQuiet,
  nextIsland,
  presenceSchedule,
  readMemory,
  rememberShown,
  seedMemory,
} from "@/lib/needt3/habit-presence";

const settings = {
  habitReminders: true,
  habitCheckin: true,
  habitCheckinTime: "21:00",
  habitMilestones: true,
  quietHours: false,
  quietStart: "23:00",
  quietEnd: "07:00",
  reminders: true,
  channelInApp: true,
  digest: false,
};
// Wednesday 4 November 2026.
const german = {
  id: "de",
  title: "German",
  at: "18:00",
  daysOfWeek: [] as number[],
  doneToday: false,
  remindersEnabled: true,
  of14: 10,
};
const quit: PresenceQuit = {
  id: "q",
  title: "Smoking",
  remindersEnabled: true,
  currentStreak: 14,
  lastMilestone: 14,
  streakStartedAt: "2026-10-21T09:00:00Z",
};
const input = (patch: Partial<PresenceInput> = {}): PresenceInput => ({
  now: new Date("2026-11-04T18:05:00Z"),
  timeZone: "UTC",
  dos: [german],
  quits: [],
  settings,
  memory: { ...EMPTY_MEMORY, seeded: true },
  busy: false,
  ...patch,
});
const shown = (key: string) => ({
  ...rememberShown({ ...EMPTY_MEMORY, seeded: true }, key, 0),
  lastShownAt: null,
});

describe("reminders", () => {
  it("speak in the server's 60-minute window, with the push's tag", () => {
    expect(nextIsland(input())).toMatchObject({
      kind: "reminder",
      title: "German, 18:00",
      body: "Your slot starts now · 10 of 14",
      tag: "rem:de:2026-11-04",
    });
    expect(
      nextIsland(input({ now: new Date("2026-11-04T18:59:00Z") }))?.kind
    ).toBe("reminder");
    expect(
      nextIsland(input({ now: new Date("2026-11-04T17:55:00Z") }))
    ).toBeNull();
    expect(
      nextIsland(input({ now: new Date("2026-11-04T19:00:00Z") }))
    ).toBeNull();
  });

  it("only on the habit's weekdays", () => {
    // 3 = Wednesday.
    expect(
      nextIsland(input({ dos: [{ ...german, daysOfWeek: [1, 2] }] }))
    ).toBeNull();
    expect(
      nextIsland(input({ dos: [{ ...german, daysOfWeek: [3] }] }))?.kind
    ).toBe("reminder");
  });

  it("stay quiet once done, with its reminder off, or with the setting off", () => {
    expect(
      nextIsland(input({ dos: [{ ...german, doneToday: true }] }))
    ).toBeNull();
    expect(
      nextIsland(input({ dos: [{ ...german, remindersEnabled: false }] }))
    ).toBeNull();
    expect(
      nextIsland(input({ settings: { ...settings, habitReminders: false } }))
    ).toBeNull();
  });

  it("show once a day", () => {
    expect(
      nextIsland(input({ memory: shown("rem:de:2026-11-04") }))
    ).toBeNull();
  });

  it("use the person's zone, across a clock change", () => {
    // 18:05 in Zurich on 25 October (the night the clocks went back) is
    // 17:05 UTC; the browser or server zone plays no part.
    expect(
      nextIsland(
        input({
          timeZone: "Europe/Zurich",
          now: new Date("2026-10-25T17:05:00Z"),
        })
      )
    ).toMatchObject({ kind: "reminder", tag: "rem:de:2026-10-25" });
    expect(
      nextIsland(
        input({
          timeZone: "Europe/Zurich",
          now: new Date("2026-10-25T18:05:00Z"),
        })
      )
    ).toBeNull();
  });
});

describe("what holds every island back", () => {
  it("never while the panel is open, a focus runs or the agent answers", () => {
    expect(nextIsland(input({ busy: true }))).toBeNull();
  });

  it("at most one island per twenty minutes", () => {
    const at = new Date("2026-11-04T18:05:00Z").getTime();
    const memory = { ...EMPTY_MEMORY, seeded: true };
    expect(
      nextIsland(
        input({ memory: { ...memory, lastShownAt: at - ISLAND_GAP_MS + 1 } })
      )
    ).toBeNull();
    expect(
      nextIsland(
        input({ memory: { ...memory, lastShownAt: at - ISLAND_GAP_MS } })
      )
    ).not.toBeNull();
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

  it.each([
    ["Reminders is off", { reminders: false }],
    ["In the app is off", { channelInApp: false }],
    ["a daily digest replaces the stream", { digest: true }],
  ])("nothing when %s", (_name, patch) => {
    expect(
      nextIsland(input({ settings: { ...settings, ...patch } }))
    ).toBeNull();
  });
});

describe("milestones", () => {
  const morning = new Date("2026-11-04T09:30:00Z");

  it("names the step the server would announce, in the morning, before anything else", () => {
    expect(nextIsland(input({ quits: [quit], now: morning }))).toMatchObject({
      kind: "milestone",
      title: "Two weeks without smoking",
      tag: "ms:q:14",
    });
  });

  it("never before 09:00", () => {
    expect(
      nextIsland(
        input({ quits: [quit], dos: [], now: new Date("2026-11-04T08:59:00Z") })
      )
    ).toBeNull();
  });

  it("only when reached today or yesterday, as the server's rule", () => {
    expect(
      nextIsland(
        input({
          quits: [{ ...quit, currentStreak: 16 }],
          dos: [],
          now: morning,
        })
      )
    ).toBeNull();
  });

  it("once per run, and again for a new run", () => {
    const m = nextIsland(input({ quits: [quit], dos: [], now: morning }))!;
    expect(
      nextIsland(
        input({ quits: [quit], dos: [], now: morning, memory: shown(m.key) })
      )
    ).toBeNull();
    const again = { ...quit, streakStartedAt: "2026-10-22T08:00:00Z" };
    expect(
      nextIsland(
        input({ quits: [again], dos: [], now: morning, memory: shown(m.key) })
      )?.kind
    ).toBe("milestone");
  });

  it("stay quiet for a habit whose switch is off, or with the setting off", () => {
    expect(
      nextIsland(
        input({
          quits: [{ ...quit, remindersEnabled: false }],
          dos: [],
          now: morning,
        })
      )
    ).toBeNull();
    expect(
      nextIsland(
        input({
          quits: [quit],
          dos: [],
          now: morning,
          settings: { ...settings, habitMilestones: false },
        })
      )
    ).toBeNull();
  });

  it("are not news on the first run: the standing ones are seeded as seen", () => {
    const memory = seedMemory(EMPTY_MEMORY, [quit]);
    expect(memory.seeded).toBe(true);
    expect(
      nextIsland(input({ quits: [quit], dos: [], now: morning, memory }))
    ).toBeNull();
    // Seeding happens once.
    expect(seedMemory(memory, [{ ...quit, id: "other" }])).toBe(memory);
  });
});

describe("the evening check-in", () => {
  const evening = new Date("2026-11-04T21:10:00Z");

  it("counts as the server: open Do habits that run today and remind, plus Quit", () => {
    const c = nextIsland(
      input({
        now: evening,
        dos: [
          { ...german, at: null },
          { ...german, id: "off", at: null, remindersEnabled: false },
          { ...german, id: "mon", at: null, daysOfWeek: [1] },
        ],
        quits: [{ ...quit, lastMilestone: 7 }],
      })
    );
    expect(c).toMatchObject({
      kind: "checkin",
      tag: "checkin:2026-11-04",
      body: "2 habits · takes ten seconds",
    });
  });

  it("only in its 60-minute window, once a day", () => {
    const dos = [{ ...german, at: null }];
    expect(
      nextIsland(input({ now: new Date("2026-11-04T22:00:00Z"), dos }))
    ).toBeNull();
    expect(
      nextIsland(
        input({ now: evening, dos, memory: shown("checkin:2026-11-04") })
      )
    ).toBeNull();
  });

  it("is skipped when everything is marked", () => {
    expect(
      nextIsland(
        input({ now: evening, dos: [{ ...german, at: null, doneToday: true }] })
      )
    ).toBeNull();
  });

  it("offers the stored time even when it is not a half hour", () => {
    expect(checkinTimeOptions("21:00")).toHaveLength(12);
    const odd = checkinTimeOptions("20:15").map(([v]) => v);
    expect(odd).toContain("20:15");
    expect(odd).toEqual([...odd].sort());
  });
});

describe("the device's memory", () => {
  it("survives garbage", () => {
    expect(readMemory("not json")).toEqual(EMPTY_MEMORY);
    expect(
      readMemory(
        JSON.stringify({ seen: ["a", 2], lastShownAt: 5, seeded: true })
      )
    ).toEqual({
      seen: ["a"],
      lastShownAt: 5,
      seeded: true,
    });
  });
});

describe("the Mac app's schedule", () => {
  // Wednesday 4 November, 15:00 UTC.
  const at15 = new Date("2026-11-04T15:00:00Z");
  const plan = (patch: Partial<PresenceInput> = {}) => {
    const all = input({ now: at15, ...patch });
    return presenceSchedule({
      now: all.now,
      timeZone: all.timeZone,
      settings: all.settings,
      dos: all.dos,
      quits: all.quits,
    });
  };

  it("holds today's and tomorrow's moments, later than now, in order", () => {
    expect(plan().map((m) => [m.tag, m.at])).toEqual([
      ["rem:de:2026-11-04", "2026-11-04T18:00:00.000Z"],
      ["checkin:2026-11-04", "2026-11-04T21:00:00.000Z"],
      ["rem:de:2026-11-05", "2026-11-05T18:00:00.000Z"],
      ["checkin:2026-11-05", "2026-11-05T21:00:00.000Z"],
    ]);
  });

  it("drops today's reminder once the habit is done, not tomorrow's", () => {
    const tags = plan({ dos: [{ ...german, doneToday: true }] }).map(
      (m) => m.tag
    );
    expect(tags).not.toContain("rem:de:2026-11-04");
    expect(tags).not.toContain("checkin:2026-11-04");
    expect(tags).toContain("rem:de:2026-11-05");
  });

  it("keeps to the habit's weekdays and the person's zone", () => {
    // Thursday only (4); Zurich is UTC+1 in November.
    const tags = plan({
      timeZone: "Europe/Zurich",
      dos: [{ ...german, daysOfWeek: [4] }],
    });
    expect(tags.filter((m) => m.tag.startsWith("rem:"))).toEqual([
      expect.objectContaining({
        tag: "rem:de:2026-11-05",
        at: "2026-11-05T17:00:00.000Z",
      }),
    ]);
  });

  it("names the milestone on its day at 09:00", () => {
    const m = plan({
      dos: [],
      quits: [{ ...quit, nextMilestone: { days: 30, daysLeft: 1 } }],
    }).find((x) => x.tag.startsWith("ms:"));
    expect(m).toEqual(
      expect.objectContaining({
        tag: "ms:q:30",
        at: "2026-11-05T09:00:00.000Z",
        url: "/habits?quit=q",
      })
    );
  });

  it("is empty with the switches that silence the app, and skips quiet hours", () => {
    expect(plan({ settings: { ...settings, digest: true } })).toEqual([]);
    expect(plan({ settings: { ...settings, channelMac: false } })).toEqual([]);
    // In the app is the island's channel, not the system's.
    expect(
      plan({ settings: { ...settings, channelInApp: false } })
    ).not.toEqual([]);
    const quiet = plan({
      settings: {
        ...settings,
        quietHours: true,
        quietStart: "20:00",
        quietEnd: "07:00",
      },
    }).map((m) => m.tag);
    expect(quiet.some((t) => t.startsWith("checkin:"))).toBe(false);
    expect(quiet).toContain("rem:de:2026-11-04");
  });
});
