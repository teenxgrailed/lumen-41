"use client";

import { useEffect, useRef, useState } from "react";

import { useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { formatDateToLocal, newDate } from "@/lib/date-utils";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { MemoriesGroup } from "../settings/MemoriesGroup";
import { SBtn, SGroup, SRow } from "../settings/kit";
import { Segmented } from "../shell/Segmented";
import { MessagesTab, useHubThreads } from "./MessagesTab";

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

interface HubItemRow {
  id: string;
  title: string;
  status: string;
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

function latest(item: HubItemRow) {
  const event = item.latestEvent;
  if (!event) return "No updates yet";
  const who = event.actor?.name ?? event.actor?.kind ?? "system";
  return `${who}: ${event.message ?? event.type.replace(/_/g, " ")}`;
}

type Tab = "agents" | "tasks" | "messages" | "memory";

const TAB_IDS: readonly Tab[] = ["agents", "tasks", "messages", "memory"];

const ACTIVE = ["open", "claimed", "in_progress", "blocked", "needs_owner"];

/**
 * The Agents screen: the agent hub, kept apart from the person's own tasks.
 * Four tabs. Agents (who is connected, their tokens, what they have reserved),
 * Agent tasks (work the agents hand each other, and what waits for you),
 * Messages (threads between agents and to you), Memory (two layers on one
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

  if (overview.isLoading) {
    return <div className="base-meta">Loading agents</div>;
  }
  if (overview.isError || !overview.data) {
    return (
      <div className="base-stack">
        <span>Could not load the Agents screen.</span>
        <SBtn onClick={() => overview.refetch()}>Retry</SBtn>
      </div>
    );
  }
  const { agents, items, notes } = overview.data;
  const reservations = overview.data.reservations ?? [];
  const threadRows = threads.data?.threads ?? [];
  const unreadThreads = threadRows.filter((t) => t.ownerUnread).length;
  // Waiting for you: an agent asked, or an alert is still unread.
  const needsYou = items.filter(
    (i) => i.status === "needs_owner" || (i.ownerUnread && isActive(i))
  );
  const focused = focusId ? items.find((i) => i.id === focusId) : undefined;
  const tags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();

  const itemRow = (item: HubItemRow) => (
    <SRow
      key={item.id}
      title={item.title}
      desc={`${item.ownerUnread ? "New. " : ""}${STATUS_LABEL[item.status]}. ${latest(item)}${
        item.heldBy
          ? ` Held by ${item.heldBy.name} until ${when(item.leaseExpiresAt)}${
              item.leaseExpired ? " (expired)" : ""
            }.`
          : ""
      }${item.noCapableAgent ? " No capable agent." : ""}${
        item.blockedBy?.length ? ` Waiting on ${item.blockedBy.length}.` : ""
      }${item.stale ? " No update for over 4 hours." : ""}`}
      expanded={open === item.id}
      onClick={async () => {
        const next = open === item.id ? null : item.id;
        setOpen(next);
        if (next && item.ownerUnread) void markSeen(item.id);
      }}
    >
      {open === item.id ? <ItemDetail id={item.id} fallback={item} /> : null}
      {isActive(item) ? (
        <SBtn
          tone="danger"
          onClick={() =>
            run(
              () =>
                sendJson(`/api/agent-hub/items/${item.id}/cancel`, "POST", {}),
              "Cancelled"
            )
          }
        >
          Cancel
        </SBtn>
      ) : null}
    </SRow>
  );

  const attentionRow = (item: HubItemRow) => (
    <SRow
      key={item.id}
      title={item.title}
      desc={
        item.question ??
        (item.noCapableAgent
          ? "No connected agent can do this yet. Connect one with the skills it needs, or cancel it."
          : "Waiting for your decision")
      }
    >
      {item.status === "needs_owner" ? (
        <>
          <input
            aria-label="Your answer"
            value={answers[item.id] ?? ""}
            placeholder="Answer"
            onChange={(e) =>
              setAnswers({ ...answers, [item.id]: e.target.value })
            }
          />
          <SBtn
            disabled={!(answers[item.id] ?? "").trim()}
            onClick={() =>
              run(
                () =>
                  sendJson(`/api/agent-hub/items/${item.id}/answer`, "POST", {
                    answer: answers[item.id],
                  }),
                "Answered"
              )
            }
          >
            Answer
          </SBtn>
        </>
      ) : null}
      {item.risks
        .filter((risk) => !item.approvals[risk])
        .map((risk) => (
          <SBtn
            key={risk}
            onClick={() =>
              run(
                () =>
                  sendJson(`/api/agent-hub/items/${item.id}/approve`, "POST", {
                    risks: [risk],
                  }),
                `Approved ${risk}`
              )
            }
          >
            {`Approve ${risk}`}
          </SBtn>
        ))}
      {item.ownerUnread ? (
        <SBtn onClick={() => void markSeen(item.id)}>Mark as read</SBtn>
      ) : null}
    </SRow>
  );

  return (
    <div
      className="base-stack"
      style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}
    >
      <Segmented
        label="Agents sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "agents", label: "Agents" },
          { id: "tasks", label: "Agent tasks", count: needsYou.length },
          { id: "messages", label: "Messages", count: unreadThreads },
          { id: "memory", label: "Memory" },
        ]}
      />

      {tab === "agents" ? (
        <SGroup
          title="Agents"
          hint="Each agent gets its own token. It is shown once and can be revoked. Agents and their work stay here: they never appear in Today, Tasks or the Calendar."
        >
          {fresh ? (
            <SRow
              title={`Token for ${fresh.name}`}
              desc="Copy it now. It is not shown again."
            >
              <code style={{ wordBreak: "break-all" }}>{fresh.token}</code>
              <SBtn onClick={() => setFresh(null)}>Done</SBtn>
            </SRow>
          ) : null}
          {agents.length === 0 ? (
            <SRow title="No agents yet" desc="Create a token to connect one." />
          ) : null}
          {agents.map((agent) => (
            <SRow
              key={agent.id}
              title={agent.name}
              desc={`${agent.kind}, ${agent.connection}, skills: ${
                agent.skills.join(", ") || "none"
              }. ${agent.openItems} open, ${agent.heldItems} held. Last seen ${when(
                agent.lastSeenAt
              )}.${
                agent.token
                  ? ` Token ${agent.token.preview}${
                      agent.token.revoked ? " (revoked)" : ""
                    }.`
                  : ""
              }`}
            >
              {agent.token && !agent.token.revoked ? (
                <SBtn
                  tone="danger"
                  onClick={() =>
                    run(
                      () =>
                        sendJson(`/api/agent-hub/agents/${agent.id}`, "DELETE"),
                      "Token revoked"
                    )
                  }
                >
                  Revoke
                </SBtn>
              ) : null}
            </SRow>
          ))}
          {reservations.length > 0 ? (
            <SRow
              title="Reserved now"
              desc="Resources agents hold so they stay out of each other's way. They expire on their own."
            />
          ) : null}
          {reservations.map((r) => (
            <SRow
              key={r.id}
              title={r.resource}
              desc={`${r.holder.name}${r.exclusive ? "" : ", shared"}, until ${when(
                r.expiresAt
              )}. ${r.reason}`}
            />
          ))}
          <SRow title="New agent token">
            <input
              aria-label="Agent name"
              value={name}
              maxLength={60}
              placeholder="Name"
              onChange={(e) => setName(e.target.value)}
            />
            <SBtn disabled={!name.trim()} onClick={createToken}>
              Create
            </SBtn>
          </SRow>
        </SGroup>
      ) : null}

      {tab === "tasks" ? (
        <>
          {focused ? (
            <SGroup title="Opened from your alert">
              {itemRow(focused)}
              <SRow title="Show everything" onClick={() => setFocusId(null)} />
            </SGroup>
          ) : null}

          {needsYou.length > 0 ? (
            <SGroup title="Needs you">{needsYou.map(attentionRow)}</SGroup>
          ) : null}

          <SGroup title="Work">
            {items.length === 0 ? (
              <SRow
                title="Nothing here yet"
                desc="Items agents create or receive show up here."
              />
            ) : null}
            {STATUS_ORDER.map((status) =>
              items.filter((i) => i.status === status).map(itemRow)
            )}
            <SRow
              title={archived ? "Hide items older than 14 days" : "Show older"}
              onClick={() => setArchived(!archived)}
            />
          </SGroup>
        </>
      ) : null}

      {tab === "messages" ? (
        <MessagesTab threads={threadRows} focusId={threadParam} />
      ) : null}

      {tab === "memory" ? (
        <>
          <MemoriesGroup
            title="About you"
            hint="What Needt's assistant knows about you, so Ask and the planner fit you better. The same list as Settings, Memories."
          />

          <SGroup
            title="Agent notes"
            hint="What agents leave for each other: decisions, facts about tools and accounts. Needt's assistant reads and writes them too. They are not about you."
          >
            {tags.length > 0 ? (
              <SRow title="Tag">
                <SBtn onClick={() => setTag("")} disabled={!tag}>
                  All
                </SBtn>
                {tags.map((t) => (
                  <SBtn key={t} onClick={() => setTag(t)} disabled={t === tag}>
                    {t}
                  </SBtn>
                ))}
              </SRow>
            ) : null}
            {notes.length === 0 ? (
              <SRow
                title="No notes yet"
                desc="Agents write what they learn here."
              />
            ) : null}
            {notes.map((note) => (
              <SRow
                key={note.id}
                title={
                  editing?.id === note.id ? (
                    <textarea
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
                desc={`${note.author.name ?? "owner"}${
                  note.tags.length ? `, ${note.tags.join(", ")}` : ""
                }${note.ownerEdited ? ", edited by you" : ""}`}
              >
                {editing?.id === note.id ? (
                  <SBtn
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
                  </SBtn>
                ) : (
                  <SBtn
                    onClick={() => setEditing({ id: note.id, text: note.text })}
                  >
                    Edit
                  </SBtn>
                )}
                <SBtn
                  tone="danger"
                  onClick={() =>
                    run(
                      () =>
                        sendJson(`/api/agent-hub/notes/${note.id}`, "DELETE"),
                      "Note deleted"
                    )
                  }
                >
                  Delete
                </SBtn>
              </SRow>
            ))}
          </SGroup>
        </>
      ) : null}
    </div>
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
  return (
    <div className="base-stack base-meta">
      <span>{`Goal: ${item.goal}`}</span>
      {item.criteria?.length ? (
        <>
          <span>Done when:</span>
          {item.criteria.map((entry, index) => (
            <span key={index}>
              {`${entry.met === null ? "Open" : entry.met ? "Met" : "Not met"}: ${entry.text}`}
            </span>
          ))}
        </>
      ) : (
        <span>{`Done when: ${item.doneCriteria}`}</span>
      )}
      {(item.relations ?? []).map((relation, index) => (
        <span key={index}>{relationLine(relation)}</span>
      ))}
      {item.usage && usageLine(item.usage) ? (
        <span>{usageLine(item.usage)}</span>
      ) : null}
      {item.result?.summary ? (
        <span>{`Result: ${item.result.summary}`}</span>
      ) : null}
      {(item.events ?? []).map((event, index) => (
        <span key={index}>
          {`${when(event.at)} ${event.actor?.name ?? event.actor?.kind ?? "system"}: ${
            event.message ?? event.type.replace(/_/g, " ")
          }`}
        </span>
      ))}
    </div>
  );
}
