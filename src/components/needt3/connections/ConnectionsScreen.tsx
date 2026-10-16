"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiLink2,
  FiLock,
  FiMoreHorizontal,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSlash,
  FiX,
} from "react-icons/fi";

import { priceStrings } from "@/lib/needt3/pricing";

import { BrandIcon, brandIdFor } from "../brand";
import { useV3PortalContainer } from "../ctx/PortalScope";
import { Sheet } from "../ctx/Sheet";
import { useExit } from "../ctx/useExit";
import { ProBadge, openPaywall } from "../paywall";
import { GlassCard, PxSky } from "../scenes";
import { StScreen } from "../states/StScreen";
import { type ScreenQuery, screenState } from "../states/status";
import { AiSetup } from "./AiSetup";
import { AiToolsPanel } from "./AiToolsPanel";
import { CalDavForm } from "./CalDavForm";
import {
  CATEGORY_LABEL,
  CHIP_LABEL,
  type CnItem,
  chipsOf,
  disconnectTitle,
  heroStatus,
  pillOf,
} from "./derive";
import { mergeQueries } from "./query";
import { strings } from "./strings";
import type { ConnectionsController } from "./useConnectionsController";

const P = priceStrings();

/** The tabs, in the prototype's order (connections-data.js `CN_TABS`). */
const TABS = [
  ["apps", "Apps & services"],
  ["ai", "AI tools"],
] as const;

/** The six AI tools the Free promo shows hazy behind its lock (`CN_AI`). */
const AI_TOOLS = [
  "claude",
  "chatgpt",
  "cursor",
  "gemini",
  "perplexity",
  "othermcp",
] as const;

/** The AI tools tab reads no list, so a failing catalogue must not cover it. */
const NO_QUERY: ScreenQuery = {
  status: "success",
  fetchStatus: "idle",
  data: true,
  error: null,
  refetch: () => undefined,
};

function Spinner({ size = 12 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="cn-spin cn-spinner-el"
      style={{ width: size, height: size }}
    />
  );
}

function Pill({ state, busy }: { state: CnItem["state"]; busy: boolean }) {
  const p = pillOf(state, busy);
  const key = busy ? "connecting" : state;
  return (
    <span className="cn-pill nx-swap" key={key} data-cn-pill={key}>
      {busy ? (
        <Spinner size={10} />
      ) : state === "connected" ? (
        <FiCheckCircle size={12} aria-hidden />
      ) : state === "disconnected" ? (
        <FiAlertTriangle size={12} aria-hidden />
      ) : null}
      {p.label}
    </span>
  );
}

/**
 * "…" on a connected card: Disconnect (after a confirm). The menu is portalled
 * under its trigger (a glass card is its own stacking context, so a menu inside
 * it would sit under the cards below) and flips up near the bottom edge.
 */
function CardMenu({
  item,
  onDisconnect,
}: {
  item: CnItem;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{
    right: number;
    top: number;
    flip: boolean;
  } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const container = useV3PortalContainer();
  const [shown, leaving] = useExit(open, 130);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const h = 12 + 34;
    setAt(
      r.bottom + 6 + h > window.innerHeight - 8
        ? { right: window.innerWidth - r.right, top: r.top - 6 - h, flip: true }
        : { right: window.innerWidth - r.right, top: r.bottom + 6, flip: false }
    );
  }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btn.current?.contains(t) && !pop.current?.contains(t))
        setOpen(false);
    };
    const esc = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <span className="cn-card-text">
      <button
        ref={btn}
        type="button"
        className="cn-iconbtn"
        aria-label={`Options for ${item.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-cn-more={item.slug}
        onClick={() => setOpen(!open)}
      >
        <FiMoreHorizontal size={16} aria-hidden />
      </button>
      {shown && at && container
        ? createPortal(
            <div
              ref={pop}
              role="menu"
              className={
                "nx-pop is-right cn-menu-box" + (leaving ? " is-leaving" : "")
              }
              data-cn-menu={item.slug}
              style={{
                transformOrigin: at.flip ? "bottom right" : "top right",
                right: at.right,
                top: at.top,
              }}
            >
              {/* //todo: Sync now and Sync settings (declined / all-day / write
                  back) need per-provider sync routes in the new design. */}
              <button
                type="button"
                role="menuitem"
                className="cn-mi is-danger"
                data-cn-disconnect={item.slug}
                onClick={() => {
                  setOpen(false);
                  onDisconnect();
                }}
              >
                <span className="cn-menu-row">
                  <FiSlash size={15} aria-hidden />
                </span>
                Disconnect…
              </button>
            </div>,
            container
          )
        : null}
    </span>
  );
}

function Card({
  item,
  i,
  busy,
  onConnect,
  onDisconnect,
}: {
  item: CnItem;
  i: number;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const on = item.state === "connected";
  const down = item.state === "disconnected";
  return (
    <GlassCard
      className={"cn-c nx-swap" + (down ? " is-down" : "")}
      pad={18}
      radius={20}
      data-cn-card={item.slug}
      data-state={busy ? "connecting" : item.state}
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
    >
      <div className="cn-c-head">
        <BrandIcon id={brandIdFor(item.slug)} size={40} />
        <span className="cn-card-col">
          <span className="cn-card-row">
            <span className="cn-c-name">{item.name}</span>
          </span>
          <span className="cn-card-row-2">
            {on || down || busy ? (
              <Pill state={item.state} busy={busy} />
            ) : (
              <span className="cn-c-kind">
                {CATEGORY_LABEL[item.category] ?? item.category}
              </span>
            )}
          </span>
        </span>
        {on && !busy ? (
          <CardMenu item={item} onDisconnect={onDisconnect} />
        ) : null}
      </div>
      <p className="cn-c-gives">{item.description}</p>
      <div className="cn-c-foot">
        {on || down ? (
          <span className="cn-card-col-2">
            <span className="cn-card-text-2" data-cn-account="">
              {item.account}
            </span>
            {down ? (
              <span
                className="cn-card-text-3 cn-card-lost"
                data-cn-meta=""
                title={item.detail ?? undefined}
              >
                {item.detail}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="cn-setup-el-2" />
        )}
        {down ? (
          <button
            type="button"
            className="nx-btn nx-btn-primary nx-btn-sm cn-card-btn"
            data-cn-reconnect={item.slug}
            disabled={busy}
            onClick={onConnect}
          >
            {busy ? <Spinner /> : <FiRefreshCw size={13} aria-hidden />}
            {busy ? "Reconnecting" : "Reconnect"}
          </button>
        ) : !on ? (
          <button
            type="button"
            className="nx-btn nx-btn-secondary nx-btn-sm cn-card-btn-2"
            data-cn-connect={item.slug}
            disabled={busy}
            onClick={onConnect}
          >
            {busy ? <Spinner /> : <FiPlus size={13} aria-hidden />}
            {busy ? "Connecting" : "Connect"}
          </button>
        ) : null}
      </div>
    </GlassCard>
  );
}

/**
 * AI tools are not on Free (owner, 08.10.26): the tab opens on one glass panel
 * on the sky, the six tool tiles hazy behind a lock (connections.jsx
 * `CnAiPromo`). Both buttons go to the paywall.
 *
 * //todo: the prototype's three benefit lines ("Your own MCP and API links",
 * …) promise the MCP / API connections, which need the `AccessLink` routes
 * (migration M2); they are left out until those exist.
 */
function AiPromo() {
  return (
    <GlassCard
      className="cn-promo nx-swap"
      pad={0}
      radius={24}
      data-cn-ai-promo=""
    >
      <div className="cn-promo-in">
        <div className="cn-promo-icons" aria-hidden="true">
          <span className="cn-promo-haze">
            {AI_TOOLS.map((id) => (
              <BrandIcon key={id} id={brandIdFor(id)} size={44} />
            ))}
          </span>
          <span className="cn-promo-lock">
            <FiLock size={18} aria-hidden />
          </span>
        </div>
        <div className="cn-promo-text">
          <h2 className="cn-promo-title">Bring Needt into your AI tools</h2>
          <p className="cn-promo-line">
            Your tasks, calendar and notes — right where you already ask
            questions.
          </p>
        </div>
        <div className="cn-promo-cta">
          <button
            type="button"
            className="nx-btn nx-btn-primary cn-promo-btn"
            data-cn-promo-try=""
            onClick={() => openPaywall("AI tools")}
          >
            Try Pro free for {P.trialDays} days
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-secondary cn-promo-btn"
            data-cn-promo-plans=""
            onClick={() => openPaywall()}
          >
            See plans
          </button>
        </div>
      </div>
    </GlassCard>
  );
}

/** A glass note on the sky: the empty list, and the Pro AI tab until it has tools. */
function GlassNote({
  icon,
  title,
  line,
  action,
  attr,
}: {
  icon: "search" | "link";
  title: string;
  line: string;
  action?: { label: string; run: () => void };
  attr: string;
}) {
  return (
    <GlassCard
      className="cn-empty nx-swap"
      pad={0}
      radius={20}
      // The prototype passes `pad={0}`, which its inline style turns into no
      // padding at all, against the 36 / 24 its own CSS asks for; the CSS wins.
      style={{ padding: "36px 24px" }}
      {...{ [attr]: "" }}
    >
      <span className="cn-screen-grid">
        {icon === "search" ? (
          <FiSearch size={18} aria-hidden />
        ) : (
          <FiLink2 size={18} aria-hidden />
        )}
      </span>
      <span className="cn-screen-text">{title}</span>
      <span className="cn-screen-text-2">{line}</span>
      {action ? (
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm cn-screen-text-3"
          data-cn-clear=""
          onClick={action.run}
        >
          {action.label}
        </button>
      ) : null}
    </GlassCard>
  );
}

/**
 * Connections (connections.jsx `ConnectionsScreen`): every app and service
 * Needt can read, one card each, with Connect / Reconnect / Disconnect. It is
 * a window on the printed sky: a centred hero (eyebrow, display title, one
 * line, a status pill), the tabs and filters on a bar that sticks while the
 * cards scroll, and glass cards in a 3 / 2 / 1 column grid. Google and Outlook
 * calendars and both mailboxes start their own OAuth; Apple / iCloud takes a
 * CalDAV login; the rest are Composio toolkits (`/api/integrations/connect`).
 *
 * Category chips are the prototype's six, our categories mapped onto them
 * (`chipOf` in derive.ts).
 *
 * //todo: the AI tools tab (Claude, ChatGPT, Cursor… setup steps) and the MCP /
 * API links need the `AccessLink` routes (migration M2, no routes yet): Pro
 * sees a note, Free sees the lock panel the prototype shows.
 * //todo: the consent sheet's scope list, Sync now / Sync settings, Beta and
 * Pro marks on single cards, screen memory (`needt.cnState`).
 * //todo: the prototype's Free mail cap ("Free: 1 mail account", Upgrade on the
 * other mail cards) is not drawn: the product's Free plan has no mailboxes at
 * all (PLAN_LIMITS), so the pill would state a rule that does not exist.
 */
export function ConnectionsScreen({ c: ctl }: { c: ConnectionsController }) {
  const {
    accounts,
    catalog,
    tab,
    pickTab,
    q,
    setQ,
    chip,
    setChip,
    show,
    setShow,
    busy,
    confirm,
    setConfirm,
    caldav,
    setCaldav,
    items,
    shown,
    counts: c,
    locked,
    connect,
    disconnect,
    caldavDone,
  } = ctl;

  const apps = tab === "apps";
  const query = apps ? mergeQueries([catalog, accounts]) : NO_QUERY;
  // The sky window is mounted only while the screen has content to show.
  const live = screenState(query) === "content";
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  stuckRef.current = stuck;

  /* Sticky toolbar: a 1px sentinel above the bar tells us when it is stuck
     (IntersectionObserver on the window's own scroller); only then does it get
     its glass, hairline and shadow. */
  useEffect(() => {
    const root = scrollRef.current;
    const el = sentinel.current;
    if (!root || !el || typeof IntersectionObserver !== "function")
      return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        setStuck(
          !e.isIntersecting &&
            e.boundingClientRect.top <
              (e.rootBounds ? e.rootBounds.top : 0) + 20
        );
      },
      { root, rootMargin: "-9px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [live]);
  /* Changing tab / filter while stuck: bring the first card up under the bar
     instead of leaving you in an empty stretch. */
  const toTop = useCallback(() => {
    const root = scrollRef.current;
    const el = sentinel.current;
    if (!stuckRef.current || !root || !el) return;
    window.requestAnimationFrame(() =>
      root.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: "auto" })
    );
  }, []);

  const status = heroStatus(apps ? items : [], tab);
  const chips = chipsOf(items);
  const needle = q.trim();
  const onTabKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = apps ? "ai" : "apps";
    pickTab(next);
    toTop();
    document.querySelector<HTMLElement>(`[data-cn-tab="${next}"]`)?.focus();
  };
  const reset = () => {
    setQ("");
    setShow("all");
    setChip("all");
  };
  // The pill counts the tab in front of you; on Apps it waits for the list.
  const showStatus = !apps || items.length > 0;

  return (
    <>
      {/* The state layer (skeleton, error, offline) covers the whole screen,
          sky included, as the prototype's `StScreenLayer` does over the routed
          screen. */}
      <StScreen query={query} kind="cards" screen="connections">
        <div
          className="nx-window cn-screen-box"
          data-v3-screen="connections"
          data-cn-screen=""
        >
          <PxSky variant="a" radius={14}>
            <div
              ref={scrollRef}
              className="scroll-inner nx-scroll cn-wrap cn-screen-abs"
              data-cn-scroll=""
            >
              <div className="cn-page">
                <header className="nx-swap cn-screen-col" data-px-calm>
                  <span className="px-kicker">Sources</span>
                  <h1 className="px-display px-on-sky cn-h1 cn-screen-text-4">
                    Connections
                  </h1>
                  <span className="px-on-sky cn-screen-text-5">
                    Where Needt reads your mail, calendars and files — and how
                    your AI tools read Needt.
                  </span>
                  {showStatus ? (
                    <span
                      data-cn-status={status.tone}
                      className={"cn-screen-row-2 cn-status is-" + status.tone}
                      title={
                        status.names.length
                          ? `${status.names.join(", ")} lost access — reconnect to keep syncing`
                          : undefined
                      }
                    >
                      <span className="cn-screen-el" />
                      {status.text}
                    </span>
                  ) : null}
                </header>

                <div
                  ref={sentinel}
                  className="cn-sentinel"
                  aria-hidden="true"
                />
                <div
                  className={"cn-sticky" + (stuck ? " is-stuck" : "")}
                  data-px-calm
                  data-cn-sticky={stuck ? "stuck" : "rest"}
                >
                  <div
                    role="tablist"
                    aria-label="Connection type"
                    className="cn-tabs px-track nx-swap"
                    style={{ animationDelay: "40ms" }}
                    onKeyDown={onTabKey}
                  >
                    {TABS.map(([k, label]) => {
                      const n =
                        k === "apps"
                          ? c.connected
                          : (ctl.mcp.apps?.length ?? 0);
                      const bad = k === "apps" ? status.names : [];
                      const badText = `${bad.join(", ")} ${bad.length === 1 ? "needs" : "need"} attention`;
                      return (
                        <button
                          key={k}
                          type="button"
                          role="tab"
                          id={"cn-tab-" + k}
                          aria-controls="cn-panel"
                          aria-selected={tab === k}
                          tabIndex={tab === k ? 0 : -1}
                          className="cn-tab"
                          data-cn-tab={k}
                          onClick={() => {
                            pickTab(k);
                            toTop();
                          }}
                        >
                          {label}
                          {k === "ai" ? (
                            <ProBadge
                              size="sm"
                              locked={locked}
                              feature="AI tools"
                            />
                          ) : null}
                          {n ? (
                            <span className="cn-count" data-cn-count={k}>
                              {n} connected
                            </span>
                          ) : null}
                          {bad.length ? (
                            <span
                              className="cn-dot"
                              role="img"
                              aria-label={badText}
                              title={badText}
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>

                  {tab === "ai" && locked ? null : (
                    <div className="cn-bar">
                      <div
                        className="cn-seg px-track"
                        role="group"
                        aria-label="Show"
                      >
                        {(
                          [
                            ["connected", "Connected"],
                            ["all", "All apps"],
                          ] as const
                        ).map(([id, label]) => (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={show === id}
                            data-cn-show={id}
                            onClick={() => {
                              setShow(id);
                              toTop();
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      {apps ? (
                        <span aria-hidden="true" className="cn-screen-el-3" />
                      ) : null}
                      {apps
                        ? (["all", ...chips] as const).map((id) => (
                            <button
                              key={id}
                              type="button"
                              className="px-chip-btn cn-chip"
                              aria-pressed={chip === id}
                              data-cn-chip={id}
                              onClick={() => {
                                setChip(id);
                                toTop();
                              }}
                            >
                              {id === "all" ? "All categories" : CHIP_LABEL[id]}
                            </button>
                          ))
                        : null}
                      <label className="cn-search px-track">
                        <span className="cn-sicon">
                          <FiSearch size={14} aria-hidden />
                        </span>
                        <input
                          ref={searchRef}
                          type="search"
                          value={q}
                          data-cn-search=""
                          aria-label={
                            apps
                              ? "Search apps and services"
                              : "Search AI tools"
                          }
                          placeholder={apps ? "Search apps" : "Search AI tools"}
                          onChange={(e) => {
                            setQ(e.target.value);
                            toTop();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape" && q) {
                              e.stopPropagation();
                              setQ("");
                            }
                          }}
                        />
                        {q ? (
                          <button
                            type="button"
                            className="cn-iconbtn cn-sx"
                            aria-label="Clear search"
                            onClick={() => {
                              setQ("");
                              searchRef.current?.focus();
                            }}
                          >
                            <FiX size={13} aria-hidden />
                          </button>
                        ) : null}
                      </label>
                    </div>
                  )}
                </div>

                <div
                  id="cn-panel"
                  role="tabpanel"
                  aria-labelledby={"cn-tab-" + tab}
                  className="cn-screen-col-2"
                >
                  {tab === "ai" ? (
                    locked ? (
                      <AiPromo />
                    ) : (
                      <AiToolsPanel c={ctl} />
                    )
                  ) : shown.length ? (
                    <div
                      className="cn-grid"
                      key={tab + show + chip}
                      data-cn-grid={tab}
                    >
                      {shown.map((item, i) => (
                        <Card
                          key={item.key}
                          item={item}
                          i={i}
                          busy={busy === item.key}
                          onConnect={() => void connect(item)}
                          onDisconnect={() => setConfirm(item)}
                        />
                      ))}
                    </div>
                  ) : (
                    <GlassNote
                      attr="data-cn-empty"
                      icon={needle ? "search" : "link"}
                      title={
                        needle
                          ? `Nothing matches “${needle}”`
                          : "Nothing connected here yet"
                      }
                      line={
                        needle
                          ? "Check the spelling — or look in AI tools."
                          : "Switch to All apps to see what you can connect."
                      }
                      action={{
                        label: needle ? "Clear search" : "Show all",
                        run: reset,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </PxSky>
        </div>
      </StScreen>
      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm ? disconnectTitle(confirm) : "Disconnect"}
        scrimClassName="nx-scrim cn-sheet-grid"
        className="nx-sheet cn-sheet-col"
        style={{ width: 400 }}
      >
        {confirm ? (
          <>
            <div className="cn-confirm-col">
              <span className="cn-sheet-title">{disconnectTitle(confirm)}</span>
              <span className="cn-confirm-text">
                Needt stops reading from {confirm.name}
                {confirm.account && confirm.account !== confirm.name
                  ? ` for ${confirm.account}`
                  : ""}
                . What is already in Needt stays; you can connect again at any
                time.
              </span>
            </div>
            <div className="cn-consent-row-5">
              <button
                type="button"
                className="nx-btn nx-btn-text"
                autoFocus
                onClick={() => setConfirm(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-danger"
                data-cn-confirm={confirm.slug}
                disabled={busy === confirm.key}
                onClick={() => void disconnect(confirm)}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
      <Sheet
        open={!!ctl.setup}
        onClose={() => ctl.setSetup(null)}
        title="Connect an AI tool"
        scrimClassName="nx-scrim cn-sheet-grid"
        className="nx-sheet cn-sheet-col"
        style={{ width: 500 }}
      >
        {ctl.setup ? (
          <>
            <AiSetup id={ctl.setup} mcp={ctl.mcp} />
            <div className="cn-setup-row-2">
              <span className="cn-setup-el-2" />
              <button
                type="button"
                className="nx-btn nx-btn-primary"
                data-cn-done={ctl.setup}
                autoFocus
                onClick={() => {
                  ctl.setSetup(null);
                  void ctl.mcp.reload();
                }}
              >
                Done
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
      <Sheet
        open={caldav}
        onClose={() => setCaldav(false)}
        title={strings.caldavTitle}
        scrimClassName="nx-scrim cn-sheet-grid"
        className="nx-sheet cn-sheet-col"
        style={{ width: 400 }}
      >
        <span className="cn-sheet-title">{strings.caldavTitle}</span>
        <CalDavForm onSuccess={caldavDone} onCancel={() => setCaldav(false)} />
      </Sheet>
    </>
  );
}
