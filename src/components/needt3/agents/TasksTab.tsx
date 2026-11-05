"use client";

import { type CSSProperties, type ReactNode, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { formatDateToLocal, formatShortDate, newDate } from "@/lib/date-utils";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { PLAN_LIMITS } from "@/lib/plan-limits";

import { ProGate, ProLimit, useIsPro } from "../paywall/Pro";
import { AgBtn, AgEmpty, AgSection, shortWhen, useAgentHue } from "./AgParts";
import { ItemFiles } from "./ItemFiles";
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

export interface HubNoteRow {
  id: string;
  text: string;
  tags: string[];
  author: { kind: string; name?: string };
  ownerEdited: boolean;
  updatedAt: string;
}

export const ACTIVE = [
  "open",
  "claimed",
  "in_progress",
  "blocked",
  "needs_owner",
];

export interface HubItemRow {
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
  createdAt?: string;
  /** When it is due (a post time, a deadline), when the brief set one. */
  due?: string | null;
}

export const STATUS_ORDER = [
  "needs_owner",
  "in_progress",
  "claimed",
  "blocked",
  "open",
  "failed",
  "done",
  "cancelled",
] as const;

export const STATUS_LABEL: Record<string, string> = {
  needs_owner: "Needs you",
  in_progress: "In progress",
  claimed: "Claimed",
  blocked: "Blocked",
  open: "Open",
  failed: "Failed",
  done: "Done",
  cancelled: "Cancelled",
};

export function when(iso: string | null | undefined) {
  return shortWhen(iso);
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

/** The views on the sticky bar, as the reference draws them. */
export const TASK_VIEWS = [
  ["all", "All"],
  ["waiting", "Waiting on me"],
  ["progress", "In progress"],
  ["queued", "Queued"],
  ["done", "Done"],
] as const;
export type TaskView = (typeof TASK_VIEWS)[number][0];

export interface TaskFilters {
  view: TaskView;
  agent: string;
  q: string;
}

export const NO_FILTERS: TaskFilters = { view: "all", agent: "", q: "" };

/** Waiting for you: an agent asked, or an alert is still unread. */
export function waitsForYou(item: HubItemRow) {
  return item.status === "needs_owner" || (item.ownerUnread && isActive(item));
}

const PROGRESS = ["in_progress", "claimed"];
const QUEUED = ["open", "blocked"];
const FINISHED = ["done", "failed", "cancelled"];

export function inView(item: HubItemRow, view: TaskView) {
  if (view === "waiting") return waitsForYou(item);
  if (view === "progress") return PROGRESS.includes(item.status);
  if (view === "queued") return QUEUED.includes(item.status);
  if (view === "done") return FINISHED.includes(item.status);
  return true;
}

export function assigneeOf(item: HubItemRow) {
  const a = item.assignee;
  if (a && a !== "any") return { id: a.id ?? null, name: a.name ?? null };
  return item.heldBy ? { id: null, name: item.heldBy.name } : null;
}

export function filterItems(items: HubItemRow[], f: TaskFilters) {
  const needle = f.q.trim().toLowerCase();
  return items.filter((item) => {
    if (!inView(item, f.view)) return false;
    if (f.agent) {
      const who = assigneeOf(item);
      if (who?.id !== f.agent && who?.name !== f.agent) return false;
    }
    if (needle) {
      const text = `${item.title} ${item.goal} ${item.result?.summary ?? ""}`;
      if (!text.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

type Run = (task: () => Promise<unknown>, done?: string) => Promise<unknown>;

function ringOf(item: HubItemRow) {
  if (item.status === "done") return "done";
  if (waitsForYou(item)) return "wait";
  if (PROGRESS.includes(item.status)) return "prog";
  if (item.status === "failed" || item.status === "blocked") return "bad";
  return "open";
}

function criteriaOf(item: HubItemRow) {
  const list = item.criteria ?? [];
  if (!list.length) return null;
  return { met: list.filter((c) => c.met).length, all: list.length };
}

/** "14:20" today, "5 Nov" before that. */
function rowTime(iso: string) {
  const d = newDate(iso);
  if (isNaN(d.getTime())) return "";
  const now = newDate();
  return d.toDateString() === now.toDateString()
    ? formatDateToLocal(d).slice(11, 16)
    : formatShortDate(d);
}

/**
 * One task row, one geometry: the agent's rail, a status ring, the title
 * over one quiet line, the agent tag, criteria progress, the time. Enter or
 * a click opens it; Up and Down move between rows.
 */
function TaskRow({
  item,
  open,
  onToggle,
  sub,
  children,
}: {
  item: HubItemRow;
  open: boolean;
  onToggle: () => void;
  sub: ReactNode;
  children: ReactNode;
}) {
  const hue = useAgentHue();
  const who = assigneeOf(item);
  const color = hue(who?.id ?? who?.name);
  const crit = criteriaOf(item);
  return (
    <div
      className={"ag-item ag-trow-wrap" + (open ? " is-open" : "")}
      data-ag-row=""
      data-ag-item={item.id}
      style={{ "--c": color } as CSSProperties}
    >
      <button
        type="button"
        className="ag-main ag-trow"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="ag-rail" aria-hidden="true" />
        <span className={`ag-ring is-${ringOf(item)}`} aria-hidden="true" />
        <span className="ag-tt">
          <b>
            {item.ownerUnread ? <span className="ag-new">New </span> : null}
            {item.title}
          </b>
          <span className="ag-tt-sub">{sub}</span>
        </span>
        {who?.name ? (
          <span className="ag-tag">
            <span className="ag-dotc" aria-hidden="true" />
            {who.name}
          </span>
        ) : (
          <span className="ag-tag is-empty" />
        )}
        {crit ? (
          <span
            className="ag-crit"
            aria-label={`${crit.met} of ${crit.all} criteria met`}
            style={
              { "--p": `${(crit.met / crit.all) * 100}%` } as CSSProperties
            }
          >
            <i aria-hidden="true" />
            {`${crit.met}/${crit.all}`}
          </span>
        ) : (
          <span className="ag-crit is-empty" />
        )}
        <span className="ag-when">{rowTime(item.updatedAt)}</span>
      </button>
      {open ? <div className="ag-tdetail">{children}</div> : null}
    </div>
  );
}

/**
 * The Tasks tab: work agents hand each other, and what waits for you, in
 * three groups (Waiting on you, In progress, Queued and done). The filters
 * live on the screen's sticky bar. An open row shows the goal, the done-when
 * checklist, details, files, history and the actions.
 */
export function TasksTab({
  items,
  filters,
  focusId,
  onClearFocus,
  archived,
  onArchived,
  run,
  markSeen,
  onReset,
}: {
  items: HubItemRow[];
  filters: TaskFilters;
  focusId: string | null;
  onClearFocus: () => void;
  archived: boolean;
  onArchived: (v: boolean) => void;
  run: Run;
  markSeen: (id: string) => Promise<unknown>;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(focusId);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const recurrences = useRecurrences().data;
  const pro = useIsPro();
  const focused = focusId ? items.find((i) => i.id === focusId) : undefined;
  // The item opened from the map or an alert shows once, at the top.
  const shown = filterItems(items, filters).filter((i) => i.id !== focusId);
  const waiting = shown.filter(waitsForYou);
  const progress = shown.filter(
    (i) => !waitsForYou(i) && PROGRESS.includes(i.status)
  );
  const rest = shown
    .filter((i) => !waitsForYou(i) && !PROGRESS.includes(i.status))
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status as (typeof STATUS_ORDER)[number]) -
        STATUS_ORDER.indexOf(b.status as (typeof STATUS_ORDER)[number])
    );
  const openItems = items.filter(isActive).length;

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

  const actions = (item: HubItemRow) => (
    <span className="ag-actions" data-ag-actions="">
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
                  sendJson(`/api/agent-hub/items/${item.id}/answer`, "POST", {
                    answer: answers[item.id],
                  }),
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
                  sendJson(`/api/agent-hub/items/${item.id}/approve`, "POST", {
                    risks: [risk],
                  }),
                `Approved ${risk}`
              )
            }
          >
            {`Approve ${risk}`}
          </AgBtn>
        ))}
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
      {item.ownerUnread ? (
        <AgBtn tone="text" onClick={() => void markSeen(item.id)}>
          Mark as read
        </AgBtn>
      ) : null}
      {isActive(item) ? (
        <AgBtn
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
        </AgBtn>
      ) : null}
    </span>
  );

  const row = (item: HubItemRow) => (
    <TaskRow
      key={item.id}
      item={item}
      open={open === item.id}
      onToggle={() => {
        const next = open === item.id ? null : item.id;
        setOpen(next);
        if (next && item.ownerUnread) void markSeen(item.id);
      }}
      sub={
        waitsForYou(item)
          ? (item.question ??
            (item.noCapableAgent
              ? "No connected agent can do this yet. Connect one with the skills it needs, or cancel it."
              : "Waiting for your decision"))
          : itemMeta(item)
      }
    >
      <ItemDetail id={item.id} fallback={item} />
      {actions(item)}
    </TaskRow>
  );

  const group = (title: string, list: HubItemRow[], attr: string) =>
    list.length ? (
      <AgSection key={attr} title={title} attr={attr}>
        {list.map(row)}
      </AgSection>
    ) : null;

  return (
    <div className="ag-col" data-ag-tasks="">
      {items.length > 0 ? (
        <p className="ag-sky-hint">
          <ProLimit
            used={openItems}
            max={PLAN_LIMITS.FREE.hubOpenItems}
            noun="open items"
            feature="unlimited agent tasks"
          />
        </p>
      ) : null}
      {focused ? (
        <AgSection
          title="Opened from the map or an alert"
          attr="data-ag-focused"
          action={
            <AgBtn tone="text" onClick={onClearFocus}>
              Show everything
            </AgBtn>
          }
        >
          {row(focused)}
        </AgSection>
      ) : null}

      {items.length === 0 ? (
        <AgEmpty
          art="task"
          title="Nothing here yet"
          line="Items agents create or receive show up here."
        />
      ) : shown.length === 0 ? (
        <AgEmpty
          art="task"
          title="Nothing matches these filters"
          line="Clear them to see every item."
          action={<AgBtn onClick={onReset}>Clear filters</AgBtn>}
        />
      ) : (
        <>
          {group("Waiting on you", waiting, "data-ag-needs-you")}
          {group("In progress", progress, "data-ag-progress")}
          {group("Queued and done", rest, "data-ag-rest")}
        </>
      )}
      <div className="ag-footer">
        <AgBtn tone="text" onClick={() => onArchived(!archived)}>
          {archived ? "Hide items older than 14 days" : "Show older"}
        </AgBtn>
      </div>
    </div>
  );
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
  const who = assigneeOf(item);
  const started = (item.events ?? []).find((e) =>
    ["claimed", "started", "in_progress"].includes(e.type)
  );
  return (
    <div className="ag-tgrid">
      <div className="ag-tcol">
        <h4 className="ag-dh">Goal</h4>
        <p className="ag-dp">{item.goal}</p>
        <h4 className="ag-dh">Done when</h4>
        {item.criteria?.length ? (
          <ul className="ag-chks">
            {item.criteria.map((entry, index) => (
              <li
                key={index}
                className={"ag-chk" + (entry.met === false ? " is-off" : "")}
              >
                <i
                  className={entry.met ? "is-on" : undefined}
                  aria-label={
                    entry.met === null ? "Open" : entry.met ? "Met" : "Not met"
                  }
                />
                {entry.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ag-dp">{item.doneCriteria}</p>
        )}
        {item.result?.summary ? (
          <>
            <h4 className="ag-dh">Result</h4>
            <p className="ag-dp">{item.result.summary}</p>
          </>
        ) : null}
        {hasUnconfirmedRisk(item) ? (
          <p className="ag-dp ag-flag-line">
            <span className="ag-flag">No confirmation: </span>
            no risk was declared, yet this item mentions sending, publishing,
            posting, deleting or paying. It could run without asking you.
          </p>
        ) : null}
      </div>
      <div className="ag-tcol">
        <h4 className="ag-dh">Details</h4>
        <dl className="ag-kv">
          <dt>Agent</dt>
          <dd>{who?.name ?? "Any capable agent"}</dd>
          <dt>Status</dt>
          <dd>{STATUS_LABEL[item.status] ?? item.status}</dd>
          {started ? (
            <>
              <dt>Started</dt>
              <dd>{when(started.at)}</dd>
            </>
          ) : null}
          {item.heldBy ? (
            <>
              <dt>Held</dt>
              <dd>{`${item.heldBy.name} until ${when(item.leaseExpiresAt)}${
                item.leaseExpired ? " (expired)" : ""
              }`}</dd>
            </>
          ) : null}
          {(item.relations ?? []).length ? (
            <>
              <dt>Linked</dt>
              <dd className="ag-kv-list">
                {(item.relations ?? []).map((relation, index) => (
                  <span key={index}>{relationLine(relation)}</span>
                ))}
              </dd>
            </>
          ) : null}
          {item.usage && usageLine(item.usage) ? (
            <>
              <dt>Usage</dt>
              <dd>{usageLine(item.usage).replace(/^Usage: /, "")}</dd>
            </>
          ) : null}
          {recurrence ? (
            <>
              <dt>Repeats</dt>
              <dd>
                {repeatsLine(recurrence).replace(/^Repeats /, "")}
                {recurrence.lastSkip
                  ? `. Last skipped ${when(recurrence.lastSkip.at)}: ${recurrence.lastSkip.message}`
                  : null}
              </dd>
            </>
          ) : null}
        </dl>
        <div className="ag-detail">
          <ItemFiles id={id} />
        </div>
        {(item.events ?? []).length ? (
          <>
            <h4 className="ag-dh">History</h4>
            <div className="ag-detail">
              {(item.events ?? []).map((event, index) => (
                <span key={index} className="ag-detail-ev">
                  <span>{when(event.at)}</span>
                  <span>{`${event.actor?.name ?? event.actor?.kind ?? "system"}: ${
                    event.message ?? event.type.replace(/_/g, " ")
                  }`}</span>
                </span>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
