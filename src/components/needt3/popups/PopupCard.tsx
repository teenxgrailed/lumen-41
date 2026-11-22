"use client";

import type { ComponentType } from "react";

import {
  LuBell,
  LuCalendar,
  LuCheck,
  LuClock,
  LuGift,
  LuLayers,
  LuRepeat,
  LuSparkles,
  LuTarget,
  LuX,
  LuZap,
} from "react-icons/lu";

import type { BulletIcon, PopupPlanCard, PopupView } from "@/lib/popups/types";
import type { PriceStrings } from "@/lib/needt3/pricing";

import { Sheet } from "../ctx/Sheet";

const ICONS: Record<BulletIcon, ComponentType<{ size?: number }>> = {
  check: LuCheck,
  calendar: LuCalendar,
  sparkles: LuSparkles,
  clock: LuClock,
  zap: LuZap,
  repeat: LuRepeat,
  layers: LuLayers,
  bell: LuBell,
  target: LuTarget,
  gift: LuGift,
};

export interface PopupCardProps {
  popup: PopupView;
  open: boolean;
  phone: boolean;
  /** A store build states the limit and points nowhere: no plan cards, no paywall buttons. */
  store: boolean;
  prices: PriceStrings;
  /** Lifetime seats remain; unknown counts as open. */
  lifetimeOpen: boolean;
  onDismiss: () => void;
  onPrimary: () => void;
  onCard: (card: PopupPlanCard) => void;
}

/**
 * The one popup shell. Desktop: a split modal, text on the left and an
 * optional image on the right. Phone: a bottom sheet. It is only layout on
 * top of the existing sheet, buttons and tokens.
 */
export function PopupCard({
  popup,
  open,
  phone,
  store,
  prices,
  lifetimeOpen,
  onDismiss,
  onPrimary,
  onCard,
}: PopupCardProps) {
  const cards = store
    ? []
    : popup.cards.filter((c) => c.plan !== "lifetime" || lifetimeOpen);
  const opensPaywall = popup.primary?.action === "paywall";
  const primary = popup.primary && !(store && opensPaywall) ? popup.primary : null;
  const image = popup.imageUrl && !phone ? popup.imageUrl : null;
  const phoneImage = popup.imageUrl && phone ? popup.imageUrl : null;
  const hasImage = Boolean(image || phoneImage);

  return (
    <Sheet
      open={open}
      onClose={onDismiss}
      title={popup.title}
      scrimClassName={"base-scrim nx-scrim pop-scrim" + (phone ? " is-phone" : "")}
      className={
        "base-sheet nx-sheet pop-sheet" +
        (phone ? " is-phone" : "") +
        (hasImage && !phone ? " has-image" : "")
      }
    >
      <div data-popup="" data-assistant-avoid className="pop-root">
        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          className="nx-press base-close pop-close"
        >
          <LuX size={16} />
        </button>
        {phoneImage ? (
          <div className="pop-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={phoneImage} alt="" />
          </div>
        ) : null}
        <div className="pop-text">
          {popup.badge ? <span className="pop-badge">{popup.badge}</span> : null}
          <h2 className="pop-title">{popup.title}</h2>
          {popup.body ? <p className="pop-body">{popup.body}</p> : null}
          {popup.bullets.length > 0 ? (
            <ul className="pop-bullets">
              {popup.bullets.map((b) => {
                const Icon = ICONS[b.icon];
                return (
                  <li className="pop-bullet" key={b.text}>
                    <Icon size={14} />
                    <span>{b.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {cards.length > 0 ? (
            <div className="pop-cards">
              {cards.map((card) => (
                <button
                  type="button"
                  key={card.plan}
                  className="pop-card"
                  onClick={() => onCard(card)}
                >
                  <span className="pop-card-title">
                    {card.plan === "pro" ? "Upgrade to Pro" : "Get Lifetime"}
                  </span>
                  <span className="pop-card-line">
                    {card.plan === "pro"
                      ? `${prices.yearly} a year, or ${prices.monthly} a month`
                      : `${prices.lifetime} once, no renewal`}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          <div className="pop-actions">
            {primary ? (
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                onClick={onPrimary}
              >
                {primary.label}
              </button>
            ) : null}
            <button
              type="button"
              className="nx-btn nx-btn-secondary"
              onClick={onDismiss}
            >
              {popup.secondary ?? "Close"}
            </button>
          </div>
        </div>
        {image ? (
          <div className="pop-image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt="" />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
