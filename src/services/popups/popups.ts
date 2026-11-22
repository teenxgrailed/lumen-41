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
}

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
  now: Date
): Promise<PopupHistoryEntry[]> {
  const since = newDate(now.getTime() - HISTORY_DAYS * DAY_MS);
  const [announcements, moments] = await Promise.all([
    prisma.announcementView.findMany({
      where: { userId },
      select: { announcementId: true, shownAt: true },
    }),
    prisma.popupMomentView.findMany({
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

/** The popup to show this person now, or null. Read-only: `shown` is recorded by the event call. */
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
  if (params.limit) {
    const moment = limitMoment(params.limit, facts.user.plan);
    if (moment) candidates.push(moment);
  }
  // A limit hit is shown at once and does not wait on announcements.
  if (facts.user.productUpdates || candidates.length === 0) {
    candidates.push(
      ...(await announcementCandidates(
        facts,
        params.platform,
        params.appVersion,
        now
      ))
    );
  }

  const history = await loadPopupHistory(userId, now);
  return (
    pickPopup(facts.user, candidates, history, now, params.ctx)?.view ?? null
  );
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
 * Writes one row to the shared history. The feedback prompt calls this when
 * it shows (`source: "feedback"`), so its show counts against the same cap.
 */
export async function recordPopupShown(
  userId: string,
  source: PopupSource,
  key: string,
  now: Date = newDate()
) {
  return prisma.popupMomentView.create({
    data: { userId, source, key, shownAt: now },
    select: { id: true },
  });
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

  const exists = await prisma.announcement.findUnique({
    where: { id },
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

/**
 * For the feedback prompt (and any later popup source): may a popup from
 * `source` show to this person now under the shared rules (3-day cap, quiet
 * first days, not after the same key)? Server-side; the browser half is
 * `usePopupSlot` in `src/components/needt3/popups/use-popup-slot.ts`.
 * When it shows, record it with `recordPopupShown(userId, source, key)`.
 */
export async function popupSlotOpen(
  userId: string,
  source: Extract<PopupSource, "feedback">,
  key: string,
  ctx: PopupContext = {},
  now: Date = newDate()
): Promise<boolean> {
  const facts = await loadPopupFacts(userId, now);
  if (!facts) return false;
  const history = await loadPopupHistory(userId, now);
  const candidate: PopupCandidate = {
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
  return pickPopup(facts.user, [candidate], history, now, ctx) !== null;
}
