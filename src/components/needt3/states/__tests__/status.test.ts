import { newDate } from "@/lib/date-utils";
import type { V3Plan } from "@/lib/needt3/hooks/plan";

import { type ScreenQuery, accountState, screenState } from "../status";

const pending: ScreenQuery = {
  status: "pending",
  fetchStatus: "fetching",
  data: undefined,
  error: null,
  refetch: jest.fn(),
};

describe("account notices from retained billing history", () => {
  const now = newDate("2026-10-10T12:00:00Z").getTime();
  const plan = {
    kind: "free",
    trialEndsAt: null,
    trialDaysLeft: null,
    paymentFailed: false,
  } as V3Plan;
  it("does not label a never-trial free account as expired", () => {
    expect(accountState(plan, now)).toBe("none");
    expect(accountState(undefined, now)).toBe("none");
  });
  it("uses retained expiry only for free accounts", () => {
    expect(
      accountState({ ...plan, trialEndsAt: "2026-10-09T12:00:00Z" }, now)
    ).toBe("trial-ended");
    expect(
      accountState(
        { ...plan, kind: "monthly", trialEndsAt: "2026-10-09T12:00:00Z" },
        now
      )
    ).toBe("none");
  });
  it("prefers failed payment over an ending trial", () => {
    expect(
      accountState(
        { ...plan, kind: "trial", trialDaysLeft: 2, paymentFailed: true },
        now
      )
    ).toBe("payment-failed");
    expect(
      accountState({ ...plan, kind: "trial", trialDaysLeft: 2 }, now)
    ).toBe("trial-ending");
  });
});

describe("v3 query screen state", () => {
  it("shows loading only for the first request", () => {
    expect(screenState(pending)).toBe("loading");
    expect(screenState({ ...pending, data: [] })).toBe("content");
  });
  it("keeps cached content during a failed background refresh", () => {
    expect(
      screenState({
        ...pending,
        status: "error",
        data: [],
        error: { status: 500 },
      })
    ).toBe("content");
  });
  it("hides cached private content after access is revoked", () => {
    expect(
      screenState({
        ...pending,
        status: "error",
        data: [{ private: true }],
        error: { status: 403 },
      })
    ).toBe("no-access");
  });
  it("shows retry for a real initial error", () => {
    expect(
      screenState({
        ...pending,
        status: "error",
        fetchStatus: "idle",
        error: new Error("failed"),
      })
    ).toBe("error");
  });
  it("shows offline instead of an endless skeleton for paused initial fetch", () => {
    expect(screenState({ ...pending, fetchStatus: "paused" })).toBe("offline");
    expect(screenState({ ...pending, fetchStatus: "paused", data: [] })).toBe(
      "content"
    );
  });
});
