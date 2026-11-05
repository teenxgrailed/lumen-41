"use client";

import { FiCheckCircle, FiLink2, FiPlus } from "react-icons/fi";

import { BrandIcon, brandIdFor } from "../brand";
import { GlassCard } from "../scenes";
import { ConnectedApps } from "./ConnectedApps";
import {
  AI_META,
  AI_TOOL_IDS,
  type AiToolId,
  appsFor,
  toolAvailable,
} from "./mcp";
import type { ConnectionsController } from "./useConnectionsController";

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
          </span>
          <span className="cn-card-row-2">
            {on ? (
              <span className="cn-pill" data-cn-pill="connected">
                <FiCheckCircle size={12} aria-hidden />
                Connected
              </span>
            ) : (
              <span className="cn-c-kind">{m.kind}</span>
            )}
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
  return (
    <>
      <p className="cn-explain nx-swap" data-cn-explain="">
        <span>
          <b>Needt MCP</b> — use your Needt tasks, calendar and notes in your
          favourite AI.
        </span>
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
      <ConnectedApps mcp={c.mcp} query={c.q} />
    </>
  );
}
