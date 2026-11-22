import {
  type Announcement,
  AnnouncementStatus,
  Prisma,
  SubscriptionPlan,
} from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { effectiveSubscriptionPlan } from "@/lib/entitlements";
import { matchesAudience } from "@/lib/popups/audience";
import { limitMoment, trialMoments } from "@/lib/popups/moments";
import { isPopupLimit } from "@/lib/popups/moments";
import { pickPopup } from "@/lib/popups/pick";
import { LIMIT_REPEAT_MS } from "@/lib/popups/pick";
import {
  type PopupEventName,
  announcementCreateSchema,
} from "@/lib/popups/schema";
import {
  type PopupBullet,
  type PopupCandidate,
  type PopupContext,
  type PopupCta,
  type PopupHistoryEntry,
  type PopupLimit,
  type PopupPlan,
  type PopupPlatform,
  type PopupSource,
  type PopupUser,
  type PopupView,
  momentId,
  parseMomentId,
} from "@/lib/popups/types";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The newest history rows read for the cap and once-per-limit rules. */
const HISTORY_DAYS = 30;

const bulletsSchema = announcementCreateSchema.shape.bullets;
const ctaSchema = announcementCreateSchema.shape.primaryCta;

/** What the person is on right now, with a trial told apart from a paid plan. */
export function popupPlanOf(
  subscription: Parameters<typeof effectiveSubscriptionPlan>[0],
  trial: { endsAt: Date } | null,
  now: Date
): PopupPlan {
  const paid = effectiveSubscriptionPlan(subscription, null, now);
  if (paid === SubscriptionPlan.LIFETIME) return "LIFETIME";
  if (paid === SubscriptionPlan.PRO) return "PRO";
  const withTrial = effectiveSubscriptionPlan(subscription, trial, now);
  return withTrial === SubscriptionPlan.FREE ? "FREE" : "TRIAL";
}

export interface PopupFacts {
  user: PopupUser;
  trialEndsAt: Date | null;
  /** Days between signing up and the last time the app was used. */
  activeDays: number;
  /** Onboarding finished. Until then only a trial moment may show. */
  onboardingDone: boolean;
}

/** The tables the shared popup history lives in: the client, or a transaction. */
type HistoryDb = Pick<
  Prisma.TransactionClient,
  "announcementView" | "popupMomentView"
>;

export async function loadPopupFacts(
  userId: string,
  now: Date
): Promise<PopupFacts | null> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      lastActiveAt: true,
      onboardingCompletedAt: true,
      subscription: {
        select: {
          plan: true,
          status: true,
          currentPeriodEnd: true,
          provider: true,
        },
      },
      trialGrant: { select: { endsAt: true } },
      userSettings: { select: { productUpdates: true } },
    },
  });
  if (!row) return null;
  // Accounts from before createdAt was recorded count as long-standing.
  const signedUpAt = row.createdAt ?? newDate(0);
  const lastActive = row.lastActiveAt ?? signedUpAt;
  return {
    user: {
      id: row.id,
      plan: popupPlanOf(row.subscription, row.trialGrant, now),
      signedUpAt,
      productUpdates: row.userSettings?.productUpdates ?? true,
    },
    trialEndsAt: row.trialGrant?.endsAt ?? null,
    onboardingDone: row.onboardingCompletedAt !== null,
    activeDays: Math.max(
      0,
      Math.floor((lastActive.getTime() - signedUpAt.getTime()) / DAY_MS)
    ),
  };
}

/**
 * Every popup shown to this person, whatever its source. Announcement views
 * and trial milestones are once-ever, so they are read in full (a handful of
 * rows); other moments only matter inside the history window.
 */
export async function loadPopupHistory(
  userId: string,
  now: Date,
  db: HistoryDb = prisma
): Promise<PopupHistoryEntry[]> {
  const since = newDate(now.getTime() - HISTORY_DAYS * DAY_MS);
  const [announcements, moments] = await Promise.all([
    db.announcementView.findMany({
      where: { userId },
      select: { announcementId: true, shownAt: true },
    }),
    db.popupMomentView.findMany({
      where: {
        userId,
        OR: [{ shownAt: { gte: since } }, { source: "trial" }],
      },
      select: { source: true, key: true, shownAt: true },
    }),
  ]);
  return [
    ...announcements.map(
      (v): PopupHistoryEntry => ({
        source: "announcement",
        key: v.announcementId,
        shownAt: v.shownAt,
      })
    ),
    ...moments.map(
      (v): PopupHistoryEntry => ({
        source: v.source as PopupSource,
        key: v.key,
        shownAt: v.shownAt,
      })
    ),
  ];
}

function parseBullets(value: Prisma.JsonValue): PopupBullet[] {
  const parsed = bulletsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function parseCta(value: Prisma.JsonValue | null): PopupCta | null {
  if (value === null) return null;
  const parsed = ctaSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** What the host draws for one announcement. */
export function announcementView(row: Announcement): PopupView {
  return {
    id: row.id,
    source: "announcement",
    key: row.id,
    kind: row.kind,
    badge: row.badge,
    title: row.title,
    body: row.body,
    bullets: parseBullets(row.bullets),
    imageUrl: row.imageUrl,
    primary: parseCta(row.primaryCta),
    secondary: row.secondaryLabel,
    cards: [],
    feature: null,
  };
}

/** Published, inside its window, not yet shown to this person, and for them. */
async function announcementCandidates(
  facts: PopupFacts,
  platform: PopupPlatform,
  appVersion: string | null,
  now: Date
): Promise<PopupCandidate[]> {
  const rows = await prisma.announcement.findMany({
    where: {
      status: AnnouncementStatus.published,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
      views: { none: { userId: facts.user.id } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    take: 50,
  });
  return rows
    .filter((row) =>
      matchesAudience(row, {
        plan: facts.user.plan,
        platform,
        appVersion,
        signedUpAt: facts.user.signedUpAt,
        activeDays: facts.activeDays,
      })
    )
    .map((row) => ({
      source: "announcement" as const,
      key: row.id,
      priority: row.priority,
      view: announcementView(row),
    }));
}

export interface NextPopupParams {
  platform: PopupPlatform;
  appVersion: string | null;
  /** Set when a limit has just blocked an action. */
  limit: PopupLimit | null;
  ctx: PopupContext;
}

/** The advisory lock every popup source takes before it claims the slot. */
export function popupSlotLockSql(userId: string): Prisma.Sql {
  return Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`popup-slot:${userId}`}, 0))`;
}

/**
 * Inside `tx`, which already holds `popupSlotLockSql`: writes the show of the
 * winner so the next request (another tab, another device) sees it. Returns
 * false when this person already has that show (an announcement is once ever).
 */
async function writeShow(
  tx: Prisma.TransactionClient,
  userId: string,
  winner: PopupCandidate,
  now: Date
): Promise<boolean> {
  if (winner.source === "announcement") {
    const existing = await tx.announcementView.findUnique({
      where: {
        userId_announcementId: { userId, announcementId: winner.key },
      },
      select: { id: true },
    });
    if (existing) return false;
    await tx.announcementView.create({
      data: { userId, announcementId: winner.key, shownAt: now },
    });
    return true;
  }
  return (await recordPopupShown(userId, winner.source, winner.key, now, tx))
    .created;
}

/**
 * The popup to show this person now, or null. Claims the slot on the server:
 * the pick and the write of the show happen in one transaction under a
 * per-person advisory lock, so two tabs or two devices asking at once get
 * one popup between them, not two. The later `shown` event is idempotent.
 */
export async function getNextPopup(
  userId: string,
  params: NextPopupParams,
  now: Date = newDate()
): Promise<PopupView | null> {
  const facts = await loadPopupFacts(userId, now);
  if (!facts) return null;

  const candidates: PopupCandidate[] = [
    ...trialMoments(facts.user.plan, facts.trialEndsAt, now),
  ];
  // Until onboarding is done, only a trial moment may show (review L7).
  if (facts.onboardingDone) {
    if (params.limit) {
      const moment = limitMoment(params.limit, facts.user.plan);
      if (moment) candidates.push(moment);
    }
    if (facts.user.productUpdates) {
      candidates.push(
        ...(await announcementCandidates(
          facts,
          params.platform,
          params.appVersion,
          now
        ))
      );
    }
  }
  if (candidates.length === 0) return null;

  // A cheap look first, without the lock: most requests end here.
  const outside = await loadPopupHistory(userId, now);
  if (!pickPopup(facts.user, candidates, outside, now, params.ctx)) {
    return null;
  }

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw(popupSlotLockSql(userId));
    // Re-read inside the lock: another request may have claimed the slot.
    const history = await loadPopupHistory(userId, now, tx);
    const winner = pickPopup(facts.user, candidates, history, now, params.ctx);
    if (!winner) return null;
    return (await writeShow(tx, userId, winner, now)) ? winner.view : null;
  });
}

/** The moment keys the event endpoint accepts for each source. */
function momentKeyValid(source: PopupSource, key: string): boolean {
  if (source === "limit") {
    return key.startsWith("limit:") && isPopupLimit(key.slice("limit:".length));
  }
  if (source === "trial") {
    return key === "trial:3d" || key === "trial:1d" || key === "trial:ended";
  }
  return /^[a-z0-9:_-]{1,64}$/.test(key);
}

/**
 * How far back a show of the same moment makes a new show a repeat. A limit
 * may come back after 7 days; a trial moment and a feedback prompt (keyed by
 * its own id) are once ever.
 */
function repeatSince(source: PopupSource, now: Date): Date | null {
  return source === "limit" ? newDate(now.getTime() - LIMIT_REPEAT_MS) : null;
}

/**
 * Writes one show to the shared history, once per moment: a second call for
 * the same moment (the client's `shown` after the server already claimed it,
 * a retry, another tab) writes nothing. The feedback prompt's show goes
 * through here (`source: "feedback"`) so it counts against the same cap.
 */
export async function recordPopupShown(
  userId: string,
  source: PopupSource,
  key: string,
  now: Date = newDate(),
  db: Pick<Prisma.TransactionClient, "popupMomentView"> = prisma
): Promise<{ id: string; created: boolean }> {
  const since = repeatSince(source, now);
  const existing = await db.popupMomentView.findFirst({
    where: {
      userId,
      source,
      key,
      ...(since ? { shownAt: { gt: since } } : {}),
    },
    orderBy: { shownAt: "desc" },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };
  const row = await db.popupMomentView.create({
    data: { userId, source, key, shownAt: now },
    select: { id: true },
  });
  return { id: row.id, created: true };
}

export type RecordEventResult = "ok" | "not_found";

/** Applies a `shown`, `dismiss` or `click` event for one popup the person was shown. */
export async function recordPopupEvent(
  userId: string,
  id: string,
  event: PopupEventName,
  now: Date = newDate()
): Promise<RecordEventResult> {
  const moment = parseMomentId(id);
  if (moment) {
    if (!momentKeyValid(moment.source, moment.key)) return "not_found";
    if (event === "shown") {
      await recordPopupShown(userId, moment.source, moment.key, now);
      return "ok";
    }
    const latest = await prisma.popupMomentView.findFirst({
      where: { userId, source: moment.source, key: moment.key },
      orderBy: { shownAt: "desc" },
      select: { id: true },
    });
    const stamp = event === "click" ? { clickedAt: now } : { dismissedAt: now };
    if (latest) {
      await prisma.popupMomentView.update({
        where: { id: latest.id },
        data: stamp,
      });
    } else {
      await prisma.popupMomentView.create({
        data: { userId, source: moment.source, key: moment.key, ...stamp },
      });
    }
    return "ok";
  }

  // Only a published announcement can have been shown (review L6).
  const exists = await prisma.announcement.findFirst({
    where: { id, status: AnnouncementStatus.published },
    select: { id: true },
  });
  if (!exists) return "not_found";
  const stamp =
    event === "click"
      ? { clickedAt: now }
      : event === "dismiss"
        ? { dismissedAt: now }
        : {};
  await prisma.announcementView.upsert({
    where: { userId_announcementId: { userId, announcementId: id } },
    create: { userId, announcementId: id, shownAt: now, ...stamp },
    update: stamp,
  });
  return "ok";
}

function slotCandidate(
  source: Extract<PopupSource, "feedback">,
  key: string
): PopupCandidate {
  return {
    source,
    key,
    priority: 0,
    view: {
      id: momentId(source, key),
      source,
      key,
      kind: "update",
      badge: null,
      title: "",
      body: "",
      bullets: [],
      imageUrl: null,
      primary: null,
      secondary: null,
      cards: [],
      feature: null,
    },
  };
}

/**
 * For the feedback prompt (and any later popup source): may a popup from
 * `source` show to this person now under the shared rules (3-day cap, quiet
 * first days, not during onboarding)? A read without the lock, for a cheap
 * early "no". To actually show, claim with `claimPopupSlot` inside the
 * caller's transaction. The browser half is `usePopupSlot`.
 */
export async function popupSlotOpen(
  userId: string,
  source: Extract<PopupSource, "feedback">,
  key: string,
  ctx: PopupContext = {},
  now: Date = newDate()
): Promise<boolean> {
  const facts = await loadPopupFacts(userId, now);
  if (!facts || !facts.onboardingDone) return false;
  const history = await loadPopupHistory(userId, now);
  return (
    pickPopup(facts.user, [slotCandidate(source, key)], history, now, ctx) !==
    null
  );
}

/**
 * Claims the shared popup slot for `source`/`key` inside `tx`: takes the
 * per-person popup lock, re-checks the rules against the history as `tx`
 * sees it, and writes the show. True when this caller won the slot; then the
 * popup may show. The feedback prompt calls it in the same transaction that
 * creates its own row, so a lost race creates neither.
 */
export async function claimPopupSlot(
  tx: Prisma.TransactionClient,
  userId: string,
  source: Extract<PopupSource, "feedback">,
  key: string,
  now: Date = newDate()
): Promise<boolean> {
  await tx.$executeRaw(popupSlotLockSql(userId));
  const facts = await loadPopupFacts(userId, now);
  if (!facts || !facts.onboardingDone) return false;
  const history = await loadPopupHistory(userId, now, tx);
  const winner = pickPopup(
    facts.user,
    [slotCandidate(source, key)],
    history,
    now
  );
  if (!winner) return false;
  return (await recordPopupShown(userId, source, key, now, tx)).created;
}
