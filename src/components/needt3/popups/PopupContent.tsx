"use client";

import type { PopupBullet, PopupView } from "@/lib/popups/types";

import type { GlyphName } from "../glyphs/Glyph";
import { UpsellPopup } from "./UpsellPopup";
import {
  type AnnouncementKind,
  type WhatsNewItem,
  WhatsNewPopup,
} from "./WhatsNewPopup";
import { limitCards, trialCards } from "./copy";

/** The in-app icon a bullet names, as the glyph the popup style draws. */
const BULLET_GLYPH: Record<PopupBullet["icon"], GlyphName> = {
  check: "tasks",
  calendar: "calendar",
  sparkles: "spark",
  clock: "clock",
  zap: "focus",
  repeat: "habits",
  layers: "stack",
  bell: "bell",
  target: "projects",
  gift: "gift",
};

/** The mark in the middle of an announcement's picture, one per kind. */
const KIND_GLYPH: Record<AnnouncementKind, GlyphName> = {
  update: "spark",
  tip: "help",
  event: "event",
  offer: "gift",
};

const ANNOUNCEMENT_KINDS: readonly string[] = [
  "update",
  "tip",
  "event",
  "offer",
];

function announcementKind(kind: PopupView["kind"]): AnnouncementKind {
  return ANNOUNCEMENT_KINDS.includes(kind)
    ? (kind as AnnouncementKind)
    : "update";
}

/** The same id always gets the same horizon, so two announcements differ. */
function variantFor(id: string): 0 | 1 | 2 {
  let sum = 0;
  for (let i = 0; i < id.length; i += 1) sum += id.charCodeAt(i);
  return (sum % 3) as 0 | 1 | 2;
}

function trialDaysLeft(key: string): number {
  if (key === "trial:3d") return 3;
  if (key === "trial:1d") return 1;
  return 0;
}

export type PlanPick = "annual" | "lifetime";

export interface PopupContentProps {
  popup: PopupView;
  open: boolean;
  /** A store build states the limit and points nowhere: no plan cards, no paywall buttons. */
  store: boolean;
  /** Lifetime seats remain; unknown counts as open. */
  lifetimeOpen: boolean;
  /** Free and able to start the trial (the paywall's "Start trial" works). */
  trialEligible: boolean;
  student: boolean;
  onDismiss: () => void;
  onPrimary: () => void;
  /** A plan card was chosen: the host closes the popup and opens the paywall on it. */
  onPlans: (pick: PlanPick) => void;
}

/**
 * Maps what the server sent (`PopupView`) onto the styled popups: an
 * announcement is `WhatsNewPopup` (kind, badge, title, body, up to three
 * marked items, an image or the texture, the two buttons); a limit or a
 * trial moment is `UpsellPopup` with its two cards. Desktop or phone is the
 * popup shell's call, not this one's. A store build has no plans to point at,
 * so its moments are drawn as plain text with one button.
 */
export function PopupContent({
  popup,
  open,
  store,
  lifetimeOpen,
  trialEligible,
  student,
  onDismiss,
  onPrimary,
  onPlans,
}: PopupContentProps) {
  const moment = popup.source === "limit" || popup.source === "trial";

  if (moment && !store) {
    if (popup.source === "trial") {
      const trial = trialCards({
        daysLeft: trialDaysLeft(popup.key),
        ended: popup.key === "trial:ended",
        onKeep: () => onPlans("annual"),
        onStayFree: onDismiss,
        student,
      });
      return (
        <UpsellPopup
          open={open}
          onClose={onDismiss}
          title={trial.title}
          body={trial.body}
          cards={trial.cards}
        />
      );
    }
    // The server owns the title and the body of a limit (the numbers come
    // from the plan table); only the two cards are the stock ones.
    const limit = limitCards({
      limit: "",
      canTrial: trialEligible,
      onTrial: () => onPlans("annual"),
      onPlans: () => onPlans("annual"),
      onLifetime: () => onPlans("lifetime"),
      student,
    });
    const [first, second] = limit.cards;
    return (
      <UpsellPopup
        open={open}
        onClose={onDismiss}
        title={popup.title}
        body={popup.body}
        cards={lifetimeOpen ? [first, second] : [first]}
        dismissLabel={popup.secondary ?? "Not now"}
      />
    );
  }

  const kind = moment ? "update" : announcementKind(popup.kind);
  const opensPaywall = popup.primary?.action === "paywall";
  const primary =
    popup.primary && !(store && opensPaywall) ? popup.primary : null;
  const items: WhatsNewItem[] = popup.bullets.map((b) => ({
    glyph: BULLET_GLYPH[b.icon],
    text: b.text,
  }));
  return (
    <WhatsNewPopup
      open={open}
      onClose={onDismiss}
      kind={kind}
      badge={popup.badge ?? undefined}
      title={popup.title}
      body={popup.body || undefined}
      items={items}
      primary={
        primary ? { label: primary.label, onClick: onPrimary } : undefined
      }
      secondaryLabel={popup.secondary ?? undefined}
      onSecondary={onDismiss}
      art={{
        glyph: moment ? "spark" : KIND_GLYPH[kind],
        variant: variantFor(popup.id),
        ...(moment ? { hue: "var(--hue-blue)" } : null),
      }}
      artNode={
        popup.imageUrl ? (
          <div className="pp-art-shot">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={popup.imageUrl} alt="" />
          </div>
        ) : undefined
      }
    />
  );
}
