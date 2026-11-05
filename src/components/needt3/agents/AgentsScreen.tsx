"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FiPlus, FiSearch, FiX } from "react-icons/fi";

import { newDate } from "@/lib/date-utils";
import {
  type V3Connection,
  useConnections,
} from "@/lib/needt3/hooks/connections";
import { fetchJson, sendJson } from "@/lib/needt3/hooks/core";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { StScreen } from "../states/StScreen";
import { ActivityTab } from "./ActivityTab";
import { AgentHueProvider, agentHueMap } from "./AgParts";
import { AgentsMap } from "./AgentsMap";
import { AgentsSetup, onboardingSeen } from "./AgentsSetup";
import {
  type AgentState,
  AgentsTab,
  type HubAgentRow,
  type HubReservationRow,
  agentSeen,
  agentState,
} from "./AgentsTab";
import { type ChatAlert, ChatTab } from "./ChatTab";
import { MemoryTab, noteTags } from "./MemoryTab";
import { useHubThreads } from "./MessagesTab";
import {
  type HubItemRow,
  type HubNoteRow,
  NO_FILTERS,
  TASK_VIEWS,
  type TaskFilters,
  TasksTab,
  inView,
  waitsForYou,
} from "./TasksTab";
import { agentStatuses, recentFailures } from "./agent-status";
import {
  type MapGraph,
  type MapInput,
  type MapSourceInput,
  freshSeed,
  mapStats,
  statsLine,
} from "./map-scene";

interface Overview {
  agents: HubAgentRow[];
  items: HubItemRow[];
  notes: HubNoteRow[];
  reservations?: HubReservationRow[];
  /** `?graph=1`: the Map's compact links and counts; null when it failed. */
  graph?: MapGraph | null;
}

type Tab = "map" | "agents" | "tasks" | "chat" | "activity" | "memory";

const TABS: readonly [Tab, string][] = [
  ["map", "Map"],
  ["agents", "Agents"],
  ["tasks", "Tasks"],
  ["chat", "Chat"],
  ["activity", "Activity"],
  ["memory", "Memory"],
];
const TAB_IDS = TABS.map(([id]) => id);

/** Old links keep working: Messages became Chat (owner, 05.11.26). */
function tabOf(param: string | null): Tab | null {
  if (param === "messages") return "chat";
  return TAB_IDS.includes(param as Tab) ? (param as Tab) : null;
}

const EMPTY: Overview = { agents: [], items: [], notes: [] };

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google Calendar",
  outlook: "Outlook",
  caldav: "iCloud Calendar",
  gmail: "Gmail",
};

function titleCase(text: string) {
  return text.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** What the person connected, one source per provider, for the Map's left edge. */
export function mapSources(connections: V3Connection[]): MapSourceInput[] {
  const out: MapSourceInput[] = [];
  const seen = new Set<string>();
  for (const c of connections) {
    if (c.state !== "connected") continue;
    const key = `${c.kind}:${c.provider}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const kind =
      c.kind === "calendar"
        ? "calendar"
        : c.kind === "mail"
          ? "mail"
          : "service";
    const label =
      kind === "mail" && c.provider !== "gmail"
        ? "Mail"
        : (PROVIDER_LABEL[c.provider] ?? titleCase(c.provider));
    out.push({ id: key, label, kind });
  }
  // //todo: API tokens and MCP apps from Connections are sources too; their
  // hooks live in the Connections controller and are not read here yet.
  return out;
}

/** What the Map draws, without the clocks that move on every poll. */
function mapShape(input: MapInput) {
  return JSON.stringify([
    input.sources.map((s) => s.id),
    input.agents.map((a) => [a.id, a.name, a.status, a.line, a.seen]),
    input.items.map((i) => [
      i.id,
      i.title,
      i.status,
      i.assigneeId,
      i.related,
      i.result,
      i.criteria?.met,
    ]),
    input.threads.map((t) => [t.id, t.subject, t.itemId]),
  ]);
}

/** Mirror the open tab and target into the URL without a navigation. */
function syncUrl(patch: Record<string, string | null>) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  window.history.replaceState(window.history.state, "", url);
}

function Search({
  value,
  onChange,
  label,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="cn-search ag-search">
      <span className="cn-sicon">
        <FiSearch size={14} aria-hidden />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        aria-label={label}
        placeholder={label}
        data-ag-search=""
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && value) {
            e.stopPropagation();
            onChange("");
          }
        }}
      />
      {value ? (
        <button
          type="button"
          className="cn-iconbtn cn-sx"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <FiX size={13} aria-hidden />
        </button>
      ) : (
        <kbd className="ag-kbd" aria-hidden="true">
          /
        </kbd>
      )}
    </label>
  );
}

function Chip({
  pressed,
  onClick,
  children,
  count,
  attr,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  attr?: string;
}) {
  return (
    <button
      type="button"
      className="ag-chip"
      aria-pressed={pressed}
      onClick={onClick}
      {...(attr ? { [attr]: "" } : {})}
    >
      {children}
      {count !== undefined ? <small>{count}</small> : null}
    </button>
  );
}

/**
 * The Agents screen: the agent hub, kept apart from the person's own tasks,
 * on one night ground in both themes (owner, 05.11.26). A centred hero
 * (eyebrow, display title, one line, a status pill with real counts), the
 * tabs on a pill that sticks with each tab's filters, and six tabs:
 *
 *  - Map (the default): the live constellation of sources, agents and their
 *    work, redrawn from a new seed on every visit (`?seed=` pins one);
 *  - Agents: one card per agent, a card to connect a new one, webhooks and
 *    what agents hold right now;
 *  - Tasks: hub items in three groups, filters, search, one row geometry;
 *  - Messages: threads and the open conversation;
 *  - Activity: the feed by day with this week's counts;
 *  - Memory: what the assistant learned about you, and agents' notes.
 *
 * Deep links: `?tab=`, `?item=<id>` (opens one item and reads its alert),
 * `?thread=<id>`, `?agent=<id>`.
 */
export function AgentsScreen() {
  const qc = useQueryClient();
  const params = useSearchParams();
  const itemParam = params.get("item");
  const tabParam = params.get("tab");
  const threadParam = params.get("thread");
  const agentParam = params.get("agent");
  const seedParam = params.get("seed");
  const [tab, setTabState] = useState<Tab>(
    threadParam
      ? "chat"
      : itemParam
        ? "tasks"
        : agentParam
          ? "agents"
          : (tabOf(tabParam) ?? "map")
  );
  const [seed, setSeed] = useState(() =>
    seedParam && Number.isFinite(Number(seedParam))
      ? Number(seedParam)
      : freshSeed()
  );
  const [focusId, setFocusId] = useState<string | null>(itemParam);
  const [focusAgent, setFocusAgent] = useState<string | null>(agentParam);
  const [threadFocus, setThreadFocus] = useState<string | null>(threadParam);
  const [archived, setArchived] = useState(false);
  const [manualGuide, setManualGuide] = useState<boolean | null>(null);
  const [filters, setFilters] = useState<TaskFilters>(NO_FILTERS);
  const [agentsView, setAgentsView] = useState<AgentState | "all">("all");
  const [agentsQ, setAgentsQ] = useState("");
  const [activityAgent, setActivityAgent] = useState("");
  const [memTag, setMemTag] = useState("");
  const [memQ, setMemQ] = useState("");

  // A deep link belongs to its tab; leaving the tab drops it, so a reload
  // opens where you are and not where the link once pointed.
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    syncUrl({
      tab: next === "map" ? null : next,
      ...(next === "tasks" ? {} : { item: null }),
      ...(next === "chat" ? {} : { thread: null }),
      ...(next === "agents" ? {} : { agent: null }),
    });
  }, []);

  // The graph is asked for only where it is drawn: the Map, the agent
  // cards' sparklines, Activity's week. Elsewhere the last one is kept.
  const withGraph = tab === "map" || tab === "agents" || tab === "activity";
  const overview = useQuery({
    queryKey: ["agent-hub", archived, memTag, withGraph],
    queryFn: () =>
      fetchJson<Overview>(
        `/api/agent-hub/overview?${withGraph ? "graph=1&" : ""}includeArchived=${archived}${
          memTag ? `&tag=${encodeURIComponent(memTag)}` : ""
        }`
      ),
    // A new tag keeps the screen in place while its notes load.
    placeholderData: (previous) => previous,
    refetchInterval: 15_000,
  });
  const lastGraph = useRef<MapGraph | undefined>(undefined);
  if (overview.data?.graph) lastGraph.current = overview.data.graph;
  const graphNow = overview.data?.graph ?? lastGraph.current;
  const threads = useHubThreads();
  const connections = useConnections();

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["agent-hub"] }),
      qc.invalidateQueries({ queryKey: qk.agentHubNav() }),
    ]);
  /** Runs a hub action; resolves true when it worked, false (and says why) when not. */
  const run = async (task: () => Promise<unknown>, done?: string) => {
    try {
      await task();
      if (done) notify.success(done);
      await refresh();
      return true;
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed");
      return false;
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

  const { agents, items, notes } = overview.data ?? EMPTY;
  const reservations = useMemo(
    () => overview.data?.reservations ?? [],
    [overview.data]
  );
  const threadRows = useMemo(() => threads.data?.threads ?? [], [threads.data]);
  const unreadThreads = threadRows.filter((t) => t.ownerUnread).length;
  const live = useMemo(
    () => agents.filter((a) => !a.disabled && !a.disabledAt),
    [agents]
  );
  // Free counts agents that are not disabled; Needt's own assistant is free.
  const countedAgents = live.filter(
    (a) => a.connection !== "Needt assistant"
  ).length;
  const needsYou = items.filter(waitsForYou).length;

  // Working now (integrator, 05.11.26): the assignee of an item in progress,
  // or the holder of a reservation.
  const { working, nowOf } = useMemo(() => {
    const set = new Set<string>();
    const now = new Map<string, string>();
    for (const item of items) {
      const a = item.assignee;
      if (item.status !== "in_progress" || !a || a === "any" || !a.id) continue;
      set.add(a.id);
      if (!now.has(a.id)) now.set(a.id, item.title);
    }
    for (const r of reservations) {
      set.add(r.holder.id);
      if (!now.has(r.holder.id)) now.set(r.holder.id, `Holding ${r.resource}`);
    }
    return { working: set, nowOf: now };
  }, [items, reservations]);
  const hues = useMemo(() => agentHueMap(live, working), [live, working]);
  const subjects = useMemo(
    () => new Map(threadRows.map((t) => [t.id, t.subject])),
    [threadRows]
  );
  const recent = useMemo(
    () => recentFailures(items, newDate().getTime()),
    [items]
  );
  const statusOf = useMemo(
    () => agentStatuses(agents, items, working, nowOf, newDate().getTime()),
    [agents, items, working, nowOf]
  );
  // Red in Chat: what is broken, with the one action that fixes it.
  // A failure counts for three days; older ones live in Tasks.
  const chatAlerts: ChatAlert[] = [];
  for (const a of live) {
    if (a.token?.revoked)
      chatAlerts.push({
        key: `revoked-${a.id}`,
        agent: a.name,
        what: "Connection",
        reason: "Connection expired — make a new token to reconnect",
        at: a.token.lastUsedAt,
        action: "Reconnect",
        run: () => openAgent(a.id),
      });
  }
  for (const i of recent) {
    if (!i.assignee || i.assignee === "any") continue;
    chatAlerts.push({
      key: `failed-${i.id}`,
      agent: i.assignee.name ?? "An agent",
      what: "Task failed",
      reason: i.title,
      at: i.updatedAt,
      action: "Open task",
      run: () => openItem(i.id),
    });
  }
  // The setup opens by itself only for someone with no agents yet (once per
  // device); anyone may open it again from "Replay setup".
  const [onboarded, setOnboarded] = useState(onboardingSeen);
  const [replay, setReplay] = useState(false);
  const showOnboarding =
    overview.data !== undefined &&
    (replay || (!onboarded && agents.length === 0));
  // What is already connected, so step 2 can say "Connected" at once.
  const connectedApps = useQuery({
    queryKey: ["oauth", "connected-apps"],
    queryFn: () =>
      fetchJson<{ apps?: { clientName: string }[] }>(
        "/api/oauth/connected-apps"
      ),
    enabled: showOnboarding,
    refetchInterval: showOnboarding ? 5_000 : false,
  });
  const known = [
    ...agents.filter((a) => !a.disabledAt).flatMap((a) => [a.name, a.kind]),
    ...(connectedApps.data?.apps ?? []).map((a) => a.clientName),
  ];

  const freshMap: MapInput = {
    now: newDate().getTime(),
    sources: mapSources(connections.data ?? []),
    agents: live.map((a) => ({
      id: a.id,
      name: a.name,
      status: statusOf.get(a.id)?.status ?? "ok",
      line: statusOf.get(a.id)?.line ?? "All good",
      reason: statusOf.get(a.id)?.reason ?? null,
      seen: agentSeen(a),
    })),
    items: items.map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      assigneeId:
        i.assignee && i.assignee !== "any" ? (i.assignee.id ?? null) : null,
      related: (i.relations ?? []).map((r) => r.item.id),
      updatedAt: i.updatedAt,
      createdAt: i.createdAt,
      result: i.result?.summary ?? null,
      criteria: i.criteria?.length
        ? {
            met: i.criteria.filter((c) => c.met).length,
            all: i.criteria.length,
          }
        : null,
    })),
    // The graph carries thread links without text; the subject, for the
    // owner's own hover, comes from the threads list when it has it.
    threads: (graphNow?.threads ?? threadRows).map((t) => ({
      id: t.id,
      subject: subjects.get(t.id) ?? "Thread",
      itemId: t.itemId,
      lastMessageAt: t.lastMessageAt,
    })),
  };
  // The overview refetches every 15 s and an agent's lastSeenAt moves on
  // every call; the Map rebuilds only when what it draws changes, so the
  // threads do not draw themselves in again on each poll.
  const shape = mapShape(freshMap);
  const stableMap = useRef<{ key: string; data: MapInput } | null>(null);
  if (!stableMap.current || stableMap.current.key !== shape)
    stableMap.current = { key: shape, data: freshMap };
  const mapData = stableMap.current.data;
  const stats = mapStats(freshMap);
  const mapReady =
    !overview.isLoading && !threads.isLoading && !connections.isLoading;

  const showGuide =
    manualGuide ?? (overview.data !== undefined && agents.length === 0);

  // Sticky bar: a 1px sentinel above it says when it is stuck (Connections).
  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [stuck, setStuck] = useState(false);
  // The scroller exists only off the Map; the observer follows it.
  const onMap = tab === "map" || tab === "chat";
  useEffect(() => {
    const root = scrollRef.current;
    const el = sentinel.current;
    if (!root || !el || typeof IntersectionObserver !== "function")
      return undefined;
    const io = new IntersectionObserver(
      ([e]) =>
        setStuck(
          !e.isIntersecting &&
            e.boundingClientRect.top <
              (e.rootBounds ? e.rootBounds.top : 0) + 20
        ),
      { root, rootMargin: "-9px 0px 0px 0px", threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onMap]);

  // "/" jumps to the tab's search, as the reference shows.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable]")) return;
      if (!searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const at = TAB_IDS.indexOf(tab);
    let next = -1;
    if (e.key === "ArrowRight") next = (at + 1) % TAB_IDS.length;
    else if (e.key === "ArrowLeft")
      next = (at - 1 + TAB_IDS.length) % TAB_IDS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TAB_IDS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    setTab(TAB_IDS[next]);
    document
      .querySelector<HTMLElement>(`[data-ag-tab="${TAB_IDS[next]}"]`)
      ?.focus();
  };

  const openItem = (id: string) => {
    setFocusId(id);
    setFilters(NO_FILTERS);
    setTab("tasks");
    syncUrl({ tab: "tasks", item: id });
  };
  const openAgent = (id: string) => {
    setFocusAgent(id);
    setAgentsView("all");
    setAgentsQ("");
    setTab("agents");
    syncUrl({ tab: "agents", agent: id });
  };
  const openThread = (id: string) => {
    setThreadFocus(id);
    setTab("chat");
    syncUrl({ tab: "chat", thread: id });
  };

  const count: Partial<Record<Tab, number>> = {
    agents: live.length || undefined,
    tasks: needsYou || undefined,
    chat: unreadThreads + needsYou || undefined,
  };
  // Disabled agents stay on the Agents tab (Offline), so they can still be
  // edited and revoked; the Map and the counts show the live ones.
  const agentCounts = {
    all: agents.length,
    working: agents.filter((a) => agentState(a, working) === "working").length,
    idle: agents.filter((a) => agentState(a, working) === "idle").length,
    offline: agents.filter((a) => agentState(a, working) === "offline").length,
  };
  // With a tag picked the server sends only its notes; the chips keep the
  // counts of the last unfiltered list.
  const allTags = useRef<{ tags: [string, number][]; total: number }>({
    tags: [],
    total: 0,
  });
  if (!memTag) allTags.current = { tags: noteTags(notes), total: notes.length };
  const tags = allTags.current.tags;
  const graph = graphNow;
  const week = graph
    ? {
        days: (activityAgent
          ? [graph.activity[activityAgent] ?? []]
          : Object.values(graph.activity)
        ).reduce(
          (sum, row) => sum.map((n, i) => n + (row[i] ?? 0)),
          Array.from({ length: 7 }, () => 0)
        ),
        byAgent: agents
          .map((a) => ({
            id: a.id,
            name: a.name,
            n: (graph.activity[a.id] ?? []).reduce((x, y) => x + y, 0),
          }))
          .filter((a) => a.n > 0 && (!activityAgent || a.id === activityAgent)),
      }
    : undefined;

  const toolbar =
    tab === "agents" ? (
      <div className="ag-bar" data-ag-bar="agents">
        {(
          [
            ["all", "All"],
            ["working", "Working"],
            ["idle", "Idle"],
            ["offline", "Offline"],
          ] as const
        ).map(([id, label]) => (
          <Chip
            key={id}
            pressed={agentsView === id}
            count={agentCounts[id]}
            onClick={() => setAgentsView(id)}
          >
            {label}
          </Chip>
        ))}
        <Search
          value={agentsQ}
          onChange={setAgentsQ}
          label="Search agents"
          inputRef={searchRef}
        />
      </div>
    ) : tab === "tasks" ? (
      <div className="ag-bar" data-ag-bar="tasks">
        {TASK_VIEWS.map(([id, label]) => (
          <Chip
            key={id}
            pressed={filters.view === id}
            count={items.filter((i) => inView(i, id)).length}
            attr={`data-ag-view-${id}`}
            onClick={() => setFilters({ ...filters, view: id })}
          >
            {label}
          </Chip>
        ))}
        {live.length > 1 ? (
          <span className="ag-bar-agents" role="group" aria-label="Agent">
            {live.map((a) => (
              <Chip
                key={a.id}
                pressed={filters.agent === a.id}
                onClick={() =>
                  setFilters({
                    ...filters,
                    agent: filters.agent === a.id ? "" : a.id,
                  })
                }
              >
                {a.name}
              </Chip>
            ))}
          </span>
        ) : null}
        <Search
          value={filters.q}
          onChange={(q) => setFilters({ ...filters, q })}
          label="Search tasks"
          inputRef={searchRef}
        />
        {/* //todo: "New task" from the reference; owners create hub items
            through agents today, there is no owner create route. */}
      </div>
    ) : tab === "activity" ? (
      <div className="ag-bar" data-ag-bar="activity">
        <Chip pressed={!activityAgent} onClick={() => setActivityAgent("")}>
          All agents
        </Chip>
        {live.map((a) => (
          <Chip
            key={a.id}
            pressed={activityAgent === a.id}
            onClick={() => setActivityAgent(a.id)}
          >
            <span
              className="ag-dotc"
              aria-hidden="true"
              style={{ background: hues.get(a.id) }}
            />
            {a.name}
          </Chip>
        ))}
      </div>
    ) : tab === "memory" ? (
      <div className="ag-bar" data-ag-bar="memory">
        <Chip
          pressed={!memTag}
          count={notes.length}
          onClick={() => setMemTag("")}
        >
          All
        </Chip>
        {tags.map(([t, n]) => (
          <Chip
            key={t}
            pressed={memTag === t}
            count={n}
            onClick={() => setMemTag(t)}
          >
            {t}
          </Chip>
        ))}
        <Search
          value={memQ}
          onChange={setMemQ}
          label="Search memory"
          inputRef={searchRef}
        />
      </div>
    ) : null;

  let content: ReactNode = null;
  if (tab === "agents")
    content = (
      <AgentsTab
        agents={agents}
        reservations={reservations}
        working={working}
        nowOf={nowOf}
        activity={graph?.activity}
        view={agentsView}
        q={agentsQ}
        counted={countedAgents}
        focusAgent={focusAgent}
        showGuide={showGuide}
        onGuide={setManualGuide}
        run={run}
      />
    );
  else if (tab === "tasks")
    content = (
      <TasksTab
        key={focusId ?? "all"}
        items={items}
        filters={filters}
        focusId={focusId}
        onClearFocus={() => {
          setFocusId(null);
          syncUrl({ item: null });
        }}
        archived={archived}
        onArchived={setArchived}
        run={run}
        markSeen={markSeen}
        onReset={() => setFilters(NO_FILTERS)}
      />
    );
  else if (tab === "chat")
    content = (
      <ChatTab
        threads={threadRows}
        waiting={items.filter((i) => i.status === "needs_owner")}
        alerts={chatAlerts}
        focusThread={threadFocus}
        onOpenThread={(id) => {
          setThreadFocus(id);
          syncUrl({ thread: id });
        }}
        onOpenItem={openItem}
        itemTitle={(id) => items.find((i) => i.id === id)?.title ?? null}
        run={run}
      />
    );
  else if (tab === "activity")
    content = (
      <ActivityTab agent={activityAgent} onOpenItem={openItem} week={week} />
    );
  else if (tab === "memory")
    content = <MemoryTab notes={notes} tag={memTag} q={memQ} run={run} />;

  return (
    <AgentHueProvider value={hues}>
      <div
        className="nx-window cn-screen-box ag-night"
        data-v3-screen="agents"
        data-ag-screen={tab}
      >
        {tab === "chat" ? (
          // Chat takes the whole window too, one centred column.
          <div
            id="ag-panel"
            role="tabpanel"
            aria-labelledby="ag-tab-chat"
            className="ag-map-stage ag-chat-stage"
          >
            {content}
          </div>
        ) : tab === "map" ? (
          // The Map takes the whole window: no hero (owner, 05.11.26).
          <div
            id="ag-panel"
            role="tabpanel"
            aria-labelledby="ag-tab-map"
            className="ag-map-stage"
          >
            {mapReady ? (
              <AgentsMap
                data={mapData}
                seed={seed}
                status={overview.data ? statsLine(stats) : null}
                onNewLayout={() => setSeed(freshSeed())}
                onReplaySetup={() => setReplay(true)}
                onOpenChat={() => setTab("chat")}
                paused={showOnboarding}
                onOpenAgent={openAgent}
                onOpenItem={openItem}
                onOpenThread={openThread}
              />
            ) : (
              <div className="ag-map-panel is-loading" aria-busy="true" />
            )}
            {showOnboarding ? (
              <AgentsSetup
                agentCount={live.length}
                known={known}
                onDone={() => {
                  setOnboarded(true);
                  setReplay(false);
                }}
                onFinish={() => setSeed(freshSeed())}
              />
            ) : null}
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="scroll-inner nx-scroll cn-wrap cn-screen-abs ag-scroll"
          >
            <div className="ag-page">
              <header className="ag-hero nx-swap">
                <span className="ag-eyebrow">Your team</span>
                <h1 className="px-display ag-h1">Agents</h1>
                <span className="ag-hero-row">
                  {overview.data ? (
                    <span className="ag-pill" data-ag-status="">
                      <i aria-hidden="true" />
                      {statsLine(stats)}
                    </span>
                  ) : overview.isError ? (
                    <span className="ag-pill is-none" data-ag-status="error">
                      Could not load your agents
                    </span>
                  ) : null}
                  <button
                    type="button"
                    className="ag-btn"
                    aria-pressed={tab === "agents" && showGuide}
                    data-ag-connect=""
                    onClick={() => {
                      setManualGuide(true);
                      setTab("agents");
                    }}
                  >
                    <FiPlus size={13} aria-hidden />
                    Connect an agent
                  </button>
                </span>
              </header>

              <div ref={sentinel} className="cn-sentinel" aria-hidden="true" />
              {toolbar ? (
                <div
                  className={"ag-sticky" + (stuck ? " is-stuck" : "")}
                  data-ag-sticky={stuck ? "stuck" : "rest"}
                >
                  {toolbar}
                </div>
              ) : null}

              <div
                id="ag-panel"
                role="tabpanel"
                aria-labelledby={"ag-tab-" + tab}
                className="ag-tabpanel"
                key={tab}
              >
                <StScreen query={overview} kind="list" screen="agents">
                  {content}
                </StScreen>
              </div>
            </div>
          </div>
        )}
        <div
          role="tablist"
          aria-label="Agents sections"
          className="ag-tabs ag-dock"
          onKeyDown={onTabKey}
        >
          {TABS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={"ag-tab-" + id}
              aria-controls="ag-panel"
              aria-selected={tab === id}
              tabIndex={tab === id ? 0 : -1}
              className="ag-tab"
              data-ag-tab={id}
              onClick={() => setTab(id)}
            >
              {label}
              {count[id] ? <small>{count[id]}</small> : null}
              {id === "chat" && stats.waiting ? (
                <span
                  className="ag-tab-dot"
                  role="img"
                  aria-label={`${stats.waiting} waiting on your answer`}
                />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </AgentHueProvider>
  );
}
