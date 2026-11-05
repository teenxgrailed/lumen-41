"use client";

import { useState } from "react";

import { FiAlertTriangle, FiLink2, FiSlash } from "react-icons/fi";

import { formatDayAgo } from "@/lib/date-utils";

import { BrandIcon, brandIdFor } from "../brand";
import { Sheet } from "../ctx/Sheet";
import { GlassCard } from "../scenes";
import { MoreMenu } from "./MoreMenu";
import type { ConnectedApp, McpConnect } from "./useMcpConnect";

/** What each scope lets an app do, as a chip. Unknown scopes show as sent. */
const SCOPE_CHIP: Record<string, string> = {
  "needt.read": "Read",
  "needt.write": "Write",
  "mail.read": "Mail",
  "needt.admin.read": "Admin read",
};

export function scopeChips(scopes: readonly string[]): string[] {
  return [...new Set(scopes.map((s) => SCOPE_CHIP[s] ?? s))];
}

/** "Connected 17 Oct · Used today" (or "· Not used yet"). */
export function appDates(
  app: Pick<ConnectedApp, "connectedAt" | "lastUsedAt">,
  now?: Date
): string {
  const day = (v: string) => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : formatDayAgo(d, now);
  };
  const made = day(app.connectedAt);
  const used = app.lastUsedAt ? day(app.lastUsedAt) : null;
  return [
    made ? `Connected ${made}` : null,
    used ? `Used ${used}` : "Not used yet",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The short form for a narrow row: "Used today" / "Not used yet". */
export function appUsed(
  app: Pick<ConnectedApp, "lastUsedAt">,
  now?: Date
): string {
  const d = app.lastUsedAt ? new Date(app.lastUsedAt) : null;
  return d && !isNaN(d.getTime())
    ? `Used ${formatDayAgo(d, now)}`
    : "Not used yet";
}

/** The mark an app wears: the first known brand in its name ("Claude Desktop"). */
export function appBrand(name: string) {
  return (
    brandIdFor(name) ??
    name
      .split(/[\s._-]+/)
      .map((w) => brandIdFor(w))
      .find(Boolean) ??
    null
  );
}

function AppRow({
  app,
  onDisconnect,
}: {
  app: ConnectedApp;
  onDisconnect: () => void;
}) {
  return (
    <li className="cn-app-row" data-cn-app={app.id}>
      <BrandIcon id={appBrand(app.clientName)} size={32} />
      <span className="cn-app-col">
        <span className="cn-app-line">
          <span className="cn-c-name">{app.clientName}</span>
          <span className="cn-app-scopes" aria-label="Permissions">
            {scopeChips(app.scopes).map((s) => (
              <span key={s} className="cn-scope" data-cn-scope={s}>
                {s}
              </span>
            ))}
          </span>
        </span>
        <span className="cn-c-kind" data-cn-app-dates="">
          {appDates(app)}
        </span>
      </span>
      <MoreMenu
        label={`Options for ${app.clientName}`}
        id={`app-${app.id}`}
        items={[
          {
            key: "bye",
            label: "Disconnect…",
            icon: <FiSlash size={15} aria-hidden />,
            danger: true,
            attrs: { "data-cn-app-bye": app.id },
            run: onDisconnect,
          },
        ]}
      />
    </li>
  );
}

/**
 * Apps that signed in through Needt's own OAuth (Claude, Cursor, ChatGPT…):
 * one glass panel, a row per app with its mark, its permissions as chips and
 * when it connected and was last used. Disconnect sits in the "…" menu and
 * asks first, as on the service cards. Loading, failed and empty each have
 * their own state, so the section never just disappears.
 */
export function ConnectedApps({
  mcp,
  query,
}: {
  mcp: McpConnect;
  /** The screen's search text: narrows the rows. */
  query: string;
}) {
  const [bye, setBye] = useState<ConnectedApp | null>(null);
  const [going, setGoing] = useState(false);
  const needle = query.trim().toLowerCase();
  const all = mcp.apps;
  const apps = (all ?? []).filter(
    (a) => !needle || a.clientName.toLowerCase().includes(needle)
  );
  // A search that matches no app hides the section; the tool cards answer it.
  if (needle && all?.length && !apps.length) return null;

  const body =
    all === null ? (
      <ul className="cn-app-list" aria-busy="true" data-cn-apps-loading="">
        {[0, 1].map((k) => (
          <li key={k} className="cn-app-row" aria-hidden="true">
            <span className="cn-app-skel cn-app-skel-icon" />
            <span className="cn-app-col">
              <span className="cn-app-skel" style={{ width: 120 }} />
              <span className="cn-app-skel" style={{ width: 180 }} />
            </span>
          </li>
        ))}
      </ul>
    ) : mcp.failed && !all.length ? (
      <div className="cn-app-note" role="alert" data-cn-apps-failed="">
        <FiAlertTriangle size={15} aria-hidden />
        <span className="cn-app-col">
          <span className="cn-c-name">Could not load connected apps</span>
          <span className="cn-c-kind">
            Check your connection and try again.
          </span>
        </span>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm"
          data-cn-apps-retry=""
          onClick={() => void mcp.reload()}
        >
          Try again
        </button>
      </div>
    ) : !apps.length ? (
      <div className="cn-app-note" data-cn-apps-empty="">
        <FiLink2 size={15} aria-hidden />
        <span className="cn-app-col">
          <span className="cn-c-name">No apps signed in yet</span>
          <span className="cn-c-kind">
            Connect Claude, ChatGPT or Cursor above and it shows up here.
          </span>
        </span>
      </div>
    ) : (
      <ul className="cn-app-list">
        {apps.map((a) => (
          <AppRow key={a.id} app={a} onDisconnect={() => setBye(a)} />
        ))}
      </ul>
    );

  return (
    <section className="cn-apps-wrap" aria-labelledby="cn-apps-title">
      <GlassCard
        className="cn-apps nx-swap"
        pad={0}
        radius={20}
        data-cn-apps=""
      >
        <div className="cn-apps-head">
          <h2 id="cn-apps-title" className="cn-apps-title">
            Connected apps
          </h2>
          <span className="cn-c-kind">
            Apps you allowed through Needt&apos;s sign-in.
          </span>
        </div>
        {body}
      </GlassCard>
      <Sheet
        open={!!bye}
        onClose={() => setBye(null)}
        title={bye ? `Disconnect ${bye.clientName}?` : "Disconnect"}
        scrimClassName="nx-scrim cn-sheet-grid"
        className="nx-sheet cn-sheet-col"
        style={{ width: 400 }}
      >
        {bye ? (
          <>
            <div className="cn-confirm-col">
              <span className="cn-sheet-title">
                Disconnect {bye.clientName}?
              </span>
              <span className="cn-confirm-text">
                {bye.clientName} loses access to your Needt at once. To use it
                again, connect it and allow it again.
              </span>
            </div>
            <div className="cn-consent-row-5">
              <button
                type="button"
                className="nx-btn nx-btn-text"
                autoFocus
                onClick={() => setBye(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="nx-btn nx-btn-danger"
                data-cn-app-confirm={bye.id}
                disabled={going}
                onClick={async () => {
                  setGoing(true);
                  const ok = await mcp.disconnectApp(bye);
                  setGoing(false);
                  // A failure keeps the confirm open, the button live again.
                  if (ok) setBye(null);
                }}
              >
                Disconnect
              </button>
            </div>
          </>
        ) : null}
      </Sheet>
    </section>
  );
}
