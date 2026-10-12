/**
 * The phone composer's rules against the prototype's fixed day: Tuesday,
 * 1 September 2026 (the week of 31 Aug – 6 Sep). `now` and `today` are
 * arguments, so no clock is read.
 */
import { coParse } from "@/components/needt/composer/co-parse";

import { newDate, newDateFromYMD } from "@/lib/date-utils";
import type { V3Project } from "@/lib/needt3/map";

import {
  canCommit,
  composeFromLine,
  composeFromParse,
  settleCommit,
  vocabularyOf,
  writeFacet,
} from "../compose";
import { dayIn } from "../today";

const NOW = newDateFromYMD(2026, 8, 1);
const TODAY = "2026-09-01";

const project = (id: string, name: string): V3Project => ({
  id,
  name,
  color: null,
  icon: null,
  ground: null,
  position: 0,
  archived: false,
});
const PROJECTS = [project("p-ops", "Operations"), project("p-res", "Resale")];

const compose = (line: string) => composeFromLine(line, NOW, TODAY, PROJECTS);

describe("composeFromLine", () => {
  it("a bare line lands on today, 30 minutes, medium", () => {
    const c = compose("Call Anna");
    expect(c?.draft).toEqual({
      title: "Call Anna",
      estimatedMinutes: 30,
      dueDate: TODAY,
    });
    expect(c?.parts).toEqual([]);
  });

  it("reads the day, the clock, the length, the project and the priority", () => {
    const c = compose("Call Anna tomorrow at 3pm for 45 min Resale urgent");
    expect(c?.draft).toMatchObject({
      title: "Call Anna tomorrow at 3pm for 45 min Resale urgent",
      dueDate: "2026-09-02",
      scheduledStart: "2026-09-02T15:00",
      scheduledEnd: "2026-09-02T15:45",
      isFixed: true,
      estimatedMinutes: 45,
      projectId: "p-res",
      priority: "urgent",
    });
  });

  it("'important' is high and 'whenever' is low, the words createDraft knows", () => {
    expect(compose("File taxes important")?.draft.priority).toBe("high");
    expect(compose("Sort the cellar whenever")?.draft.priority).toBe("low");
  });

  it("a deadline is the day the words name, in the person's day", () => {
    const c = compose("Send the invoice by friday");
    expect(c?.draft.deadline).toBe("2026-09-04");
    expect(c?.draft.hardDeadline).toBeUndefined();
  });

  it("a day written as 'Sep 4' (which toDate does not read) still resolves", () => {
    expect(compose("Pay rent Sep 4")?.draft.dueDate).toBe("2026-09-04");
  });

  it("the person's own today decides 'tomorrow', not the browser's", () => {
    const c = composeFromLine(
      "Call Anna tomorrow",
      NOW,
      "2026-09-10",
      PROJECTS
    );
    expect(c?.draft.dueDate).toBe("2026-09-11");
  });

  it("everything after a slash is a part", () => {
    const c = compose("Pack for the shoot / charge the flash / batteries");
    expect(c?.parts).toEqual(["charge the flash", "batteries"]);
    expect(c?.draft.title).toBe("Pack for the shoot");
  });

  it("an empty line or one that is only parts makes nothing", () => {
    expect(compose("   ")).toBeNull();
    expect(compose("/ only a part")).toBeNull();
  });

  it("an unknown word is not a project", () => {
    expect(compose("Call Anna about Mars")?.draft.projectId).toBeUndefined();
  });
});

describe("vocabularyOf", () => {
  it("carries names and ids, and leaves labels out (a task has no label column)", () => {
    const v = vocabularyOf(PROJECTS);
    expect(v.projects.map((p) => p.name)).toEqual(["Operations", "Resale"]);
    expect(v.labels).toEqual([]);
    expect(
      composeFromParse(coParse("money errand", NOW, v), TODAY)?.draft
    ).toEqual({ title: "money errand", estimatedMinutes: 30, dueDate: TODAY });
  });
});

describe("writeFacet", () => {
  const vocab = vocabularyOf(PROJECTS);
  const write = (
    line: string,
    kind: "date" | "project" | "priority",
    words: string
  ) => writeFacet(line, coParse(line, NOW, vocab), kind, words);

  it("replaces the words the line already used for that facet", () => {
    expect(write("Call Anna tomorrow", "date", "next week")).toBe(
      "Call Anna next week"
    );
    expect(write("Call Anna urgent now", "priority", "whenever")).toBe(
      "Call Anna whenever now"
    );
  });

  it("appends when the line did not say it", () => {
    expect(write("Call Anna", "date", "today")).toBe("Call Anna today");
    expect(write("Call Anna  ", "project", "Resale")).toBe("Call Anna Resale");
  });

  it("empty words remove the facet, and never leave a double space", () => {
    expect(write("Call Anna tomorrow now", "date", "")).toBe("Call Anna now");
    expect(write("Call Anna", "date", "")).toBe("Call Anna");
    expect(write("tomorrow call Anna", "date", "")).toBe("call Anna");
  });
});

describe("dayIn", () => {
  it("is the person's day in their zone", () => {
    const late = newDate("2026-09-01T23:30:00Z");
    expect(dayIn(late, "UTC")).toBe("2026-09-01");
    expect(dayIn(late, "Europe/Berlin")).toBe("2026-09-02");
    expect(dayIn(late, "America/Los_Angeles")).toBe("2026-09-01");
  });
});

describe("adding a task", () => {
  const composed = composeFromLine("Call Sam", NOW, TODAY, [])!;

  it("sends a line that says something, once", () => {
    expect(canCommit(composed, false)).toBe(true);
    expect(canCommit(composed, true)).toBe(false); // a double tap while pending
    expect(canCommit(null, false)).toBe(false); // an empty line
  });

  it("clears the text and closes only after the create resolved", async () => {
    const out = await settleCommit(async () => ({ id: "t1" }));
    expect(out).toEqual({
      ok: true,
      clear: true,
      close: true,
      value: { id: "t1" },
    });
  });

  it("keeps the text and the sheet when the create fails", async () => {
    const out = await settleCommit(async () => {
      throw new Error("offline");
    });
    expect(out.ok).toBe(false);
    expect(out.clear).toBe(false);
    expect(out.close).toBe(false);
  });

  it("decides nothing until the create has settled", async () => {
    let release: (v: string) => void = () => undefined;
    const pending = new Promise<string>((r) => (release = r));
    let settled = false;
    const run = settleCommit(() => pending).then((o) => {
      settled = true;
      return o;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    release("done");
    expect((await run).clear).toBe(true);
  });
});
