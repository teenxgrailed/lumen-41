"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { FiMoreHorizontal, FiPlus, FiSlash, FiSliders } from "react-icons/fi";

import { newDate } from "@/lib/date-utils";
import { sendJson } from "@/lib/needt3/hooks/core";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import { ProLimit } from "../paywall/Pro";
import {
  AgAvatar,
  AgBtn,
  AgEmpty,
  AgRow,
  AgSection,
  shortWhen,
  useAgentHue,
} from "./AgParts";
import { AgentLimits, type AgentLimitsValue, limitsLine } from "./AgentLimits";
import { ConnectGuide } from "./ConnectGuide";
import { WebhooksSection } from "./WebhooksSection";

export interface HubAgentRow {
  id: string;
  name: string;
  kind: string;
  skills: string[];
  connection: string;
  openItems: number;
  heldItems: number;
  lastSeenAt: string | null;
  disabledAt?: string | null;
  disabled?: boolean;
  limits?: AgentLimitsValue | null;
  token: {
    preview: string;
    revoked: boolean;
    lastUsedAt: string | null;
  } | null;
}

export interface HubReservationRow {
  id: string;
  resource: string;
  holder: { id: string; name: string };
  reason: string;
  exclusive: boolean;
  expiresAt: string;
}

type Run = (task: () => Promise<unknown>, done?: string) => Promise<void>;

export type AgentState = "working" | "idle" | "offline";

/** Seen in the last 10 minutes with a live token. */
export function agentSeen(agent: HubAgentRow, now = newDate().getTime()) {
  if (agent.disabledAt || agent.disabled || agent.token?.revoked) return false;
  if (!agent.lastSeenAt) return false;
  return now - newDate(agent.lastSeenAt).getTime() < 10 * 60_000;
}

/**
 * Working: the assignee of an item in progress, or holding a reservation
 * (integrator, 05.11.26). Idle: seen in the last 10 minutes. Offline: the rest.
 */
export function agentState(
  agent: HubAgentRow,
  working: Set<string>
): AgentState {
  if (agent.disabledAt || agent.disabled || agent.token?.revoked)
    return "offline";
  if (working.has(agent.id)) return "working";
  return agentSeen(agent) ? "idle" : "offline";
}

const STATE_LABEL: Record<AgentState, string> = {
  working: "Working",
  idle: "Idle",
  offline: "Offline",
};

function stateLabel(agent: HubAgentRow, state: AgentState) {
  if (agent.disabledAt || agent.disabled) return "Disabled";
  if (agent.token?.revoked) return "Token revoked";
  if (state === "offline" && !agent.lastSeenAt) return "Not seen yet";
  return STATE_LABEL[state];
}

/**
 * The "…" menu of a card: a small popover in the card, Escape or a click
 * away closes it, Up and Down move between its items.
 */
function CardMenu({
  name,
  items,
}: {
  name: string;
  items: {
    id: string;
    label: string;
    icon: ReactNode;
    danger?: boolean;
    run: () => void;
  }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    box.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
      btn.current?.focus();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = Array.from(
      e.currentTarget.querySelectorAll<HTMLElement>("[role=menuitem]")
    );
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === "ArrowDown"
        ? (at + 1) % all.length
        : (at - 1 + all.length) % all.length;
    all[next]?.focus();
  };
  if (!items.length) return null;
  return (
    <span ref={box} className="cn-card-text ag-menu">
      <button
        ref={btn}
        type="button"
        className="cn-iconbtn"
        aria-label={`Options for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-ag-more={name}
        onClick={() => setOpen(!open)}
      >
        <FiMoreHorizontal size={16} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="nx-pop is-right cn-menu-box ag-menu-pop"
          onKeyDown={onKey}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={"cn-mi" + (item.danger ? " is-danger" : "")}
              data-ag-menu-item={item.id}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
            >
              <span className="cn-menu-row">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}

function AgentCard({
  agent,
  i,
  state,
  now,
  focused,
  run,
}: {
  agent: HubAgentRow;
  i: number;
  state: AgentState;
  /** What it works on now, from the overview. */
  now: string | null;
  focused: boolean;
  run: Run;
}) {
  const [limitsOpen, setLimitsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hue = useAgentHue()(agent.id);
  useEffect(() => {
    if (!focused) return;
    ref.current?.scrollIntoView?.({ block: "center" });
    ref.current?.focus({ preventScroll: true });
  }, [focused]);
  const limits = limitsLine(agent.limits ?? null).trim();
  const cap = agent.limits?.maxInProgress ?? null;
  const canRevoke = Boolean(agent.token && !agent.token.revoked);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className={"ag-card nx-swap" + (focused ? " is-focused" : "")}
      data-ag-card={agent.id}
      data-ag-state={state}
      style={
        {
          "--c": hue,
          animationDelay: `${Math.min(i, 12) * 30}ms`,
        } as CSSProperties
      }
    >
      <div className="ag-card-top">
        <AgAvatar name={agent.name} hue={hue} />
        <span className="ag-card-name">
          <b>{agent.name}</b>
          <span>{`${agent.kind} · ${agent.connection}`}</span>
        </span>
        <CardMenu
          name={agent.name}
          items={[
            {
              id: "limits",
              label: limitsOpen ? "Hide limits" : "Limits",
              icon: <FiSliders size={15} aria-hidden />,
              run: () => setLimitsOpen(!limitsOpen),
            },
            ...(canRevoke
              ? [
                  {
                    id: "revoke",
                    label: "Revoke token",
                    icon: <FiSlash size={15} aria-hidden />,
                    danger: true,
                    run: () =>
                      void run(
                        () =>
                          sendJson(
                            `/api/agent-hub/agents/${agent.id}`,
                            "DELETE"
                          ),
                        "Token revoked"
                      ),
                  },
                ]
              : []),
          ]}
        />
      </div>
      <span className="ag-stat" data-ag-stat={state}>
        <i
          className={state === "working" ? "ag-dotc is-live" : "ag-dotc"}
          aria-hidden="true"
          style={
            state === "offline"
              ? { background: "rgba(246,245,250,.3)" }
              : undefined
          }
        />
        {stateLabel(agent, state)}
      </span>
      <p className="ag-card-now">
        {now ??
          (state === "working" ? "Holding a resource" : "Nothing in hand")}
        <span>
          {`Skills: ${agent.skills.join(", ") || "none"} · seen ${shortWhen(
            agent.lastSeenAt
          )}`}
        </span>
      </p>
      {/* //todo: the reference draws a sparkline of the agent's activity; the
          overview has no per-agent series yet (needs ?graph=1 counts). */}
      {limitsOpen ? (
        <div className="ag-card-limits">
          <AgentLimits
            limits={agent.limits ?? null}
            onSave={(body) =>
              run(
                () =>
                  sendJson(`/api/agent-hub/agents/${agent.id}`, "PATCH", {
                    limits: body,
                  }),
                body ? "Limits saved" : "Limits removed"
              )
            }
          />
        </div>
      ) : null}
      <div className="ag-card-foot" data-ag-limits-line="">
        <span>{`${agent.openItems} open · ${agent.heldItems} held`}</span>
        {cap ? (
          <span
            className="ag-load"
            role="img"
            aria-label={`${agent.heldItems} of ${cap} at once`}
          >
            <i
              style={{
                width: `${Math.min(100, (agent.heldItems / cap) * 100)}%`,
              }}
            />
          </span>
        ) : (
          <span className="ag-load-sp" />
        )}
        <span className="ag-card-lim">
          {limits ||
            (agent.token ? `token ${agent.token.preview}` : "No limits")}
        </span>
      </div>
    </div>
  );
}

/**
 * The Agents tab: one glass card per agent in a 3 / 2 / 1 grid, the dashed
 * card that connects a new one (a named token, or the guide), then webhooks
 * and what agents hold right now. The view chips and search live on the
 * screen's sticky bar.
 */
export function AgentsTab({
  agents,
  reservations,
  working,
  nowOf,
  view,
  q,
  counted,
  focusAgent,
  showGuide,
  onGuide,
  run,
}: {
  agents: HubAgentRow[];
  reservations: HubReservationRow[];
  working: Set<string>;
  nowOf: Map<string, string>;
  view: AgentState | "all";
  q: string;
  counted: number;
  focusAgent: string | null;
  showGuide: boolean;
  onGuide: (open: boolean) => void;
  run: Run;
}) {
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(
    null
  );
  const create = () =>
    run(async () => {
      const made = await sendJson<{ token: string; agent: { name: string } }>(
        "/api/agent-hub/agents",
        "POST",
        { name: name.trim() }
      );
      setFresh({ name: made.agent.name, token: made.token });
      setName("");
    });
  const needle = q.trim().toLowerCase();
  const shown = agents.filter(
    (a) =>
      (view === "all" || agentState(a, working) === view) &&
      (!needle ||
        `${a.name} ${a.kind} ${a.skills.join(" ")}`
          .toLowerCase()
          .includes(needle))
  );

  return (
    <div className="ag-col" data-ag-agents="">
      <p className="ag-sky-hint">
        Each agent gets its own token. It is shown once and can be revoked.{" "}
        <ProLimit
          used={counted}
          max={PLAN_LIMITS.FREE.hubAgents}
          noun="agents"
          feature="unlimited agents"
        />
      </p>
      {fresh ? (
        <div className="ag-glass ag-fresh nx-swap">
          <div className="ag-token" data-ag-token="">
            <span className="ag-title">{`Token for ${fresh.name}`}</span>
            <code>{fresh.token}</code>
            <span className="ag-token-row">
              <span className="ag-meta">
                Copy it now. It is not shown again.
              </span>
              <AgBtn onClick={() => setFresh(null)}>Done</AgBtn>
            </span>
          </div>
        </div>
      ) : null}
      <div className="ag-grid" data-ag-grid="">
        {shown.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            i={i}
            state={agentState(agent, working)}
            now={nowOf.get(agent.id) ?? null}
            focused={focusAgent === agent.id}
            run={run}
          />
        ))}
        <div className="ag-card is-add nx-swap" data-ag-new-agent="">
          <span className="ag-plus" aria-hidden="true">
            <FiPlus size={18} />
          </span>
          <b>Connect an agent</b>
          <span className="ag-card-add-line">
            Name it, make a token, paste it into the agent.
          </span>
          <form
            className="ag-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void create();
            }}
          >
            <input
              className="nt-input"
              aria-label="Agent name"
              value={name}
              maxLength={60}
              placeholder="New agent name"
              onChange={(e) => setName(e.target.value)}
            />
            <button
              type="submit"
              className="nx-btn nx-btn-secondary nx-btn-sm"
              disabled={!name.trim()}
            >
              Create token
            </button>
          </form>
          <button
            type="button"
            className="nx-btn nx-btn-sm nx-btn-text"
            aria-pressed={showGuide}
            onClick={() => onGuide(!showGuide)}
          >
            {showGuide ? "Hide the guide" : "Show me how"}
          </button>
        </div>
      </div>
      {agents.length > 0 && shown.length === 0 ? (
        <AgEmpty
          art="stack"
          title="No agents match"
          line="Try another view or clear the search."
        />
      ) : null}
      {showGuide ? <ConnectGuide onClose={() => onGuide(false)} /> : null}
      <WebhooksSection />
      {reservations.length > 0 ? (
        <AgSection
          title="Reserved now"
          hint="Resources agents hold so they stay out of each other's way. They expire on their own."
        >
          {reservations.map((r) => (
            <AgRow
              key={r.id}
              title={r.resource}
              meta={`${r.holder.name}${r.exclusive ? "" : ", shared"}, until ${shortWhen(
                r.expiresAt
              )}. ${r.reason}`}
            />
          ))}
        </AgSection>
      ) : null}
    </div>
  );
}
