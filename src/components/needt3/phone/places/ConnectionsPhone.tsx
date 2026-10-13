"use client";

import { useRef, useState } from "react";

import { LuLock, LuSearch, LuX } from "react-icons/lu";

import { CalDAVAccountForm } from "@/components/settings/CalDAVAccountForm";

import { priceStrings } from "@/lib/needt3/pricing";

import { AiSetup } from "../../connections/AiSetup";
import { visibleTools } from "../../connections/AiToolsPanel";
import {
  CATEGORY_LABEL,
  type CnItem,
  disconnectTitle,
} from "../../connections/derive";
import { AI_META, appsFor, toolAvailable } from "../../connections/mcp";
import { mergeQueries } from "../../connections/query";
import type { ConnectionsController } from "../../connections/useConnectionsController";
import {
  PkButton,
  PkChips,
  PkEmpty,
  PkGlass,
  PkHold,
  PkHueTile,
  PkScreen,
  PkSection,
  PkSheet,
  pkCx,
} from "../kit";
import { usePhoneOverlays } from "../overlays/store";
import { PhoneState, PplRow, PplTile } from "./Parts";
import {
  chipPressed,
  connectionChips,
  connectionHits,
  connectionMeta,
  connectionsSub,
  disconnectText,
  groupConnections,
  pickChip,
  statusWord,
} from "./logic";

const P = priceStrings();

/** Keeps the last non-null value so a closing sheet still draws what it showed. */
function useLast<T>(value: T | null) {
  const last = useRef<T | null>(null);
  if (value) last.current = value;
  return value ?? last.current;
}

/**
 * Connections on the phone (phone-places.jsx `PplConnections`), over the same
 * controller as the desktop cards: what is connected, Connect / Reconnect
 * (which leave for the provider's own consent screen exactly as the desktop
 * does), and Disconnect after a confirm. A tap or hold on a row opens the
 * account sheet.
 *
 * //todo: Sync now and the calendar sync settings, the consent sheet's scope
 * list, brand marks, the AI tools' setup guides and the MCP / API connections
 * (the desktop has none of them wired either: no routes yet).
 */
export function ConnectionsPhone({ c }: { c: ConnectionsController }) {
  const openPaywall = usePhoneOverlays((s) => s.openPaywall);
  const [acctKey, setAcctKey] = useState<string | null>(null);
  const acctNow = acctKey
    ? (c.items.find((i) => i.key === acctKey) ?? null)
    : null;
  const A = useLast<CnItem>(acctNow);
  const C = useLast<CnItem>(c.confirm);

  const query = mergeQueries([c.catalog, c.accounts]);
  const loaded = query.data !== undefined;
  const { down, groups } = groupConnections(c.shown);

  const row = (item: CnItem) => {
    const busy = c.busy === item.key;
    const m = connectionMeta(item, busy);
    const lost = item.state === "disconnected";
    const on = item.state === "connected";
    const action = lost ? (
      <PkButton
        kind="primary"
        small
        className="ppl-act"
        disabled={busy}
        onClick={() => void c.connect(item)}
        data-ppl-reconnect={item.slug}
      >
        {busy ? "Connecting" : "Reconnect"}
      </PkButton>
    ) : on ? null : (
      <PkButton
        kind="chip"
        disabled={busy}
        onClick={() => void c.connect(item)}
        data-ppl-connect={item.slug}
      >
        {busy ? "Connecting" : "Connect"}
      </PkButton>
    );
    return (
      <PkHold key={item.key} onHold={() => setAcctKey(item.key)}>
        <PplRow
          lead={<PplTile slug={item.slug} />}
          tone={m.tone}
          title={item.name}
          meta={m.text}
          action={action}
          onOpen={() => setAcctKey(item.key)}
          openLabel={`${item.name}, details`}
          data={{
            "data-ppl-conn": item.slug,
            "data-state": busy ? "connecting" : item.state,
          }}
        />
      </PkHold>
    );
  };

  const tabs = (
    <div className="ppl-tabs" role="tablist" aria-label="Connection type">
      {(
        [
          ["apps", "Apps & services"],
          ["ai", "AI tools"],
        ] as const
      ).map(([k, label]) => (
        <PkGlass
          key={k}
          as="button"
          round
          role="tab"
          aria-selected={c.tab === k}
          className={pkCx("ppl-tab", c.tab === k && "is-on")}
          onClick={() => c.pickTab(k)}
          data-ppl-tab={k}
        >
          {label}
          {k === "ai" && c.locked ? <LuLock size={13} aria-hidden /> : null}
          {k === "apps" && c.counts.issues ? (
            <span className="pk-alert-dot" />
          ) : null}
        </PkGlass>
      ))}
    </div>
  );

  const chips = connectionChips(c.items);
  const appsTab = (
    <PhoneState query={query} screen="connections">
      <label className="ppl-search pk-glass is-round">
        <LuSearch size={16} aria-hidden />
        <input
          type="search"
          value={c.q}
          onChange={(e) => c.setQ(e.target.value)}
          placeholder="Search apps"
          aria-label="Search apps and services"
          enterKeyHint="search"
          autoComplete="off"
          data-ppl-search=""
        />
        {c.q ? (
          <button
            type="button"
            className="ppl-search-x"
            aria-label="Clear search"
            onClick={() => c.setQ("")}
          >
            <LuX size={14} aria-hidden />
          </button>
        ) : null}
      </label>
      <PkChips className="ppl-chips" label="Categories">
        {chips.map((chip) => {
          const on = chipPressed(chip.id, c);
          return (
            <PkGlass
              key={chip.id}
              as="button"
              round
              className={pkCx("ppl-chip", on && "is-on")}
              aria-pressed={on}
              onClick={() => {
                const next = pickChip(chip.id, c);
                c.setChip(next.chip);
                c.setShow(next.show);
              }}
              data-ppl-chip={chip.id}
            >
              {chip.label}
            </PkGlass>
          );
        })}
      </PkChips>
      {down.length ? (
        <PkSection
          title="Needs you"
          tone="late"
          count={down.length}
          className="ppl-sec"
        >
          {down.map(row)}
        </PkSection>
      ) : null}
      {groups.map((g) => (
        <PkSection
          key={g.id}
          title={g.label}
          count={g.items.length}
          className="ppl-sec"
        >
          {g.items.map(row)}
        </PkSection>
      ))}
      {!c.shown.length ? (
        <PkEmpty
          line={
            c.q.trim()
              ? `Nothing matches “${c.q.trim()}”.`
              : c.show === "connected"
                ? "Nothing is connected yet."
                : "Try another word or category."
          }
          action={
            <PkButton
              kind="chip"
              onClick={() => {
                c.setQ("");
                c.setChip("all");
                c.setShow("all");
              }}
              data-ppl-clear=""
            >
              Show all
            </PkButton>
          }
        />
      ) : null}
    </PhoneState>
  );

  const aiTab = c.locked ? (
    <PkGlass className="ppl-promo" data-ppl-ai-promo="">
      <PkHueTile icon={<LuLock size={18} aria-hidden />} size={40} />
      <span className="ppl-promo-title">Bring Needt into your AI tools</span>
      <span className="ppl-promo-line">
        Your tasks, calendar and notes {"—"} right where you already ask
        questions.
      </span>
      <PkButton
        kind="primary"
        block
        onClick={() => openPaywall("AI tools")}
        data-ppl-promo-try=""
      >
        Try Pro free for {P.trialDays} days
      </PkButton>
      <PkButton block onClick={() => openPaywall()} data-ppl-promo-plans="">
        See plans
      </PkButton>
    </PkGlass>
  ) : (
    <div className="ppl-list" data-ppl-ai-list="">
      <span className="ppl-row-meta">
        Needt MCP — use your tasks, calendar and notes in your favourite AI.
      </span>
      {visibleTools(c).map((id) => {
        const ready = toolAvailable(id, c.mcp.oauthUrl);
        const on = appsFor(id, c.mcp.apps ?? []).length > 0;
        return (
          <PplRow
            key={id}
            lead={<PplTile slug={id} />}
            title={AI_META[id].label}
            meta={
              on
                ? "Connected"
                : ready
                  ? AI_META[id].kind
                  : "Sign-in link opens soon"
            }
            tone={on ? "on" : null}
            action={
              <PkButton
                kind="chip"
                disabled={!ready}
                onClick={() => c.setSetup(id)}
                data-ppl-ai-connect={id}
              >
                {on ? "Steps" : "Connect"}
              </PkButton>
            }
            data={{ "data-ppl-ai": id }}
          />
        );
      })}
      {(c.mcp.apps ?? []).map((a) => (
        <PplRow
          key={a.id}
          title={a.clientName}
          meta={`Connected app · last used ${
            a.lastUsedAt ? new Date(a.lastUsedAt).toLocaleDateString() : "never"
          }`}
          action={
            <PkButton
              kind="chip"
              onClick={() => void c.mcp.disconnectApp(a)}
              data-ppl-app-bye={a.id}
            >
              Disconnect
            </PkButton>
          }
          data={{ "data-ppl-app": a.id }}
        />
      ))}
      {!(c.mcp.apps ?? []).length ? (
        <span className="ppl-row-meta" data-ppl-ai-empty="">
          No AI tools connected yet. Pick one above and follow its steps.
        </span>
      ) : null}
    </div>
  );

  const closeAcct = () => setAcctKey(null);
  const aBusy = !!A && c.busy === A.key;
  const aMeta = A
    ? A.state === "connected"
      ? (A.account ?? A.name)
      : A.state === "disconnected"
        ? (A.detail ?? "Lost access")
        : (CATEGORY_LABEL[A.category] ?? A.category)
    : null;

  return (
    <>
      <PkScreen
        screen="connections"
        title="Connections"
        glyph="connections"
        sub={connectionsSub(c.items, c.tab, loaded, c.mcp.apps?.length ?? 0)}
        head={tabs}
        onPull={{
          search: (q) => connectionHits(c.items, q),
          onPick: (h) => {
            c.pickTab("apps");
            setAcctKey(h.id);
          },
          placeholder: "Search",
          hint: "Any app by name. Pick one to see what it does and connect it.",
        }}
      >
        {c.tab === "apps" ? appsTab : aiTab}
      </PkScreen>

      {/* one account: what it gives, its status, its actions */}
      <PkSheet
        open={!!acctNow}
        onClose={closeAcct}
        title={A?.name ?? ""}
        label={A?.name ?? "Account"}
        className="ppl-acct"
        meta={aMeta}
        head={
          A ? (
            <span className="ppl-sheet-tile">
              <PplTile slug={A.slug} size={44} />
            </span>
          ) : null
        }
        footer={
          !A ? null : A.state === "connected" ? (
            <PkButton
              className="ppl-danger-q"
              disabled={aBusy}
              onClick={() => c.setConfirm(A)}
              data-ppl-disconnect={A.slug}
            >
              Disconnect
            </PkButton>
          ) : (
            <PkButton
              kind="primary"
              disabled={aBusy}
              onClick={() => {
                closeAcct();
                void c.connect(A);
              }}
              data-ppl-acct-connect=""
            >
              {A.state === "disconnected" ? "Reconnect" : "Connect"}
            </PkButton>
          )
        }
      >
        {A ? (
          <div className="ppl-acct-body">
            <p className="ppl-gives">{A.description}</p>
            <div className="ppl-glist">
              <div className="ppl-kv">
                <span>Status</span>
                <span
                  className={`ppl-kv-v is-${A.state}`}
                  data-ppl-status={A.state}
                >
                  {statusWord(A.state, aBusy)}
                </span>
              </div>
              {A.account ? (
                <div className="ppl-kv">
                  <span>Account</span>
                  <span className="ppl-kv-v">{A.account}</span>
                </div>
              ) : null}
              <div className="ppl-kv">
                <span>Kind</span>
                <span className="ppl-kv-v">
                  {CATEGORY_LABEL[A.category] ?? A.category}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </PkSheet>

      <PkSheet
        open={!!c.confirm}
        onClose={() => c.setConfirm(null)}
        className="ppl-confirm"
        title={C ? disconnectTitle(C) : ""}
        meta={C ? disconnectText(C) : null}
        footer={
          <>
            <PkButton onClick={() => c.setConfirm(null)}>Cancel</PkButton>
            <PkButton
              kind="primary"
              className="ppl-danger"
              disabled={!!C && c.busy === C.key}
              onClick={() => {
                if (!C) return;
                // the account sheet behind it closes once the write is done
                void c.disconnect(C).then(closeAcct);
              }}
              data-ppl-bye=""
            >
              Disconnect
            </PkButton>
          </>
        }
      />

      <PkSheet
        open={!!c.setup}
        onClose={() => c.setSetup(null)}
        detents={[0.92]}
        title="Connect an AI tool"
        label="Connect an AI tool"
        className="ppl-acct"
        footer={
          <PkButton
            kind="primary"
            onClick={() => {
              c.setSetup(null);
              void c.mcp.reload();
            }}
            data-ppl-ai-done=""
          >
            Done
          </PkButton>
        }
      >
        {c.setup ? <AiSetup id={c.setup} mcp={c.mcp} /> : null}
      </PkSheet>

      {/* Apple / iCloud takes a CalDAV login, as on the desktop */}
      <PkSheet
        open={c.caldav}
        onClose={() => c.setCaldav(false)}
        detents={[0.92]}
        title="Connect Apple / iCloud"
        label="Connect Apple / iCloud"
        className="ppl-acct"
      >
        {c.caldav ? (
          <CalDAVAccountForm
            onSuccess={c.caldavDone}
            onCancel={() => c.setCaldav(false)}
          />
        ) : null}
      </PkSheet>
    </>
  );
}
