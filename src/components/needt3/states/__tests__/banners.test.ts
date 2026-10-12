import { newDate } from "@/lib/date-utils";
import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { bannerSpecs, errorText, lockRules, offlineCount } from "../status";

const now = newDate("2026-10-10T12:00:00Z").getTime();
const base = {
  kind: "monthly",
  trialEndsAt: null,
  trialDaysLeft: null,
  paymentFailed: false,
} as V3Plan;
const withAi = (exhausted: boolean) =>
  ({
    ...base,
    usage: {
      aiActions: {
        plan: "PRO",
        allowed: !exhausted,
        slowMode: false,
        exhausted,
      },
    },
  }) as V3Plan;
const ended = {
  ...base,
  kind: "free",
  trialEndsAt: "2026-10-09T00:00:00Z",
} as V3Plan;

describe("banner selection", () => {
  it("shows nothing for a healthy paid plan or before the plan loads", () => {
    expect(bannerSpecs(base, "today", now)).toEqual([]);
    expect(bannerSpecs(undefined, "today", now)).toEqual([]);
  });

  it("orders payment, AI, trial like the prototype", () => {
    const failed = { ...withAi(true), paymentFailed: true } as V3Plan;
    expect(bannerSpecs(failed, "today", now).map((b) => b.id)).toEqual([
      "payment",
      "ai",
    ]);
    const endedAi = {
      ...withAi(true),
      kind: "free",
      trialEndsAt: ended.trialEndsAt,
    } as V3Plan;
    expect(bannerSpecs(endedAi, "today", now).map((b) => b.id)).toEqual([
      "ai",
      "trial",
    ]);
  });

  it("marks failed payment as attention with Update payment", () => {
    const [spec] = bannerSpecs({ ...base, paymentFailed: true }, "tasks", now);
    expect(spec).toMatchObject({
      id: "payment",
      tone: "attention",
      action: { kind: "update-payment" },
    });
    // No invented charge date or grace period.
    expect(spec.body).toBeUndefined();
  });

  it("derives trial-ended from the retained trialEndsAt", () => {
    expect(bannerSpecs(ended, "tasks", now)[0]).toMatchObject({
      id: "trial",
      icon: "lock",
      action: { kind: "see-plans" },
    });
    const future = { ...ended, trialEndsAt: "2026-10-20T00:00:00Z" };
    expect(bannerSpecs(future, "tasks", now)).toEqual([]);
    const neverTrial = { ...ended, trialEndsAt: null };
    expect(bannerSpecs(neverTrial, "tasks", now)).toEqual([]);
  });

  it("counts trial days left in the title", () => {
    const trial = { ...base, kind: "trial", trialDaysLeft: 1 } as V3Plan;
    expect(bannerSpecs(trial, "tasks", now)[0].title).toBe(
      "Pro trial ends in 1 day"
    );
    expect(
      bannerSpecs({ ...trial, trialDaysLeft: 3 }, "tasks", now)[0].title
    ).toBe("Pro trial ends in 3 days");
    expect(bannerSpecs({ ...trial, trialDaysLeft: 9 }, "tasks", now)).toEqual(
      []
    );
  });

  it("shows the AI limit only on Home and only when usage says exhausted", () => {
    expect(bannerSpecs(withAi(true), "today", now).map((b) => b.id)).toEqual([
      "ai",
    ]);
    expect(bannerSpecs(withAi(true), "tasks", now)).toEqual([]);
    expect(bannerSpecs(withAi(false), "today", now)).toEqual([]);
    // No fake reset time.
    expect(bannerSpecs(withAi(true), "today", now)[0].title).not.toMatch(
      /\d{1,2}:\d{2}/
    );
  });
});

describe("locks", () => {
  it("locks Pro controls after the trial and AI planning when paused", () => {
    expect(lockRules(ended, now).map(([selector]) => selector)).toEqual([
      "[data-agent-plan]",
      "[data-dc-style] button",
      "[data-cn-connect]",
    ]);
    expect(lockRules(withAi(true), now).map(([selector]) => selector)).toEqual([
      "[data-agent-plan]",
    ]);
    expect(lockRules(base, now)).toEqual([]);
  });
});

describe("offline queue scope filter", () => {
  const mine = "2:user:ws-a";
  const msg = (scopeKey: unknown, count: unknown = 2) => ({
    type: "NEEDT_OFFLINE_STATE",
    state: "pending",
    scopeKey,
    count,
  });

  it("accepts this tab's scope and the all-scopes null", () => {
    expect(offlineCount(msg(mine), mine)).toBe(2);
    expect(offlineCount(msg(null, 0), mine)).toBe(0);
    expect(offlineCount(msg(null, 0), null)).toBe(0);
  });

  it("ignores other scopes, a missing scope and other messages", () => {
    expect(offlineCount(msg("2:user:ws-b"), mine)).toBeUndefined();
    expect(offlineCount(msg(undefined), mine)).toBeUndefined();
    expect(offlineCount(msg(mine), null)).toBeUndefined();
    expect(
      offlineCount({ type: "OTHER", scopeKey: mine, count: 1 }, mine)
    ).toBeUndefined();
    expect(offlineCount(null, mine)).toBeUndefined();
  });

  it("rejects invalid counts", () => {
    expect(offlineCount(msg(mine, -1), mine)).toBeUndefined();
    expect(offlineCount(msg(mine, 1.5), mine)).toBeUndefined();
    expect(offlineCount(msg(mine, "x"), mine)).toBeUndefined();
  });
});

describe("error text", () => {
  it("names the screen and the provider like the prototype", () => {
    expect(errorText("tasks")).toBe(
      "Couldn't load your tasks — the server didn't answer."
    );
    expect(errorText("calendar")).toContain("Google Calendar");
    expect(errorText()).toBe("Couldn't load this — the server didn't answer.");
  });
});
