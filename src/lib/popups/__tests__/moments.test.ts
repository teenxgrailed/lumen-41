import { PLAN_LIMITS } from "@/lib/plan-limits";

import {
  TRIAL_ENDED_WINDOW_MS,
  limitMoment,
  trialMomentKey,
  trialMoments,
} from "../moments";
import { POPUP_LIMITS } from "../types";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00Z");
const inFuture = (ms: number) => new Date(NOW.getTime() + ms);

describe("trial timeline", () => {
  it("says nothing while more than 3 days remain", () => {
    expect(trialMomentKey("TRIAL", inFuture(3 * DAY + 1000), NOW)).toBeNull();
  });

  it("is the 3-day moment from 3 days out", () => {
    expect(trialMomentKey("TRIAL", inFuture(3 * DAY), NOW)).toBe("trial:3d");
    expect(trialMomentKey("TRIAL", inFuture(2 * DAY), NOW)).toBe("trial:3d");
  });

  it("is the 1-day moment in the last day", () => {
    expect(trialMomentKey("TRIAL", inFuture(DAY), NOW)).toBe("trial:1d");
    expect(trialMomentKey("TRIAL", inFuture(60_000), NOW)).toBe("trial:1d");
  });

  it("is the ended moment after the trial lapses into Free, for a week", () => {
    expect(trialMomentKey("FREE", inFuture(-1000), NOW)).toBe("trial:ended");
    expect(
      trialMomentKey("FREE", inFuture(-TRIAL_ENDED_WINDOW_MS), NOW)
    ).toBe("trial:ended");
    expect(
      trialMomentKey("FREE", inFuture(-TRIAL_ENDED_WINDOW_MS - 1000), NOW)
    ).toBeNull();
  });

  it("is silent for someone who paid", () => {
    expect(trialMomentKey("PRO", inFuture(-DAY), NOW)).toBeNull();
    expect(trialMomentKey("LIFETIME", inFuture(DAY), NOW)).toBeNull();
  });

  it("is silent without a trial", () => {
    expect(trialMomentKey("FREE", null, NOW)).toBeNull();
    expect(trialMoments("FREE", null, NOW)).toEqual([]);
  });

  it("builds a trial candidate carrying no price", () => {
    const [c] = trialMoments("TRIAL", inFuture(DAY), NOW);
    expect(c.source).toBe("trial");
    expect(c.key).toBe("trial:1d");
    expect(c.view.id).toBe("moment:trial:trial:1d");
    expect(JSON.stringify(c.view)).not.toMatch(/\$\d/);
    expect(c.view.cards.map((x) => x.plan)).toEqual(["pro", "lifetime"]);
    expect(c.view.bullets.length).toBeGreaterThan(0);
  });
});

describe("limit moments", () => {
  it("exists only for a Free account", () => {
    expect(limitMoment("habits", "FREE")).not.toBeNull();
    expect(limitMoment("habits", "TRIAL")).toBeNull();
    expect(limitMoment("habits", "PRO")).toBeNull();
    expect(limitMoment("habits", "LIFETIME")).toBeNull();
  });

  it.each([...POPUP_LIMITS])("builds a card pair for %s", (limit) => {
    const c = limitMoment(limit, "FREE");
    expect(c?.source).toBe("limit");
    expect(c?.key).toBe(`limit:${limit}`);
    expect(c?.view.cards).toEqual([
      { plan: "pro", pick: "annual" },
      { plan: "lifetime", pick: "lifetime" },
    ]);
  });

  it("reads the Free limit from the plan table the server enforces", () => {
    const habits = limitMoment("habits", "FREE");
    expect(habits?.view.body).toContain(String(PLAN_LIMITS.FREE.habits));
    const schedule = limitMoment("auto_schedule", "FREE");
    expect(schedule?.view.body).toContain(
      String(PLAN_LIMITS.FREE.autoScheduledTasks)
    );
  });
});
