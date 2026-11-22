import { prisma } from "@/lib/prisma";

import {
  claimPopupSlot,
  getNextPopup,
  popupPlanOf,
  popupSlotOpen,
  recordPopupEvent,
  recordPopupShown,
} from "../popups";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    user: { findUnique: jest.fn() },
    announcement: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    announcementView: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    popupMomentView: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-22T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const db = prisma as unknown as {
  $transaction: jest.Mock;
  $executeRaw: jest.Mock;
  user: { findUnique: jest.Mock };
  announcement: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    findFirst: jest.Mock;
  };
  announcementView: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  popupMomentView: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
  };
};

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "u1",
    createdAt: ago(60 * DAY),
    lastActiveAt: ago(DAY),
    onboardingCompletedAt: ago(59 * DAY),
    subscription: null,
    trialGrant: null,
    userSettings: { productUpdates: true },
    ...over,
  };
}

function announcementRow(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    slug: "whats-new",
    kind: "update",
    status: "published",
    badge: "New",
    title: "What's new",
    body: "Body",
    bullets: [{ icon: "sparkles", text: "A thing" }],
    imageUrl: null,
    primaryCta: { label: "See it", href: "/today" },
    secondaryLabel: "Later",
    priority: 0,
    startsAt: null,
    endsAt: null,
    plans: [],
    platforms: [],
    minAppVersion: null,
    signedUpBefore: null,
    signedUpAfter: null,
    minActiveDays: null,
    createdAt: ago(DAY),
    updatedAt: ago(DAY),
    publishedAt: ago(DAY),
    ...over,
  };
}

const params = (over = {}) => ({
  platform: "web" as const,
  appVersion: "1.0.0",
  limit: null,
  ctx: {},
  ...over,
});

/** A transaction runs its callback against the same mocked client. */
function plainTransactions() {
  db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) =>
    fn(prisma)
  );
  db.popupMomentView.create.mockResolvedValue({ id: "m-new" });
}

beforeEach(() => {
  jest.resetAllMocks();
  plainTransactions();
  db.user.findUnique.mockResolvedValue(userRow());
  db.announcement.findMany.mockResolvedValue([]);
  db.announcementView.findMany.mockResolvedValue([]);
  db.popupMomentView.findMany.mockResolvedValue([]);
});

describe("popupPlanOf", () => {
  it("tells a trial apart from a paid plan", () => {
    const trial = { endsAt: new Date(NOW.getTime() + DAY) };
    expect(popupPlanOf(null, trial, NOW)).toBe("TRIAL");
    expect(popupPlanOf(null, null, NOW)).toBe("FREE");
    expect(popupPlanOf(null, { endsAt: ago(DAY) }, NOW)).toBe("FREE");
    expect(
      popupPlanOf(
        { plan: "PRO", status: "ACTIVE", currentPeriodEnd: null },
        trial,
        NOW
      )
    ).toBe("PRO");
    expect(
      popupPlanOf(
        { plan: "LIFETIME", status: "ACTIVE", currentPeriodEnd: null },
        null,
        NOW
      )
    ).toBe("LIFETIME");
  });
});

describe("getNextPopup: announcements", () => {
  it("returns a published announcement for the person", async () => {
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    const popup = await getNextPopup("u1", params(), NOW);
    expect(popup).toMatchObject({
      id: "a1",
      source: "announcement",
      title: "What's new",
      primary: { label: "See it", href: "/today" },
    });
  });

  it("asks the database only for announcements this person has not seen", async () => {
    await getNextPopup("u1", params(), NOW);
    const where = db.announcement.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("published");
    expect(where.views).toEqual({ none: { userId: "u1" } });
  });

  it("does not show one that history says was shown", async () => {
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    db.announcementView.findMany.mockResolvedValue([
      { announcementId: "a1", shownAt: ago(90 * DAY) },
    ]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
  });

  it("skips an announcement aimed at another plan", async () => {
    db.announcement.findMany.mockResolvedValue([
      announcementRow({ plans: ["PRO", "LIFETIME"] }),
    ]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
  });

  it("skips an announcement for another platform", async () => {
    db.announcement.findMany.mockResolvedValue([
      announcementRow({ platforms: ["ios"] }),
    ]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
    expect(
      await getNextPopup("u1", params({ platform: "ios" }), NOW)
    ).not.toBeNull();
  });

  it("shows nothing when product updates are off", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({ userSettings: { productUpdates: false } })
    );
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
  });

  it("respects the 3-day cap against a popup shown yesterday", async () => {
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    db.popupMomentView.findMany.mockResolvedValue([
      { source: "limit", key: "limit:habits", shownAt: ago(DAY) },
    ]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
  });
});

describe("getNextPopup: plan moments", () => {
  it("shows the limit popup the moment a Free account hits a limit", async () => {
    const popup = await getNextPopup("u1", params({ limit: "habits" }), NOW);
    expect(popup).toMatchObject({
      id: "moment:limit:limit:habits",
      source: "limit",
    });
  });

  it("puts the limit popup ahead of a waiting announcement", async () => {
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    const popup = await getNextPopup("u1", params({ limit: "boards" }), NOW);
    expect(popup?.source).toBe("limit");
  });

  it("shows a limit popup even when product updates are off", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({ userSettings: { productUpdates: false } })
    );
    const popup = await getNextPopup("u1", params({ limit: "habits" }), NOW);
    expect(popup?.source).toBe("limit");
  });

  it("repeats a limit popup no sooner than 7 days", async () => {
    db.popupMomentView.findMany.mockResolvedValue([
      { source: "limit", key: "limit:habits", shownAt: ago(3 * DAY) },
    ]);
    expect(
      await getNextPopup("u1", params({ limit: "habits" }), NOW)
    ).toBeNull();
  });

  it("gives a paid plan no limit popup", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({
        subscription: {
          plan: "PRO",
          status: "ACTIVE",
          currentPeriodEnd: null,
          provider: null,
        },
      })
    );
    expect(
      await getNextPopup("u1", params({ limit: "habits" }), NOW)
    ).toBeNull();
  });

  it("warns 3 days before a trial ends, then 1 day, then when it ended", async () => {
    const on = (msLeft: number) =>
      db.user.findUnique.mockResolvedValue(
        userRow({ trialGrant: { endsAt: new Date(NOW.getTime() + msLeft) } })
      );

    on(3 * DAY - 1000);
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:3d");

    on(DAY - 1000);
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:1d");

    on(-DAY);
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:ended");
  });

  it("shows a trial warning to an account two days old", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({
        createdAt: ago(DAY),
        trialGrant: { endsAt: new Date(NOW.getTime() + DAY - 1000) },
      })
    );
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:1d");
  });

  it("suppresses everything in onboarding, focus, a dialog or a repeat session", async () => {
    for (const ctx of [
      { inOnboarding: true },
      { inFocus: true },
      { dialogOpen: true },
      { shownThisSession: true },
    ]) {
      expect(
        await getNextPopup("u1", params({ limit: "habits", ctx }), NOW)
      ).toBeNull();
    }
  });
});

describe("recordPopupEvent", () => {
  it("records shown once per person for an announcement", async () => {
    db.announcement.findFirst.mockResolvedValue({ id: "a1" });
    expect(await recordPopupEvent("u1", "a1", "shown", NOW)).toBe("ok");
    expect(db.announcementView.upsert).toHaveBeenCalledWith({
      where: { userId_announcementId: { userId: "u1", announcementId: "a1" } },
      create: { userId: "u1", announcementId: "a1", shownAt: NOW, seenAt: NOW },
      update: { seenAt: NOW },
    });
  });

  it("stamps dismiss and click on the same view row", async () => {
    db.announcement.findFirst.mockResolvedValue({ id: "a1" });
    await recordPopupEvent("u1", "a1", "dismiss", NOW);
    await recordPopupEvent("u1", "a1", "click", NOW);
    const updates = db.announcementView.upsert.mock.calls.map(
      (c) => c[0].update
    );
    expect(updates).toEqual([{ dismissedAt: NOW }, { clickedAt: NOW }]);
  });

  it("is not found for an unknown announcement", async () => {
    db.announcement.findFirst.mockResolvedValue(null);
    expect(await recordPopupEvent("u1", "nope", "shown", NOW)).toBe(
      "not_found"
    );
    expect(db.announcementView.upsert).not.toHaveBeenCalled();
  });

  it("writes a moment row on shown, and stamps the latest on dismiss", async () => {
    const id = "moment:limit:limit:habits";
    expect(await recordPopupEvent("u1", id, "shown", NOW)).toBe("ok");
    expect(db.popupMomentView.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        source: "limit",
        key: "limit:habits",
        shownAt: NOW,
      },
      select: { id: true },
    });

    db.popupMomentView.findFirst.mockResolvedValue({ id: "m1" });
    await recordPopupEvent("u1", id, "dismiss", NOW);
    expect(db.popupMomentView.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { dismissedAt: NOW },
    });
  });

  it("refuses a moment key it does not know", async () => {
    expect(
      await recordPopupEvent("u1", "moment:limit:limit:nonsense", "shown", NOW)
    ).toBe("not_found");
    expect(
      await recordPopupEvent("u1", "moment:trial:trial:9d", "shown", NOW)
    ).toBe("not_found");
    expect(db.popupMomentView.create).not.toHaveBeenCalled();
  });
});

describe("popupSlotOpen (the feedback prompt's slot)", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    db.announcementView.findMany.mockResolvedValue([]);
    db.popupMomentView.findMany.mockResolvedValue([]);
  });

  it("is open when nothing was shown lately", async () => {
    db.user.findUnique.mockResolvedValue(userRow());
    await expect(
      popupSlotOpen("u1", "feedback", "week-1", {}, NOW)
    ).resolves.toBe(true);
  });

  it("shares the 3-day cap with announcements", async () => {
    db.user.findUnique.mockResolvedValue(userRow());
    db.announcementView.findMany.mockResolvedValue([
      { announcementId: "a1", shownAt: ago(DAY) },
    ]);
    await expect(
      popupSlotOpen("u1", "feedback", "week-1", {}, NOW)
    ).resolves.toBe(false);
  });

  it("stays shut in the first 2 days after signup", async () => {
    db.user.findUnique.mockResolvedValue(userRow({ createdAt: ago(DAY) }));
    await expect(
      popupSlotOpen("u1", "feedback", "week-1", {}, NOW)
    ).resolves.toBe(false);
  });

  it("stays shut while the browser says another dialog is open", async () => {
    db.user.findUnique.mockResolvedValue(userRow());
    await expect(
      popupSlotOpen("u1", "feedback", "week-1", { dialogOpen: true }, NOW)
    ).resolves.toBe(false);
  });
});

describe("review rulings and fixes", () => {
  it("L7: before onboarding is done, only a trial moment may show", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({ onboardingCompletedAt: null })
    );
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    expect(
      await getNextPopup("u1", params({ limit: "habits" }), NOW)
    ).toBeNull();

    db.user.findUnique.mockResolvedValue(
      userRow({
        onboardingCompletedAt: null,
        trialGrant: { endsAt: new Date(NOW.getTime() + DAY - 1000) },
      })
    );
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:1d");
  });

  it("L6: events are accepted for published announcements only", async () => {
    db.announcement.findFirst.mockResolvedValue(null);
    expect(await recordPopupEvent("u1", "draft-1", "click", NOW)).toBe(
      "not_found"
    );
    expect(db.announcement.findFirst).toHaveBeenCalledWith({
      where: { id: "draft-1", status: "published" },
      select: { id: true },
    });
  });

  it("ruling: a limit hit bypasses the 3-day cap but keeps its 7-day repeat", async () => {
    db.announcementView.findMany.mockResolvedValue([
      { announcementId: "a0", shownAt: ago(DAY) },
    ]);
    expect(
      (await getNextPopup("u1", params({ limit: "habits" }), NOW))?.source
    ).toBe("limit");
  });

  it("ruling: a trial moment bypasses the 3-day cap, each at most once", async () => {
    db.user.findUnique.mockResolvedValue(
      userRow({ trialGrant: { endsAt: new Date(NOW.getTime() + DAY - 1000) } })
    );
    db.announcementView.findMany.mockResolvedValue([
      { announcementId: "a0", shownAt: ago(60 * 60 * 1000) },
    ]);
    expect((await getNextPopup("u1", params(), NOW))?.key).toBe("trial:1d");

    db.popupMomentView.findMany.mockResolvedValue([
      { source: "trial", key: "trial:1d", shownAt: ago(60 * 60 * 1000) },
    ]);
    expect(await getNextPopup("u1", params(), NOW)).toBeNull();
  });

  it("claims the slot on the server: the show is written under the lock", async () => {
    const popup = await getNextPopup("u1", params({ limit: "habits" }), NOW);
    expect(popup?.source).toBe("limit");
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.popupMomentView.create).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        source: "limit",
        key: "limit:habits",
        shownAt: NOW,
      },
      select: { id: true },
    });
  });

  it("recordPopupShown is idempotent per moment", async () => {
    db.popupMomentView.findFirst.mockResolvedValue({ id: "m1" });
    expect(await recordPopupShown("u1", "trial", "trial:3d", NOW)).toEqual({
      id: "m1",
      created: false,
    });
    expect(db.popupMomentView.create).not.toHaveBeenCalled();
    // A limit only counts a show from the last 7 days as the same moment.
    expect(db.popupMomentView.findFirst.mock.calls[0][0].where.shownAt).toBe(
      undefined
    );
    await recordPopupShown("u1", "limit", "limit:habits", NOW);
    expect(
      db.popupMomentView.findFirst.mock.calls[1][0].where.shownAt.gt
    ).toEqual(ago(7 * DAY));
  });

  it("H2: two requests at once get one popup between them", async () => {
    // A small stateful database: the advisory lock serialises transactions,
    // and a written show is visible to the next reader.
    const moments: { source: string; key: string; shownAt: Date }[] = [];
    let queue: Promise<unknown> = Promise.resolve();
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
      const run = queue.then(() => fn(prisma));
      queue = run.catch(() => undefined);
      return run;
    });
    db.popupMomentView.findMany.mockImplementation(async () => [...moments]);
    db.popupMomentView.findFirst.mockImplementation(
      async ({ where }: { where: { source: string; key: string } }) =>
        moments.find((m) => m.source === where.source && m.key === where.key)
          ? { id: "m" }
          : null
    );
    db.popupMomentView.create.mockImplementation(
      async ({
        data,
      }: {
        data: { source: string; key: string; shownAt: Date };
      }) => {
        moments.push(data);
        return { id: `m${moments.length}` };
      }
    );
    db.announcement.findMany.mockResolvedValue([announcementRow()]);
    db.announcementView.findUnique.mockResolvedValue(null);
    db.announcementView.create.mockImplementation(
      async ({ data }: { data: { announcementId: string; shownAt: Date } }) => {
        moments.push({
          source: "announcement",
          key: data.announcementId,
          shownAt: data.shownAt,
        });
        return { id: "v1" };
      }
    );
    db.announcementView.findMany.mockImplementation(async () =>
      moments
        .filter((m) => m.source === "announcement")
        .map((m) => ({ announcementId: m.key, shownAt: m.shownAt }))
    );

    const [a, b] = await Promise.all([
      getNextPopup("u1", params(), NOW),
      getNextPopup("u1", params(), NOW),
    ]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(moments).toHaveLength(1);
  });

  it("claimPopupSlot gives the feedback prompt the slot once, and not inside the cap", async () => {
    expect(
      await claimPopupSlot(prisma as never, "u1", "feedback", "p1", NOW)
    ).toBe(true);
    db.popupMomentView.findMany.mockResolvedValue([
      { source: "limit", key: "limit:habits", shownAt: ago(DAY) },
    ]);
    expect(
      await claimPopupSlot(prisma as never, "u1", "feedback", "p2", NOW)
    ).toBe(false);
  });
});

describe("release: a claimed slot that never reached the screen", () => {
  const MIN = 60 * 1000;

  it("the client's shown marks the claimed moment as seen", async () => {
    db.popupMomentView.findFirst.mockResolvedValue({ id: "m1" });
    await recordPopupEvent("u1", "moment:trial:trial:1d", "shown", NOW);
    expect(db.popupMomentView.create).not.toHaveBeenCalled();
    expect(db.popupMomentView.update).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { seenAt: NOW },
    });
  });

  it("deletes the newest claim only if it is under 10 minutes old and unseen", async () => {
    db.popupMomentView.findFirst.mockResolvedValue({ id: "m1" });
    expect(
      await recordPopupEvent("u1", "moment:trial:trial:1d", "release", NOW)
    ).toBe("ok");
    expect(db.popupMomentView.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "m1",
        seenAt: null,
        shownAt: { gt: new Date(NOW.getTime() - 10 * MIN) },
      },
    });
    expect(db.popupMomentView.update).not.toHaveBeenCalled();
  });

  it("does nothing when there is no claim to release", async () => {
    db.popupMomentView.findFirst.mockResolvedValue(null);
    await recordPopupEvent("u1", "moment:limit:limit:habits", "release", NOW);
    expect(db.popupMomentView.deleteMany).not.toHaveBeenCalled();
  });

  it("releases an announcement view only when unseen and fresh", async () => {
    db.announcement.findFirst.mockResolvedValue({ id: "a1" });
    await recordPopupEvent("u1", "a1", "release", NOW);
    expect(db.announcementView.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        announcementId: "a1",
        seenAt: null,
        shownAt: { gt: new Date(NOW.getTime() - 10 * MIN) },
      },
    });
    expect(db.announcementView.upsert).not.toHaveBeenCalled();
  });

  it("marks an announcement seen on the client's shown", async () => {
    db.announcement.findFirst.mockResolvedValue({ id: "a1" });
    await recordPopupEvent("u1", "a1", "shown", NOW);
    expect(db.announcementView.upsert).toHaveBeenCalledWith({
      where: { userId_announcementId: { userId: "u1", announcementId: "a1" } },
      create: { userId: "u1", announcementId: "a1", shownAt: NOW, seenAt: NOW },
      update: { seenAt: NOW },
    });
  });
});
