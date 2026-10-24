import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  type OnboardingSnapshot,
  decideTodayGuard,
  isOnboardingPending,
  markOnboardingComplete,
  onboardingEntryPath,
  readOnboardingSnapshot,
  resolveOnboardingTarget,
  todayOnboardingGuard,
} from "@/lib/onboarding/entry";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    task: { findFirst: jest.fn() },
    habit: { findFirst: jest.fn() },
    project: { findFirst: jest.fn() },
    calendarFeed: { findFirst: jest.fn() },
  },
}));

const fresh: OnboardingSnapshot = {
  completedAt: null,
  prefsOnboarded: false,
  hasData: false,
};

beforeEach(() => {
  jest.resetAllMocks();
});

describe("onboardingEntryPath", () => {
  it("is /start when onboarding_v3 is on for the user", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    await expect(onboardingEntryPath("u1")).resolves.toBe("/start");
    expect(isFeatureEnabled).toHaveBeenCalledWith("onboarding_v3", "u1");
  });

  it("is /setup when the flag is off (no row means off)", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    await expect(onboardingEntryPath("u1")).resolves.toBe("/setup");
  });
});

describe("resolveOnboardingTarget", () => {
  it("uses the flag's flow by default", () => {
    expect(resolveOnboardingTarget("/setup", null)).toBe("/setup");
    expect(resolveOnboardingTarget("/start", "/calendar")).toBe("/start");
  });

  it("returns an OAuth sign-up begun in /start to /start", () => {
    expect(
      resolveOnboardingTarget("/setup", "/start?step=verify&acct=google")
    ).toBe("/start?step=verify&acct=google");
    expect(resolveOnboardingTarget("/setup", "/starting")).toBe("/setup");
  });
});

describe("markOnboardingComplete", () => {
  it("only stamps an account that has no completion yet", async () => {
    await markOnboardingComplete("u1");
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u1", onboardingCompletedAt: null },
      data: { onboardingCompletedAt: expect.any(Date) },
    });
  });
});

describe("isOnboardingPending", () => {
  it("is pending only with no completion, no prefs marker and no data", () => {
    expect(isOnboardingPending(fresh)).toBe(true);
    expect(isOnboardingPending({ ...fresh, completedAt: new Date() })).toBe(
      false
    );
    expect(isOnboardingPending({ ...fresh, prefsOnboarded: true })).toBe(false);
    expect(isOnboardingPending({ ...fresh, hasData: true })).toBe(false);
  });
});

describe("readOnboardingSnapshot", () => {
  it("counts the /setup prefs marker as finished without reading data", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      onboardingCompletedAt: null,
      userSettings: { prefs: { onboarded: true } },
    } as never);
    const s = await readOnboardingSnapshot("u1");
    expect(s?.prefsOnboarded).toBe(true);
    expect(prisma.task.findFirst).not.toHaveBeenCalled();
  });

  it("sees a real task as data, ignoring sample rows", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      onboardingCompletedAt: null,
      userSettings: { prefs: {} },
    } as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue({ id: "t" } as never);
    const s = await readOnboardingSnapshot("u1");
    expect(s).toEqual({
      completedAt: null,
      prefsOnboarded: false,
      hasData: true,
    });
    expect(prisma.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "u1", isSample: false } })
    );
  });

  it("is null for an account that does not exist", async () => {
    jest.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(readOnboardingSnapshot("gone")).resolves.toBeNull();
  });
});

describe("decideTodayGuard", () => {
  const base = {
    flagOn: true,
    snapshot: fresh,
    resumed: false,
    dismissed: false,
  };

  it("redirects once into the resolver", () => {
    expect(decideTodayGuard(base)).toEqual({
      kind: "redirect",
      to: "/api/onboarding/resume?from=today",
    });
  });

  it("shows the banner instead of redirecting a second time", () => {
    expect(decideTodayGuard({ ...base, resumed: true })).toEqual({
      kind: "banner",
      href: "/start",
    });
  });

  it("stays quiet once the banner is closed", () => {
    expect(
      decideTodayGuard({ ...base, resumed: true, dismissed: true })
    ).toEqual({ kind: "none" });
  });

  it("leaves finished people, people with data and flag-off people alone", () => {
    expect(
      decideTodayGuard({ ...base, snapshot: { ...fresh, hasData: true } })
    ).toEqual({ kind: "none" });
    expect(
      decideTodayGuard({
        ...base,
        snapshot: { ...fresh, completedAt: new Date() },
      })
    ).toEqual({ kind: "none" });
    expect(decideTodayGuard({ ...base, flagOn: false })).toEqual({
      kind: "none",
    });
    expect(decideTodayGuard({ ...base, snapshot: null })).toEqual({
      kind: "none",
    });
  });
});

describe("todayOnboardingGuard", () => {
  it("reads nothing about the account while the flag is off", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(false);
    await expect(
      todayOnboardingGuard("u1", { resumed: false, dismissed: false })
    ).resolves.toEqual({ kind: "none" });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("redirects a fresh account the flag is on for", async () => {
    jest.mocked(isFeatureEnabled).mockResolvedValue(true);
    jest.mocked(prisma.user.findUnique).mockResolvedValue({
      onboardingCompletedAt: null,
      userSettings: null,
    } as never);
    await expect(
      todayOnboardingGuard("u1", { resumed: false, dismissed: false })
    ).resolves.toEqual({
      kind: "redirect",
      to: "/api/onboarding/resume?from=today",
    });
  });
});
