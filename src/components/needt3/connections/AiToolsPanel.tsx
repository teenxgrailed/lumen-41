"use client";

import { FiLink2, FiPlus } from "react-icons/fi";

import { BrandIcon, brandIdFor } from "../brand";
import { GlassCard } from "../scenes";
import {
  AI_META,
  AI_TOOL_IDS,
  type AiToolId,
  appsFor,
  toolAvailable,
} from "./mcp";
import type { ConnectionsController } from "./useConnectionsController";
import type { ConnectedApp } from "./useMcpConnect";

const day = (v: string | null) =>
  v ? new Date(v).toLocaleDateString() : "never";
const SCOPE: Record<string, string> = {
  "needt.read": "read",
  "needt.write": "write",
  "mail.read": "mail",
};

/** Cards that match the search and the Connected / All apps toggle. */
export function visibleTools(
  c: Pick<ConnectionsController, "q" | "show" | "mcp">
) {
  const needle = c.q.trim().toLowerCase();
  return AI_TOOL_IDS.filter((id) => {
    const m = AI_META[id];
    if (
      needle &&
      !`${m.label} ${m.kind} ${m.gives}`.toLowerCase().includes(needle)
    )
      return false;
    return c.show === "all" || appsFor(id, c.mcp.apps ?? []).length > 0;
  });
}

export function AppRow({
  app,
  onDisconnect,
}: {
  app: ConnectedApp;
  onDisconnect: () => void;
}) {
  return (
    <div className="cn-app-row" data-cn-app={app.id}>
      <span className="cn-setup-col">
        <span className="cn-c-name">{app.clientName}</span>
        <span className="cn-meta">
          {app.scopes.map((s) => SCOPE[s] ?? s).join(", ")} · connected{" "}
          {day(app.connectedAt)} · last used {day(app.lastUsedAt)}
        </span>
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm"
        data-cn-app-bye={app.id}
        onClick={onDisconnect}
      >
        Disconnect
      </button>
    </div>
  );
}

function AiCard({
  id,
  i,
  c,
}: {
  id: AiToolId;
  i: number;
  c: ConnectionsController;
}) {
  const m = AI_META[id];
  const mine = appsFor(id, c.mcp.apps ?? []);
  const on = mine.length > 0;
  const ready = toolAvailable(id, c.mcp.oauthUrl);
  return (
    <GlassCard
      className="cn-c nx-swap"
      pad={18}
      radius={20}
      data-cn-card={id}
      data-state={on ? "connected" : "none"}
      style={{ animationDelay: `${i * 30}ms` }}
    >
      <div className="cn-c-head">
        <BrandIcon id={brandIdFor(id)} size={40} />
        <span className="cn-card-col">
          <span className="cn-card-row">
            <span className="cn-c-name">{m.label}</span>
            <span className="cn-badge">Beta</span>
          </span>
          <span className="cn-card-row-2">
            <span className="cn-c-kind">{on ? "Connected" : m.kind}</span>
          </span>
        </span>
      </div>
      <p className="cn-c-gives">{m.gives}</p>
      <div className="cn-c-foot">
        <span className="cn-card-col-2">
          {on ? (
            <span className="cn-card-text-2" data-cn-account="">
              Needt MCP
            </span>
          ) : !ready ? (
            <span className="cn-card-text-3" data-cn-soon="">
              Sign-in link opens soon
            </span>
          ) : null}
        </span>
        <button
          type="button"
          className="nx-btn nx-btn-secondary nx-btn-sm cn-card-btn-2"
          data-cn-connect={id}
          disabled={!ready}
          onClick={() => c.setSetup(id)}
        >
          <FiPlus size={13} aria-hidden />
          {on ? "Setup steps" : "Connect"}
        </button>
      </div>
    </GlassCard>
  );
}

/**
 * The AI tools tab (connections.jsx): the Needt MCP line, one card per tool
 * (Connect opens its numbered steps), then the apps that signed in. The
 * toggle is real: Connected keeps the tools with a signed-in app.
 */
export function AiToolsPanel({ c }: { c: ConnectionsController }) {
  const tools = visibleTools(c);
  const apps = (c.mcp.apps ?? []).filter(
    (a) =>
      !c.q.trim() ||
      a.clientName.toLowerCase().includes(c.q.trim().toLowerCase())
  );
  return (
    <>
      <p className="cn-explain nx-swap" data-cn-explain="">
        <span>
          <b>Needt MCP</b> — use your Needt tasks, calendar and notes in your
          favourite AI.
        </span>
        <span className="cn-badge">Beta</span>
      </p>
      {tools.length ? (
        <div className="cn-grid" data-cn-grid="ai" key={c.show + c.q}>
          {tools.map((id, i) => (
            <AiCard key={id} id={id} i={i} c={c} />
          ))}
        </div>
      ) : (
        <GlassCard
          className="cn-empty nx-swap"
          pad={0}
          radius={20}
          style={{ padding: "36px 24px" }}
          data-cn-ai-soon=""
        >
          <span className="cn-screen-grid">
            <FiLink2 size={18} aria-hidden />
          </span>
          <span className="cn-screen-text">
            {c.q.trim() ? "Nothing matches" : "No AI tools connected yet"}
          </span>
          <span className="cn-screen-text-2">
            {c.q.trim()
              ? "Check the spelling."
              : "Pick a tool under All apps and follow its steps."}
          </span>
        </GlassCard>
      )}
      {apps.length ? (
        <section className="cn-apps" data-cn-apps="">
          <span className="cn-sheet-title">Connected apps</span>
          <span className="cn-meta">
            Apps you allowed through Needt&apos;s sign-in. Disconnecting stops
            them at once.
          </span>
          {apps.map((a) => (
            <AppRow
              key={a.id}
              app={a}
              onDisconnect={() => void c.mcp.disconnectApp(a)}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}
