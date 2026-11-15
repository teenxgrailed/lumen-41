import {
  MENU_ORDER,
  menuAction,
  menuIdForPath,
  menuRows,
  menuWord,
} from "@/components/needt3/phone/menu/places";

import {
  FREE_LESSONS_PER_DAY,
  SAMPLE_TOPIC_VIEWS,
  canOpenLesson,
  filterLessons,
  findTopic,
  isLearnPath,
  learnLessonHref,
  learnNavItem,
  lessonSourceLine,
  shownTopics,
  topicCountLine,
} from "@/lib/needt3/learn";
import type { LearnOverview } from "@/lib/needt3/learn";

const own: LearnOverview = {
  topics: [
    {
      id: "t1",
      title: "Investing",
      color: "green",
      icon: "money",
      goal: null,
      level: null,
      sampleKey: null,
      sample: false,
      lessons: [
        {
          id: "l1",
          topicId: "t1",
          title: "Index funds",
          source: "AI",
          minutes: 6,
          status: "done",
          scheduledTaskId: null,
          completedAt: "2026-11-15T08:00:00.000Z",
        },
        {
          id: "l2",
          topicId: "t1",
          title: "Fees",
          source: "AI",
          minutes: 4,
          status: "new",
          scheduledTaskId: null,
          completedAt: null,
        },
      ],
    },
  ],
  today: { completed: 0, limit: 1 },
};

describe("learn nav item", () => {
  it("waits for the plan", () => {
    expect(learnNavItem({ pro: undefined })).toBeNull();
  });
  it("is locked on Free and open on Pro", () => {
    expect(learnNavItem({ pro: false })).toEqual({
      href: "/learn",
      label: "Learn",
      locked: true,
    });
    expect(learnNavItem({ pro: true })?.locked).toBe(false);
  });
  it("knows its paths", () => {
    expect(isLearnPath("/learn")).toBe(true);
    expect(isLearnPath("/learn/sample-deutsch/x")).toBe(true);
    expect(isLearnPath("/learning")).toBe(false);
    expect(learnLessonHref("t 1", "l/2")).toBe("/learn/t%201/l%2F2");
  });
});

describe("phone menu", () => {
  it("has Learn after Budget and before Settings, only when shown", () => {
    const i = MENU_ORDER.indexOf("learn");
    expect(MENU_ORDER[i - 1]).toBe("budget");
    expect(MENU_ORDER[i + 1]).toBe("settings");
    expect(menuRows(["home", "docs", "ask"])).not.toContain("learn");
    expect(menuRows(["home", "docs", "ask"], { learn: true })).toContain(
      "learn"
    );
    expect(menuWord("learn")).toBe("Learn");
    expect(menuAction("learn")).toEqual({ kind: "route", href: "/learn" });
    expect(menuIdForPath("/learn/sample-design")).toBe("learn");
  });
});

describe("topics shown", () => {
  it("are the samples while the person has none", () => {
    expect(shownTopics(undefined)).toBeUndefined();
    expect(shownTopics({ topics: [], today: own.today })).toBe(
      SAMPLE_TOPIC_VIEWS
    );
    expect(shownTopics(own)?.map((t) => t.id)).toEqual(["t1"]);
    expect(SAMPLE_TOPIC_VIEWS.every((t) => t.sample)).toBe(true);
  });
  it("finds a sample by id even when the person has topics", () => {
    expect(findTopic(own, "sample-finance")?.title).toBe("Finance");
    expect(findTopic(own, "t1")?.title).toBe("Investing");
    expect(findTopic(own, "missing")).toBeNull();
  });
});

describe("free lesson a day", () => {
  const fresh = { status: "new" as const };
  it("lets Pro open anything", () => {
    expect(
      canOpenLesson({
        pro: true,
        lesson: fresh,
        today: { completed: 9, limit: null },
      })
    ).toBe(true);
  });
  it("gives Free one lesson, then the promo", () => {
    expect(FREE_LESSONS_PER_DAY).toBe(1);
    expect(
      canOpenLesson({
        pro: false,
        lesson: fresh,
        today: { completed: 0, limit: 1 },
      })
    ).toBe(true);
    expect(
      canOpenLesson({
        pro: false,
        lesson: fresh,
        today: { completed: 1, limit: 1 },
      })
    ).toBe(false);
  });
  it("always reopens a lesson already done", () => {
    expect(
      canOpenLesson({
        pro: false,
        lesson: { status: "done" },
        today: { completed: 1, limit: 1 },
      })
    ).toBe(true);
  });
});

describe("lines", () => {
  it("say source and minutes, count and done", () => {
    const t = own.topics[0];
    expect(lessonSourceLine(t.lessons[0])).toBe("AI · 6 min");
    expect(topicCountLine(t)).toBe("2 lessons · 1 done");
    expect(filterLessons(t.lessons, "new").map((l) => l.id)).toEqual(["l2"]);
    expect(filterLessons(t.lessons, "all")).toHaveLength(2);
  });
});
