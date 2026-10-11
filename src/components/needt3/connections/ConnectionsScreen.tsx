"use client";

import { useEffect, useRef, useState } from "react";

import {
  FiAlertTriangle,
  FiCheckCircle,
  FiLock,
  FiMoreHorizontal,
  FiPlus,
  FiRefreshCw,
  FiSearch,
  FiSlash,
} from "react-icons/fi";

import { CalDAVAccountForm } from "@/components/settings/CalDAVAccountForm";

import { priceStrings } from "@/lib/needt3/pricing";

import { Sheet } from "../ctx/Sheet";
import { Art } from "../menu/Art";
import { PlEmpty, StScreen } from "../states/StScreen";
import {
  CATEGORY_LABEL,
  type CnItem,
  categoriesOf,
  disconnectTitle,
  pillOf,
  statusLine,
} from "./derive";
import { mergeQueries } from "./query";
import type { ConnectionsController } from "./useConnectionsController";

const P = priceStrings();

/** The brand tile is a letter on the quiet tile; brand-kit marks come later. */
function Tile({ name }: { name: string }) {
  return (
    <span className="cn-tile" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

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

/** "…" under the card: Disconnect (after a confirm). */
function CardMenu({
  item,
  onDisconnect,
}: {
  item: CnItem;
  onDisconnect: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
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
    <span ref={wrap} className="relative" style={{ marginLeft: "auto" }}>
      <button
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
      {open ? (
        <div
          role="menu"
          className="nx-pop is-right cn-menu-box"
          style={{
            position: "absolute",
            right: 0,
            top: 34,
            zIndex: 5,
            minWidth: 180,
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
            <FiSlash size={15} aria-hidden />
            Disconnect…
          </button>
        </div>
      ) : null}
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
    <div
      className={"cn-c nx-swap" + (down ? " is-down" : "")}
      data-cn-card={item.slug}
      data-state={busy ? "connecting" : item.state}
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
    >
      <div className="cn-c-head">
        <Tile name={item.name} />
        <span className="base-stack" style={{ minWidth: 0, gap: 4 }}>
          <span className="cn-c-name">{item.name}</span>
          {on || down || busy ? (
            <Pill state={item.state} busy={busy} />
          ) : (
            <span className="cn-c-kind">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </span>
          )}
        </span>
        {on && !busy ? (
          <CardMenu item={item} onDisconnect={onDisconnect} />
        ) : null}
      </div>
      <p className="cn-c-gives">{item.description}</p>
      <div className="cn-c-foot">
        {on || down ? (
          <span className="base-stack" style={{ minWidth: 0, flex: 1, gap: 2 }}>
            <span className="base-meta" data-cn-account="">
              {item.account}
            </span>
            {down ? (
              <span
                className="base-meta"
                style={{ color: "var(--destructive)" }}
                data-cn-meta=""
              >
                {item.detail}
              </span>
            ) : null}
          </span>
        ) : (
          <span style={{ flex: 1 }} />
        )}
        {down ? (
          <button
            type="button"
            className="nx-btn nx-btn-primary nx-btn-sm"
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
            className="nx-btn nx-btn-secondary nx-btn-sm"
            data-cn-connect={item.slug}
            disabled={busy}
            onClick={onConnect}
          >
            {busy ? <Spinner /> : <FiPlus size={13} aria-hidden />}
            {busy ? "Connecting" : "Connect"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** AI tools are not on Free (owner, 08.10.26): the tab opens on a lock panel. */
function AiPromo({ onPlans }: { onPlans: () => void }) {
  return (
    <div className="cn-promo nx-swap" data-cn-ai-promo="">
      <div className="cn-promo-in">
        <div className="cn-promo-icons" aria-hidden="true">
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
            onClick={onPlans}
          >
            Try Pro free for {P.trialDays} days
          </button>
          <button
            type="button"
            className="nx-btn nx-btn-secondary cn-promo-btn"
            data-cn-promo-plans=""
            onClick={onPlans}
          >
            See plans
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Connections (connections.jsx `ConnectionsScreen`): every app and service
 * Needt can read, one card each, with Connect / Reconnect / Disconnect. Google
 * and Outlook calendars and both mailboxes start their own OAuth; Apple /
 * iCloud takes a CalDAV login; the rest are Composio toolkits
 * (`/api/integrations/connect`).
 *
 * //todo: the AI tools tab (Claude, ChatGPT, Cursor… setup steps) and the MCP /
 * API links need the `AccessLink` routes (migration M2, no routes yet): Pro
 * sees a note, Free sees the lock panel the prototype shows.
 * //todo: brand-kit marks for the tiles (a letter tile for now), the consent
 * sheet's scope list, Sync now / Sync settings, the sticky glass toolbar, and
 * the "sidebar: 1 issue" link.
 */
export function ConnectionsScreen({ c: ctl }: { c: ConnectionsController }) {
  const {
    accounts,
    catalog,
    openSettings,
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

  return (
    <div className="scroll-inner" data-v3-screen="connections">
      <div className="cn-page">
        {/* Same header as every place: its picture, the title, one quiet line.
            //todo: share PlaceHeader with the places once #93 is in. */}
        <header className="pl-place-header-row">
          <Art name="import" size={30} />
          <h1 className="pl-place-header-text">Connections</h1>
          {items.length ? (
            <span className="pl-place-header-text-2">{statusLine(c)}</span>
          ) : null}
        </header>
        <div className="cn-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="cn-tab"
            aria-selected={tab === "apps"}
            onClick={() => pickTab("apps")}
          >
            Apps &amp; services
          </button>
          <button
            type="button"
            role="tab"
            className="cn-tab"
            aria-selected={tab === "ai"}
            onClick={() => pickTab("ai")}
          >
            AI tools
            {locked ? <FiLock size={12} aria-hidden /> : null}
          </button>
        </div>
        {tab === "ai" ? (
          locked ? (
            <AiPromo onPlans={() => openSettings("plan")} />
          ) : (
            <PlEmpty
              art={<Art name="import" size={56} />}
              title="AI tools"
              line="Connecting Claude, ChatGPT and other AI clients comes with the access-link routes; nothing to set up here yet."
            />
          )
        ) : (
          <StScreen
            query={mergeQueries([catalog, accounts])}
            kind="cards"
            screen="connections"
          >
            <div className="cn-bar">
              <span className="cn-seg" role="group" aria-label="Show">
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
                    onClick={() => setShow(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
              {categoriesOf(items).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  className="cn-chip"
                  aria-pressed={chip === cat}
                  onClick={() => setChip(chip === cat ? "all" : cat)}
                >
                  {CATEGORY_LABEL[cat] ?? cat}
                </button>
              ))}
              <label className="cn-search">
                <span className="cn-sicon">
                  <FiSearch size={14} aria-hidden />
                </span>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search apps"
                  aria-label="Search apps"
                />
              </label>
            </div>
            {shown.length ? (
              <div className="cn-grid">
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
              <div className="cn-empty">
                <span className="base-strong">Nothing matches</span>
                <span className="base-meta">
                  {show === "connected"
                    ? "Nothing is connected yet."
                    : "Try another word or category."}
                </span>
              </div>
            )}
          </StScreen>
        )}
      </div>
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
        open={caldav}
        onClose={() => setCaldav(false)}
        title="Connect Apple / iCloud"
        scrimClassName="nx-scrim cn-sheet-grid"
        className="nx-sheet cn-sheet-col"
        style={{ width: 460 }}
      >
        <span className="cn-sheet-title">Connect Apple / iCloud</span>
        <CalDAVAccountForm
          onSuccess={caldavDone}
          onCancel={() => setCaldav(false)}
        />
      </Sheet>
    </div>
  );
}
