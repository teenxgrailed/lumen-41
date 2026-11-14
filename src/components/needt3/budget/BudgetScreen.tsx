"use client";

/* Needt Budget as a place in Needt (openspec `add-budget-module`): Budget
   itself in a frame, or the promo. The promo is the Connections AI promo's
   card on the same sky (`cn-promo*`), so the place looks like the rest of the
   shell; nothing on it reads Budget's data. */
import { useCallback, useEffect, useRef, useState } from "react";

import { FiCheck, FiLock } from "react-icons/fi";
import { LuWallet } from "react-icons/lu";

import {
  BUDGET_ORIGIN,
  BUDGET_PROMO_MS,
  BUDGET_PROMO_PREF,
  budgetFrameSrc,
  budgetThemeMessage,
  budgetView,
  promoSeenFrom,
} from "@/lib/needt3/budget";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { isPro, offersTrial } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { openPaywall } from "../paywall";
import { GlassCard, PxSky } from "../scenes";

const P = priceStrings();

const PROMO_LINES = [
  "Wallets, spending and what is left this month",
  "Resale items from bought to sold",
  "The same Needt account, no second sign-in",
] as const;

/** The side Needt is wearing, as the boot script sets it on <html>. */
function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

export function BudgetScreen() {
  const plan = usePlan();
  const settings = useSettings();
  const setPref = useSetPref();
  const pro = plan.data ? isPro(plan.data.kind) : undefined;
  const promoSeen = promoSeenFrom(settings.data?.prefs, !!settings.data);
  // Opened in this visit: the stored flag may still be on its way.
  const [opened, setOpened] = useState(false);
  const view = opened ? "app" : budgetView({ pro, promoSeen });

  const open = useCallback(() => {
    setOpened(true);
    void setPref(BUDGET_PROMO_PREF, true);
  }, [setPref]);

  return (
    <div
      className="nx-window cn-screen-box bd-screen"
      data-v3-screen="budget"
      data-bd-view={view}
    >
      {view === "app" ? (
        <BudgetFrame />
      ) : (
        <PxSky variant="a" radius={14}>
          <div className="scroll-inner nx-scroll cn-wrap cn-screen-abs">
            <div className="cn-page bd-page">
              {view === "loading" ? null : (
                <BudgetPromo
                  locked={view === "promo"}
                  onOpen={open}
                  trial={offersTrial(plan.data)}
                />
              )}
            </div>
          </div>
        </PxSky>
      )}
    </div>
  );
}

/**
 * The promo. Free (`locked`): what Budget is and the way to Pro, no data.
 * Pro, first visit: the same card with Open, which works at once; Budget opens
 * on its own after `BUDGET_PROMO_MS`.
 */
function BudgetPromo({
  locked,
  onOpen,
  trial,
}: {
  locked: boolean;
  onOpen: () => void;
  trial: boolean;
}) {
  const store = useStoreDistribution();
  useEffect(() => {
    if (locked) return;
    const t = window.setTimeout(onOpen, BUDGET_PROMO_MS);
    return () => window.clearTimeout(t);
  }, [locked, onOpen]);

  return (
    <GlassCard
      className="cn-promo nx-swap"
      pad={0}
      radius={24}
      data-bd-promo={locked ? "locked" : "intro"}
    >
      <div className="cn-promo-in">
        <div className="cn-promo-icons" aria-hidden="true">
          <span className="bd-promo-mark">
            <LuWallet size={28} />
          </span>
          {locked ? (
            <span className="cn-promo-lock">
              <FiLock size={18} aria-hidden />
            </span>
          ) : null}
        </div>
        <div className="cn-promo-text">
          <h2 className="cn-promo-title">Needt Budget</h2>
          <p className="cn-promo-line">
            Your money next to your plans: wallets, spending and resale, inside
            Needt.
          </p>
        </div>
        <ul className="cn-promo-list">
          {PROMO_LINES.map((t) => (
            <li key={t} className="cn-promo-li">
              <span className="cn-promo-check">
                <FiCheck size={13} aria-hidden />
              </span>
              {t}
            </li>
          ))}
        </ul>
        {locked ? (
          // No buttons to buy or try Pro in a store build.
          store ? null : (
            <div className="cn-promo-cta">
              <button
                type="button"
                className="nx-btn nx-btn-primary cn-promo-btn"
                data-bd-promo-try=""
                onClick={() => openPaywall("Needt Budget")}
              >
                {trial ? `Try Pro free for ${P.trialDays} days` : "Get Pro"}
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-secondary cn-promo-btn"
                data-bd-promo-plans=""
                onClick={() => openPaywall()}
              >
                See plans
              </button>
            </div>
          )
        ) : (
          <div className="cn-promo-cta">
            <button
              type="button"
              className="nx-btn nx-btn-primary cn-promo-btn"
              data-bd-promo-open=""
              onClick={onOpen}
            >
              Open
            </button>
          </div>
        )}
      </div>
    </GlassCard>
  );
}

/** Budget itself, chromeless, following Needt's theme while it is open. */
function BudgetFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  // The first theme goes in the address; later changes go by message, so the
  // frame is not reloaded and keeps its place.
  const [src] = useState(() => budgetFrameSrc(readTheme()));

  useEffect(() => {
    const html = document.documentElement;
    const send = () =>
      frame.current?.contentWindow?.postMessage(
        budgetThemeMessage(readTheme()),
        BUDGET_ORIGIN
      );
    const watch = new MutationObserver(send);
    watch.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, []);

  return (
    <iframe
      ref={frame}
      className="bd-frame"
      src={src}
      title="Needt Budget"
      data-bd-frame=""
      // Budget's own pages: forms, its sign-in through Needt, file pickers.
      allow="clipboard-write"
    />
  );
}
