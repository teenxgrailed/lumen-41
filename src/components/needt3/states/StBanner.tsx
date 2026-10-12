"use client";

import type { ReactNode } from "react";

import { FiClock, FiCreditCard, FiLock, FiStar, FiX } from "react-icons/fi";

import { newDate } from "@/lib/date-utils";
import { usePlan } from "@/lib/needt3/hooks/plan";

import strings from "../../../../docs/port/prototype/port/strings/en.json";
import { useDesignV3 } from "../root/V3Root";
import { type BannerAction, type BannerIcon, bannerSpecs } from "./status";

const copy = strings["states.jsx"].StBanner;

const ICONS: Record<BannerIcon, ReactNode> = {
  card: <FiCreditCard size={15} aria-hidden />,
  clock: <FiClock size={15} aria-hidden />,
  lock: <FiLock size={15} aria-hidden />,
  sparkles: <FiStar size={15} aria-hidden />,
};

export interface StBannerAction {
  label: string;
  onClick: () => void;
}

export function StBanner({
  title,
  body,
  icon,
  tone = "neutral",
  actions,
  onDismiss,
  compact,
}: {
  title: string;
  body?: string;
  icon: ReactNode;
  tone?: "neutral" | "attention";
  actions?: StBannerAction[];
  onDismiss?: () => void;
  compact?: boolean;
}) {
  const red = tone === "attention";
  return (
    <div
      className={`st-banner${red ? " is-attention" : ""}${compact ? " is-compact" : ""}`}
      role={red ? "alert" : "status"}
      data-st-banner={tone}
    >
      <span className="st-banner-icon">{icon}</span>
      <span className="st-banner-text">
        <span className="st-banner-title">{title}</span>
        {body ? <span className="st-banner-body">{body}</span> : null}
      </span>
      <span className="st-banner-actions">
        {(actions ?? []).map((action) => (
          <button
            key={action.label}
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-st-action={action.label}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
        {onDismiss ? (
          <button
            type="button"
            className="nx-btn nx-btn-text nx-btn-sm state-banner-dismiss"
            aria-label={copy.dismiss}
            onClick={onDismiss}
          >
            <FiX size={13} aria-hidden />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The account and AI banners above a screen body. `onAction` receives which
 * button was pressed; every action in the prototype opens the paywall.
 */
export function StBannerStack({
  screen,
  onAction,
}: {
  screen?: string;
  onAction?: (kind: BannerAction) => void;
}) {
  const enabled = useDesignV3();
  const plan = usePlan();
  if (!enabled) return null;
  const specs = bannerSpecs(plan.data, screen, newDate().getTime());
  if (!specs.length) return null;
  return (
    <div className="st-banners" data-st-banners>
      {specs.map(({ id, tone, icon, title, body, action }) => (
        <StBanner
          key={id}
          tone={tone}
          icon={ICONS[icon]}
          title={title}
          body={body}
          actions={
            action && onAction
              ? [{ label: action.label, onClick: () => onAction(action.kind) }]
              : undefined
          }
        />
      ))}
    </div>
  );
}
