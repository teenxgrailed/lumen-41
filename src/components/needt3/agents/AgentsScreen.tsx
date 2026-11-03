"use client";

import { useEffect, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { formatDateToLocal, newDate } from "@/lib/date-utils";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import { ProGate, ProLimit, useIsPro } from "../paywall/Pro";
import { PlaceHeader } from "../places/PlaceHeader";
import { MemoriesGroup } from "../settings/MemoriesGroup";
import { Segmented } from "../shell/Segmented";
import { StScreen } from "../states/StScreen";
import { ActivityTab } from "./ActivityTab";
import { AgBtn, AgEmpty, AgRow, AgSection, type AgTone } from "./AgParts";
import { AgentLimits, type AgentLimitsValue, limitsLine } from "./AgentLimits";
import { ConnectGuide } from "./ConnectGuide";
import { ItemFiles } from "./ItemFiles";
import { MessagesTab, useHubThreads } from "./MessagesTab";
import { WebhooksSection } from "./WebhooksSection";
import { hasUnconfirmedRisk } from "./unconfirmed-risk";

type Named = { id?: string; name?: string; kind?: string } | "any" | null;

interface HubEvent {
  at: string;
  type: string;
  message: string | null;
  actor: { kind: string; name?: string } | null;
}

interface HubRelation {
  kind: string;
  /** out: this item is the source (it blocks, is the parent of, ...). */
  direction: "out" | "in";
  item: { id: string; title: string; status: string };
}

interface HubRecurrenceRow {
  id: string;
  state: "active" | "paused" | "ended";
  /** Plain-language schedule, for example "every week on Monday at 09:00". */
  repeats: string;
  timezone: string;
  nextRunAt: string | null;
  allowOverlap: boolean;
  lastSkip: { reason: string; message: string; at: string } | null;
}

interface HubItemRow {
  id: string;
  title: string;
  status: string;
  /** Set when the item was opened by a recurrence (or is its first occurrence). */
  recurrenceId?: string | null;
  goal: string;
  doneCriteria: string;
  /** The done-criteria as a checklist; `met` is null until the item is done. */
  criteria?: { text: string; met: boolean | null }[];
  relations?: HubRelation[];
  blockedBy?: string[];
  /** Held for over four hours with no update. */
  stale?: boolean;
  usage?: {
    tokens: number | null;
    costUsd: number | null;
    minutes: number | null;
  } | null;
  risks: string[];
  approvals: Record<string, unknown>;
  /** Flagged as a big job; agents limited to smaller work wait for approval. */
  large?: boolean;
  largeApproved?: boolean;
  assignee: Named;
  heldBy: { name: string } | null;
  leaseExpiresAt: string | null;
  leaseExpired: boolean;
  question: string | null;
  noCapableAgent: boolean;
  /** An alert on this item the owner has not opened yet. */
  ownerUnread: boolean;
  result: { summary?: string } | null;
  latestEvent: HubEvent | null;
  events?: HubEvent[];
  updatedAt: string;
}

interface HubAgentRow {
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

interface HubNoteRow {
  id: string;
  text: string;
  tags: string[];
  author: { kind: string; name?: string };
  ownerEdited: boolean;
  updatedAt: string;
}

interface HubReservationRow {
  id: string;
  resource: string;
  holder: { id: string; name: string };
  reason: string;
  exclusive: boolean;
  expiresAt: string;
}

interface Overview {
  agents: HubAgentRow[];
  items: HubItemRow[];
  notes: HubNoteRow[];
  reservations?: HubReservationRow[];
}

const STATUS_ORDER = [
  "needs_owner",
  "in_progress",
  "claimed",
  "blocked",
  "open",
  "failed",
  "done",
  "cancelled",
] as const;

const STATUS_LABEL: Record<string, string> = {
  needs_owner: "Needs you",
  in_progress: "In progress",
  claimed: "Claimed",
  blocked: "Blocked",
  open: "Open",
  failed: "Failed",
  done: "Done",
  cancelled: "Cancelled",
};

function when(iso: string | null | undefined) {
  if (!iso) return "never";
  return formatDateToLocal(newDate(iso));
}

const RELATION_OUT: Record<string, string> = {
  blocks: "Blocks",
  parent: "Parent of",
  relates: "Relates to",
  duplicates: "Duplicates",
  supersedes: "Supersedes",
};

const RELATION_IN: Record<string, string> = {
  blocks: "Blocked by",
  parent: "Part of",
  relates: "Relates to",
  duplicates: "Duplicated by",
  supersedes: "Superseded by",
};

function relationLine(relation: HubRelation) {
  const label = (relation.direction === "out" ? RELATION_OUT : RELATION_IN)[
    relation.kind
  ];
  const status = STATUS_LABEL[relation.item.status] ?? relation.item.status;
  return `${label ?? relation.kind}: ${relation.item.title} (${status})`;
}

function usageLine(usage: NonNullable<HubItemRow["usage"]>) {
  const parts = [
    usage.tokens != null ? `${usage.tokens.toLocaleString("en")} tokens` : "",
    usage.costUsd != null ? `$${usage.costUsd.toFixed(2)}` : "",
    usage.minutes != null ? `${usage.minutes} min` : "",
  ].filter(Boolean);
  return parts.length ? `Usage: ${parts.join(", ")}` : "";
}

/** The recurrences of the workspace, shared by the rows and the detail line. */
function useRecurrences() {
  return useQuery({
    queryKey: ["agent-hub", "recurrences"],
    queryFn: () =>
      fetchJson<{ recurrences: HubRecurrenceRow[] }>(
        "/api/agent-hub/recurrences"
      ),
    select: (data) => new Map(data.recurrences.map((r) => [r.id, r])),
  });
}

function repeatsLine(recurrence: HubRecurrenceRow) {
  const parts = [`Repeats ${recurrence.repeats} (${recurrence.timezone})`];
  if (recurrence.state === "paused") parts.push("paused");
  else if (recurrence.state === "ended") parts.push("ended");
  else if (recurrence.nextRunAt) {
    parts.push(`next run ${when(recurrence.nextRunAt)}`);
  }
  return parts.join(", ");
}

function latest(item: HubItemRow) {
  const event = item.latestEvent;
  if (!event) return "No updates yet";
  const who = event.actor?.name ?? event.actor?.kind ?? "system";
  return `${who}: ${event.message ?? event.type.replace(/_/g, " ")}`;
}

type Tab = "agents" | "tasks" | "messages" | "activity" | "memory";

const TAB_IDS: readonly Tab[] = [
  "agents",
  "tasks",
  "messages",
  "activity",
  "memory",
];

const ACTIVE = ["open", "claimed", "in_progress", "blocked", "needs_owner"];

/**
 * The Agents screen: the agent hub, kept apart from the person's own tasks.
 * Five tabs. Agents (who is connected, their tokens, what they have reserved),
 * Agent tasks (work the agents hand each other, and what waits for you),
 * Messages (threads between agents and to you), Activity (what happened
 * across all items, newest first), Memory (two layers on one
 * screen: "About you", what the assistant learned about you, and "Agent
 * notes", what agents wrote for each other).
 *
 * `?item=<id>` opens one item: a push or the nav badge deep-links here, and
 * opening it marks its alert as read. `?thread=<id>` does the same for a message.
 */
export function AgentsScreen() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const itemParam = params.get("item");
  const tabParam = params.get("tab");
  const threadParam = params.get("thread");
  const [tab, setTab] = useState<Tab>(
    threadParam
      ? "messages"
      : itemParam
        ? "tasks"
        : TAB_IDS.includes(tabParam as Tab)
          ? (tabParam as Tab)
          : "agents"
  );
  const [focusId, setFocusId] = useState<string | null>(itemParam);
  const [archived, setArchived] = useState(false);
  const [tag, setTag] = useState("");
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<{ name: string; token: string } | null>(
    null
  );
  const [open, setOpen] = useState<string | null>(null);
  // Only a manual choice lives in state; otherwise the guide follows the data.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(
    null
  );

  const key = ["agent-hub", archived, tag] as const;
  const overview = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJson<Overview>(
        `/api/agent-hub/overview?includeArchived=${archived}${
          tag ? `&tag=${encodeURIComponent(tag)}` : ""
        }`
      ),
    refetchInterval: 15_000,
  });

  const threads = useHubThreads();

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["agent-hub"] }),
      qc.invalidateQueries({ queryKey: qk.agentHubNav() }),
    ]);
  const [limitsFor, setLimitsFor] = useState<string | null>(null);

  const run = async (task: () => Promise<unknown>, done?: string) => {
    try {
      await task();
      if (done) notify.success(done);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed");
    }
  };

  /** Opening an item reads its alert: the badge on Agents counts it down. */
  const markSeen = (id: string) =>
    sendJson(`/api/agent-hub/items/${id}/seen`, "POST", {})
      .then(refresh)
      .catch(() => undefined);

  // Arriving from a push or the badge: the item's alert is read once it shows.
  const seenFor = useRef<string | null>(null);
  const target = overview.data?.items.find((i) => i.id === itemParam);
  useEffect(() => {
    if (!itemParam || !target || seenFor.current === itemParam) return;
    seenFor.current = itemParam;
    if (target.ownerUnread) void markSeen(itemParam);
    // markSeen only reads stable query-client handles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemParam, target]);

  const createToken = () =>
    run(async () => {
      const made = await sendJson<{ token: string; agent: { name: string } }>(
        "/api/agent-hub/agents",
        "POST",
        { name: name.trim() }
      );
      setFresh({ name: made.agent.name, token: made.token });
      setName("");
    });

  const { agents, items, notes } = overview.data ?? EMPTY;
  const showGuide =
    manualOpen ?? (overview.data !== undefined && agents.length === 0);
  const reservations = overview.data?.reservations ?? [];
  const threadRows = threads.data?.threads ?? [];
  const unreadThreads = threadRows.filter((t) => t.ownerUnread).length;
  // Waiting for you: an agent asked, or an alert is still unread.
  const needsYou = items.filter(
    (i) => i.status === "needs_owner" || (i.ownerUnread && isActive(i))
  );
  const focused = focusId ? items.find((i) => i.id === focusId) : undefined;
  // Free counts agents that are not disabled; Needt's own assistant is free.
  const countedAgents = agents.filter(
    (a) => !a.disabled && a.connection !== "Needt assistant"
  ).length;
  const openItems = items.filter(isActive).length;
  const tags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();

  const recurrences = useRecurrences().data;
  const pro = useIsPro();
  const repeatToggle = (item: HubItemRow) => {
    const recurrence = item.recurrenceId
      ? recurrences?.get(item.recurrenceId)
      : undefined;
    if (!recurrence || recurrence.state === "ended") return null;
    const action = recurrence.state === "active" ? "pause" : "resume";
    // Resuming a repeat is Pro (the server answers PLAN_LIMIT); pausing stays free.
    if (action === "resume" && !pro)
      return (
        <ProGate feature="recurring hub items">
          <AgBtn>Resume repeat</AgBtn>
        </ProGate>
      );
    return (
      <AgBtn
        onClick={() =>
          run(
            () =>
              sendJson(
                `/api/agent-hub/recurrences/${recurrence.id}/${action}`,
                "POST",
                {}
              ),
            action === "pause" ? "Repeat paused" : "Repeat resumed"
          )
        }
      >
        {action === "pause" ? "Pause repeat" : "Resume repeat"}
      </AgBtn>
    );
  };
  const itemRow = (item: HubItemRow) => (
    <AgRow
      key={item.id}
      title={item.title}
      tone={statusTone(item)}
      meta={itemMeta(item)}
      expanded={open === item.id}
      onToggle={() => {
        const next = open === item.id ? null : item.id;
        setOpen(next);
        if (next && item.ownerUnread) void markSeen(item.id);
      }}
      detail={<ItemDetail id={item.id} fallback={item} />}
      actions={
        isActive(item) || repeatToggle(item) ? (
          <>
            {repeatToggle(item)}
            {item.large && !item.largeApproved && isActive(item) ? (
              <AgBtn
                onClick={() =>
                  run(
                    () =>
                      sendJson(
                        `/api/agent-hub/items/${item.id}/approve-large`,
                        "POST",
                        {}
                      ),
                    "Large item approved"
                  )
                }
              >
                Approve large
              </AgBtn>
            ) : null}
            {isActive(item) ? (
              <AgBtn
                tone="danger"
                onClick={() =>
                  run(
                    () =>
                      sendJson(
                        `/api/agent-hub/items/${item.id}/cancel`,
                        "POST",
                        {}
                      ),
                    "Cancelled"
                  )
                }
              >
                Cancel
              </AgBtn>
            ) : null}
          </>
        ) : null
      }
    />
  );

  const attentionRow = (item: HubItemRow) => (
    <AgRow
      key={item.id}
      title={item.title}
      tone="accent"
      meta={
        item.question ??
        (item.noCapableAgent
          ? "No connected agent can do this yet. Connect one with the skills it needs, or cancel it."
          : "Waiting for your decision")
      }
      actions={
        <>
          {item.status === "needs_owner" ? (
            <span className="ag-answer">
              <input
                className="nt-input"
                aria-label="Your answer"
                value={answers[item.id] ?? ""}
                placeholder="Answer"
                onChange={(e) =>
                  setAnswers({ ...answers, [item.id]: e.target.value })
                }
              />
              <AgBtn
                disabled={!(answers[item.id] ?? "").trim()}
                onClick={() =>
                  run(
                    () =>
                      sendJson(
                        `/api/agent-hub/items/${item.id}/answer`,
                        "POST",
                        {
                          answer: answers[item.id],
                        }
                      ),
                    "Answered"
                  )
                }
              >
                Answer
              </AgBtn>
            </span>
          ) : null}
          {item.risks
            .filter((risk) => !item.approvals[risk])
            .map((risk) => (
              <AgBtn
                key={risk}
                onClick={() =>
                  run(
                    () =>
                      sendJson(
                        `/api/agent-hub/items/${item.id}/approve`,
                        "POST",
                        {
                          risks: [risk],
                        }
                      ),
                    `Approved ${risk}`
                  )
                }
              >
                {`Approve ${risk}`}
              </AgBtn>
            ))}
          {item.ownerUnread ? (
            <AgBtn tone="text" onClick={() => void markSeen(item.id)}>
              Mark as read
            </AgBtn>
          ) : null}
        </>
      }
    />
  );

  return (
    <div className="scroll-inner pl-page ag-page" data-v3-screen="agents">
      <PlaceHeader
        art="stack"
        title="Agents"
        meta="Agents and their work stay out of Today, Tasks and the Calendar"
        actions={
          <AgBtn
            pressed={showGuide}
            onClick={() => {
              setManualOpen(!showGuide);
              setTab("agents");
            }}
          >
            Connect an agent
          </AgBtn>
        }
      />
      <div className="ag-tabs">
        <Segmented
          label="Agents sections"
          value={tab}
          onChange={setTab}
          options={[
            { id: "agents", label: "Agents" },
            { id: "tasks", label: "Agent tasks", count: needsYou.length },
            { id: "messages", label: "Messages", count: unreadThreads },
            { id: "activity", label: "Activity" },
            { id: "memory", label: "Memory" },
          ]}
        />
      </div>

      <StScreen
        query={tab === "messages" ? threads : overview}
        kind="list"
        screen="agents"
      >
        {tab === "agents" ? (
          <>
            <AgSection
              title="Agents"
              hint={
                <>
                  Each agent gets its own token. It is shown once and can be
                  revoked.{" "}
                  <ProLimit
                    used={countedAgents}
                    max={PLAN_LIMITS.FREE.hubAgents}
                    noun="agents"
                    feature="unlimited agents"
                  />
                </>
              }
            >
              {fresh ? (
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
              ) : null}
              {agents.map((agent) => (
                <AgRow
                  key={agent.id}
                  title={agent.name}
                  tone={agentTone(agent)}
                  expanded={limitsFor === agent.id}
                  onToggle={() =>
                    setLimitsFor(limitsFor === agent.id ? null : agent.id)
                  }
                  detail={
                    <AgentLimits
                      limits={agent.limits ?? null}
                      onSave={(body) =>
                        run(
                          () =>
                            sendJson(
                              `/api/agent-hub/agents/${agent.id}`,
                              "PATCH",
                              { limits: body }
                            ),
                          body ? "Limits saved" : "Limits removed"
                        )
                      }
                    />
                  }
                  meta={`${agent.kind}, ${agent.connection}, skills: ${
                    agent.skills.join(", ") || "none"
                  }. ${agent.openItems} open, ${agent.heldItems} held. Last seen ${when(
                    agent.lastSeenAt
                  )}.${limitsLine(agent.limits ?? null)}${
                    agent.token
                      ? ` Token ${agent.token.preview}${
                          agent.token.revoked ? " (revoked)" : ""
                        }.`
                      : ""
                  }`}
                  actions={
                    agent.token && !agent.token.revoked ? (
                      <AgBtn
                        tone="danger"
                        onClick={() =>
                          run(
                            () =>
                              sendJson(
                                `/api/agent-hub/agents/${agent.id}`,
                                "DELETE"
                              ),
                            "Token revoked"
                          )
                        }
                      >
                        Revoke
                      </AgBtn>
                    ) : null
                  }
                />
              ))}
              <div className="ag-form">
                <input
                  className="nt-input"
                  aria-label="Agent name"
                  value={name}
                  maxLength={60}
                  placeholder="New agent name"
                  onChange={(e) => setName(e.target.value)}
                />
                <AgBtn disabled={!name.trim()} onClick={createToken}>
                  Create token
                </AgBtn>
              </div>
            </AgSection>
            {showGuide ? (
              <ConnectGuide
                onClose={manualOpen ? () => setManualOpen(false) : undefined}
              />
            ) : null}
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
                    meta={`${r.holder.name}${r.exclusive ? "" : ", shared"}, until ${when(
                      r.expiresAt
                    )}. ${r.reason}`}
                  />
                ))}
              </AgSection>
            ) : null}
          </>
        ) : null}

        {tab === "tasks" ? (
          <>
            {focused ? (
              <AgSection title="Opened from your alert">
                {itemRow(focused)}
                <div className="ag-footer">
                  <AgBtn tone="text" onClick={() => setFocusId(null)}>
                    Show everything
                  </AgBtn>
                </div>
              </AgSection>
            ) : null}

            {needsYou.length > 0 ? (
              <AgSection title="Needs you">
                {needsYou.map(attentionRow)}
              </AgSection>
            ) : null}

            {items.length > 0 ? (
              <p className="ag-hint">
                <ProLimit
                  used={openItems}
                  max={PLAN_LIMITS.FREE.hubOpenItems}
                  noun="open items"
                  feature="unlimited agent tasks"
                />
              </p>
            ) : null}

            {items.length === 0 ? (
              <AgEmpty
                art="task"
                title="Nothing here yet"
                line="Items agents create or receive show up here."
              />
            ) : (
              STATUS_ORDER.map((status) => {
                const rows = items.filter((i) => i.status === status);
                return rows.length ? (
                  <AgSection key={status} title={STATUS_LABEL[status]}>
                    {rows.map(itemRow)}
                  </AgSection>
                ) : null;
              })
            )}
            <div className="ag-footer">
              <AgBtn tone="text" onClick={() => setArchived(!archived)}>
                {archived ? "Hide items older than 14 days" : "Show older"}
              </AgBtn>
            </div>
          </>
        ) : null}

        {tab === "messages" ? (
          <MessagesTab threads={threadRows} focusId={threadParam} />
        ) : null}

        {tab === "activity" ? (
          <ActivityTab
            agents={agents}
            onOpenItem={(id) => {
              setFocusId(id);
              setTab("tasks");
            }}
          />
        ) : null}

        {tab === "memory" ? (
          <>
            <div className="ag-memory">
              <MemoriesGroup
                title="About you"
                hint="What Needt's assistant knows about you, so Ask and the planner fit you better. The same list as Settings, Memories."
              />
            </div>

            <AgSection
              title="Agent notes"
              hint="What agents leave for each other: decisions, facts about tools and accounts. Needt's assistant reads and writes them too. They are not about you."
            >
              {tags.length > 0 ? (
                <div className="ag-tags" role="group" aria-label="Tag">
                  <AgBtn
                    tone={tag ? "text" : "secondary"}
                    pressed={!tag}
                    onClick={() => setTag("")}
                  >
                    All
                  </AgBtn>
                  {tags.map((t) => (
                    <AgBtn
                      key={t}
                      tone={t === tag ? "secondary" : "text"}
                      pressed={t === tag}
                      onClick={() => setTag(t)}
                    >
                      {t}
                    </AgBtn>
                  ))}
                </div>
              ) : null}
              {notes.map((note) => (
                <AgRow
                  key={note.id}
                  title={
                    editing?.id === note.id ? (
                      <textarea
                        className="nt-input ag-textarea"
                        aria-label="Note text"
                        value={editing.text}
                        onChange={(e) =>
                          setEditing({ id: note.id, text: e.target.value })
                        }
                      />
                    ) : (
                      note.text
                    )
                  }
                  meta={`${note.author.name ?? "owner"}${
                    note.tags.length ? `, ${note.tags.join(", ")}` : ""
                  }${note.ownerEdited ? ", edited by you" : ""}`}
                  actions={
                    <>
                      {editing?.id === note.id ? (
                        <AgBtn
                          onClick={() =>
                            run(async () => {
                              await sendJson(
                                `/api/agent-hub/notes/${note.id}`,
                                "PATCH",
                                { text: editing.text }
                              );
                              setEditing(null);
                            }, "Note saved")
                          }
                        >
                          Save
                        </AgBtn>
                      ) : (
                        <AgBtn
                          onClick={() =>
                            setEditing({ id: note.id, text: note.text })
                          }
                        >
                          Edit
                        </AgBtn>
                      )}
                      <AgBtn
                        tone="danger"
                        onClick={() =>
                          run(
                            () =>
                              sendJson(
                                `/api/agent-hub/notes/${note.id}`,
                                "DELETE"
                              ),
                            "Note deleted"
                          )
                        }
                      >
                        Delete
                      </AgBtn>
                    </>
                  }
                />
              ))}
              {notes.length === 0 ? (
                <AgEmpty
                  art="page"
                  title="No notes yet"
                  line="Agents write what they learn here."
                />
              ) : null}
            </AgSection>
          </>
        ) : null}
      </StScreen>
    </div>
  );
}

const EMPTY: Overview = { agents: [], items: [], notes: [] };

function statusTone(item: HubItemRow): AgTone {
  if (item.status === "needs_owner" || item.ownerUnread) return "accent";
  if (item.status === "failed" || item.status === "blocked") return "danger";
  if (item.status === "in_progress" || item.status === "claimed") return "info";
  if (item.status === "done") return "success";
  return "muted";
}

/** Seen in the last 15 minutes with a live token: a success mark. */
function agentTone(agent: HubAgentRow): AgTone {
  if (agent.disabledAt || agent.token?.revoked || !agent.lastSeenAt)
    return "muted";
  const age = newDate().getTime() - newDate(agent.lastSeenAt).getTime();
  return age < 15 * 60_000 ? "success" : "muted";
}

function itemMeta(item: HubItemRow) {
  return (
    <>
      {item.ownerUnread ? <span className="ag-new">New </span> : null}
      {hasUnconfirmedRisk(item) ? (
        <span className="ag-flag" data-ag-no-confirmation="">
          no confirmation{" "}
        </span>
      ) : null}
      {`${latest(item)}${
        item.heldBy
          ? `. Held by ${item.heldBy.name} until ${when(item.leaseExpiresAt)}${
              item.leaseExpired ? " (expired)" : ""
            }`
          : ""
      }${item.noCapableAgent ? ". No capable agent" : ""}${
        item.blockedBy?.length ? `. Waiting on ${item.blockedBy.length}` : ""
      }${item.stale ? ". No update for over 4 hours" : ""}`}
    </>
  );
}

function isActive(item: HubItemRow) {
  return ACTIVE.includes(item.status);
}

/** The full event log of one item, fetched when its row opens. */
function ItemDetail({ id, fallback }: { id: string; fallback: HubItemRow }) {
  const detail = useQuery({
    queryKey: ["agent-hub", "item", id],
    queryFn: () =>
      sendJson<{ item: HubItemRow }>(
        `/api/agent-hub/items/${id}/detail`,
        "POST"
      ),
  });
  const item = detail.data?.item ?? fallback;
  const recurrence = useRecurrences().data?.get(item.recurrenceId ?? "");
  return (
    <>
      {recurrence ? (
        <span>
          <span className="ag-detail-k">{repeatsLine(recurrence)}</span>
          {recurrence.lastSkip
            ? ` Last skipped ${when(recurrence.lastSkip.at)}: ${recurrence.lastSkip.message}`
            : null}
        </span>
      ) : null}
      <span>
        <span className="ag-detail-k">Goal: </span>
        {item.goal}
      </span>
      {item.criteria?.length ? (
        <>
          <span className="ag-detail-k">Done when:</span>
          {item.criteria.map((entry, index) => (
            <span key={index}>
              {`${entry.met === null ? "Open" : entry.met ? "Met" : "Not met"}: ${entry.text}`}
            </span>
          ))}
        </>
      ) : (
        <span>
          <span className="ag-detail-k">Done when: </span>
          {item.doneCriteria}
        </span>
      )}
      {(item.relations ?? []).map((relation, index) => (
        <span key={index}>{relationLine(relation)}</span>
      ))}
      {hasUnconfirmedRisk(item) ? (
        <span>
          <span className="ag-detail-k">No confirmation: </span>
          no risk was declared, yet this item mentions sending, publishing,
          posting, deleting or paying. It could run without asking you.
        </span>
      ) : null}
      {item.usage && usageLine(item.usage) ? (
        <span>{usageLine(item.usage)}</span>
      ) : null}
      {item.result?.summary ? (
        <span>
          <span className="ag-detail-k">Result: </span>
          {item.result.summary}
        </span>
      ) : null}
      <ItemFiles id={id} />
      {(item.events ?? []).map((event, index) => (
        <span key={index} className="ag-detail-ev">
          <span>{when(event.at)}</span>
          <span>{`${event.actor?.name ?? event.actor?.kind ?? "system"}: ${
            event.message ?? event.type.replace(/_/g, " ")
          }`}</span>
        </span>
      ))}
    </>
  );
}
