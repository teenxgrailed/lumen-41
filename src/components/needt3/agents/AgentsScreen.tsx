"use client";

import { useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { notify } from "@/lib/notifications";

import { SBtn, SGroup, SRow } from "../settings/kit";

type Named = { id?: string; name?: string; kind?: string } | "any" | null;

interface HubEvent {
  at: string;
  type: string;
  message: string | null;
  actor: { kind: string; name?: string } | null;
}

interface HubItemRow {
  id: string;
  title: string;
  status: string;
  goal: string;
  doneCriteria: string;
  risks: string[];
  approvals: Record<string, unknown>;
  assignee: Named;
  heldBy: { name: string } | null;
  leaseExpiresAt: string | null;
  leaseExpired: boolean;
  question: string | null;
  noCapableAgent: boolean;
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
  token: { preview: string; revoked: boolean; lastUsedAt: string | null } | null;
}

interface HubNoteRow {
  id: string;
  text: string;
  tags: string[];
  author: { kind: string; name?: string };
  ownerEdited: boolean;
  updatedAt: string;
}

interface Overview {
  agents: HubAgentRow[];
  items: HubItemRow[];
  notes: HubNoteRow[];
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
  return new Date(iso).toLocaleString();
}

function latest(item: HubItemRow) {
  const event = item.latestEvent;
  if (!event) return "No updates yet";
  const who = event.actor?.name ?? event.actor?.kind ?? "system";
  return `${who}: ${event.message ?? event.type.replace(/_/g, " ")}`;
}

export function AgentsScreen() {
  const qc = useQueryClient();
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

  const refresh = () => qc.invalidateQueries({ queryKey: ["agent-hub"] });
  const run = async (task: () => Promise<unknown>, done?: string) => {
    try {
      await task();
      if (done) notify.success(done);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed");
    }
  };

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
  const needsYou = items.filter((i) => i.status === "needs_owner");
  const tags = Array.from(new Set(notes.flatMap((n) => n.tags))).sort();

  return (
    <div
      className="base-stack"
      style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}
    >
      <SGroup
        title="Agents"
        hint="Each agent gets its own token. It is shown once and can be revoked."
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
                    () => sendJson(`/api/agent-hub/agents/${agent.id}`, "DELETE"),
                    "Token revoked"
                  )
                }
              >
                Revoke
              </SBtn>
            ) : null}
          </SRow>
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

      {needsYou.length > 0 ? (
        <SGroup title="Needs you">
          {needsYou.map((item) => (
            <SRow
              key={item.id}
              title={item.title}
              desc={item.question ?? "Waiting for your decision"}
            >
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
                      sendJson(
                        `/api/agent-hub/items/${item.id}/answer`,
                        "POST",
                        { answer: answers[item.id] }
                      ),
                    "Answered"
                  )
                }
              >
                Answer
              </SBtn>
              {item.risks
                .filter((risk) => !item.approvals[risk])
                .map((risk) => (
                  <SBtn
                    key={risk}
                    onClick={() =>
                      run(
                        () =>
                          sendJson(
                            `/api/agent-hub/items/${item.id}/approve`,
                            "POST",
                            { risks: [risk] }
                          ),
                        `Approved ${risk}`
                      )
                    }
                  >
                    {`Approve ${risk}`}
                  </SBtn>
                ))}
            </SRow>
          ))}
        </SGroup>
      ) : null}

      <SGroup title="Work">
        {items.length === 0 ? (
          <SRow title="Nothing here yet" desc="Items agents create or receive show up here." />
        ) : null}
        {STATUS_ORDER.map((status) =>
          items
            .filter((i) => i.status === status)
            .map((item) => (
              <SRow
                key={item.id}
                title={item.title}
                desc={`${STATUS_LABEL[status]}. ${latest(item)}${
                  item.heldBy
                    ? ` Held by ${item.heldBy.name} until ${when(item.leaseExpiresAt)}${
                        item.leaseExpired ? " (expired)" : ""
                      }.`
                    : ""
                }${item.noCapableAgent ? " No capable agent." : ""}`}
                expanded={open === item.id}
                onClick={async () => {
                  setOpen(open === item.id ? null : item.id);
                }}
              >
                {open === item.id ? (
                  <ItemDetail id={item.id} fallback={item} />
                ) : null}
                {["open", "claimed", "in_progress", "blocked", "needs_owner"].includes(
                  item.status
                ) ? (
                  <SBtn
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
                  </SBtn>
                ) : null}
              </SRow>
            ))
        )}
        <SRow
          title={archived ? "Hide items older than 14 days" : "Show older"}
          onClick={() => setArchived(!archived)}
        />
      </SGroup>

      <SGroup title="Notes" hint="Shared between agents. Not visible to Needt's own assistant.">
        {tags.length > 0 ? (
          <SRow title="Tag">
            <select
              aria-label="Tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              <option value="">All</option>
              {tags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </SRow>
        ) : null}
        {notes.length === 0 ? (
          <SRow title="No notes yet" desc="Agents write what they learn here." />
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
                    await sendJson(`/api/agent-hub/notes/${note.id}`, "PATCH", {
                      text: editing.text,
                    });
                    setEditing(null);
                  }, "Note saved")
                }
              >
                Save
              </SBtn>
            ) : (
              <SBtn onClick={() => setEditing({ id: note.id, text: note.text })}>
                Edit
              </SBtn>
            )}
            <SBtn
              tone="danger"
              onClick={() =>
                run(
                  () => sendJson(`/api/agent-hub/notes/${note.id}`, "DELETE"),
                  "Note deleted"
                )
              }
            >
              Delete
            </SBtn>
          </SRow>
        ))}
      </SGroup>
    </div>
  );
}

/** The full event log of one item, fetched when its row opens. */
function ItemDetail({ id, fallback }: { id: string; fallback: HubItemRow }) {
  const detail = useQuery({
    queryKey: ["agent-hub", "item", id],
    queryFn: () =>
      sendJson<{ item: HubItemRow }>(`/api/agent-hub/items/${id}/detail`, "POST"),
  });
  const item = detail.data?.item ?? fallback;
  return (
    <div className="base-stack base-meta">
      <span>{`Goal: ${item.goal}`}</span>
      <span>{`Done when: ${item.doneCriteria}`}</span>
      {item.result?.summary ? <span>{`Result: ${item.result.summary}`}</span> : null}
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
