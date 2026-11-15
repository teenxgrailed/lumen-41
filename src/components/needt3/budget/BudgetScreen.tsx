"use client";

/* Needt Budget as a place in Needt (openspec `add-budget-module`): Budget
   itself in a frame, or the promo. The promo is the Connections AI promo's
   card on the same sky (`cn-promo*`), so the place looks like the rest of the
   shell; nothing on it reads Budget's data. */
import { useCallback, useEffect, useRef, useState } from "react";

import { FiCheck, FiLock } from "react-icons/fi";
import { LuWallet } from "react-icons/lu";

import {
  BUDGET_FALLBACK_MS,
  BUDGET_ORIGIN,
  BUDGET_PROMO_MS,
  BUDGET_PROMO_PREF,
  BUDGET_READY_SEEN_KEY,
  budgetFallbackVisible,
  budgetFrameSrc,
  budgetOpenHref,
  budgetThemeMessage,
  budgetView,
  isBudgetReadyMessage,
  promoSeenFrom,
} from "@/lib/needt3/budget";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { useSetPref, useSettings } from "@/lib/needt3/hooks/settings";
import { isPro, offersTrial } from "@/lib/needt3/paywall";
import { priceStrings } from "@/lib/needt3/pricing";
import { useStoreDistribution } from "@/lib/use-store-distribution";

import { openPaywall } from "../paywall";
import { GlassCard, PxSky } from "../scenes";
import { NeedtLoading } from "../states/NeedtLoading";

const P = priceStrings();

/** The most the loading word covers the frame; see `BudgetFrame`. */
const FRAME_COVER_MAX_MS = 20_000;

const PROMO_LINES = [
  "Wallets, spending and what is left this month",
  "Resale items from bought to sold",
  "The same Needt account, no second sign-in",
] as const;

/** The v3 scope: it carries the side being worn (`data-theme`). */
const scope = () =>
  typeof document === "undefined"
    ? null
    : document.querySelector<HTMLElement>(".needt-v3");

/** The side Needt is wearing, from the v3 scope as the desktop bridge reads it. */
function readTheme(): "light" | "dark" {
  return scope()?.dataset.theme === "dark" ? "dark" : "light";
}

export function BudgetScreen() {
  const plan = usePlan();
  const settings = useSettings();
  const setPref = useSetPref();
  const pro = plan.data ? isPro(plan.data.kind) : undefined;
  const promoSeen = promoSeenFrom(settings.data?.prefs, !!settings.data);
  // The view is settled once per visit: storing the flag below must not
  // swap the intro for Budget under the person's eyes.
  const [opened, setOpened] = useState(false);
  const [first, setFirst] = useState<"intro" | "app" | null>(null);
  const settled = budgetView({ pro, promoSeen });
  useEffect(() => {
    if (first === null && (settled === "intro" || settled === "app"))
      setFirst(settled);
  }, [first, settled]);
  const view =
    opened || first === "app" ? "app" : first === "intro" ? "intro" : settled;

  // The intro counts as seen once it is shown, not only once Open is pressed:
  // leaving after five seconds must not bring it back next time.
  const setPrefRef = useRef(setPref);
  setPrefRef.current = setPref;
  const stored = useRef(false);
  useEffect(() => {
    if (view !== "intro" || stored.current) return;
    stored.current = true;
    void setPrefRef.current(BUDGET_PROMO_PREF, true);
  }, [view]);

  const open = useCallback(() => setOpened(true), []);

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
  // One timer per intro, whatever re-renders around it.
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  useEffect(() => {
    if (locked) return;
    const t = window.setTimeout(() => onOpenRef.current(), BUDGET_PROMO_MS);
    return () => window.clearTimeout(t);
  }, [locked]);

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

function readSeenBefore() {
  try {
    return window.localStorage.getItem(BUDGET_READY_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Installed (home-screen app, desktop shell): there is no tab to open one in. */
function isStandalone() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    nav.standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true
  );
}

/** Budget itself, chromeless, following Needt's theme while it is open. */
export function BudgetFrame() {
  const frame = useRef<HTMLIFrameElement>(null);
  // The first theme goes in the address; later changes go by message, so the
  // frame is not reloaded and keeps its place.
  const [src] = useState(() => budgetFrameSrc(readTheme()));
  // The word covers the frame from mount (load start) to its load event, so
  // the white page of a cold Budget is never seen. A frame that never reports
  // loading is uncovered after `FRAME_COVER_MAX_MS` rather than hidden forever.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setLoaded(true), FRAME_COVER_MAX_MS);
    return () => window.clearTimeout(t);
  }, []);

  // Budget (a frame we cannot look into) says when its page has drawn. A frame
  // that stays silent is how a blocked or signed-out Budget looks: white. After
  // `BUDGET_FALLBACK_MS` without the message, a way out opens Budget itself.
  const [ready, setReady] = useState(false);
  const [waited, setWaited] = useState(false);
  const [seenBefore] = useState(readSeenBefore);
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    setPhone(scope()?.dataset.ui === "phone");
    const t = window.setTimeout(() => setWaited(true), BUDGET_FALLBACK_MS);
    const onMessage = (event: MessageEvent) => {
      if (!isBudgetReadyMessage(event)) return;
      setReady(true);
      try {
        window.localStorage.setItem(BUDGET_READY_SEEN_KEY, "1");
      } catch {
        /* private mode: the way out simply stays phone-only */
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("message", onMessage);
    };
  }, []);
  const openBudget = useCallback(() => {
    const href = budgetOpenHref();
    // Safari: a new tab keeps Needt where it was. Installed: same window.
    if (isStandalone()) window.location.assign(href);
    else window.open(href, "_blank", "noopener");
  }, []);

  const send = useCallback(
    () =>
      frame.current?.contentWindow?.postMessage(
        budgetThemeMessage(readTheme()),
        BUDGET_ORIGIN
      ),
    []
  );
  useEffect(() => {
    const el = scope();
    if (!el) return undefined;
    const watch = new MutationObserver(send);
    watch.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => watch.disconnect();
  }, [send]);

  return (
    <>
      <iframe
        ref={frame}
        className="bd-frame"
        src={src}
        title="Needt Budget"
        data-bd-frame=""
        // A change made before Budget was ready reaches it on load.
        onLoad={() => {
          send();
          setLoaded(true);
        }}
        referrerPolicy="strict-origin"
        // Budget's own pages: forms, its sign-in through Needt, file pickers.
        allow="clipboard-write"
      />
      {loaded ? null : <NeedtLoading cover />}
      {budgetFallbackVisible({
        ready,
        waited,
        phone,
        readySeenBefore: seenBefore,
      }) ? (
        <div className="bd-fallback" data-bd-fallback="" role="status">
          <p className="bd-fallback-text">Budget did not open here.</p>
          <button
            type="button"
            className="nx-btn nx-btn-secondary"
            data-bd-fallback-open=""
            onClick={openBudget}
          >
            Open Budget
          </button>
        </div>
      ) : null}
    </>
  );
}
