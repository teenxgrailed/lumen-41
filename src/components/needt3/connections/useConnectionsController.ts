"use client";

import { useEffect, useMemo, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import {
  connectToolkit,
  disconnectCalendar,
  disconnectMailbox,
  disconnectPinterest,
  disconnectToolkit,
  startOAuth,
  syncAccountNow,
  useCatalog,
} from "@/lib/needt3/hooks/catalog";
import { useConnections } from "@/lib/needt3/hooks/connections";
import {
  disconnectGoogleTasks,
  syncGoogleTasksNow,
} from "@/lib/needt3/hooks/google-tasks";
import { usePlan } from "@/lib/needt3/hooks/plan";
import { qk } from "@/lib/needt3/query-keys";
import { notify } from "@/lib/notifications";

import { useNeedt3Ui } from "@/store/needt3-ui";

import {
  type CnItem,
  type Show,
  aiToolsLocked,
  buildItems,
  canSyncNow,
  connectPlan,
  counts,
  disconnectKind,
  filterItems,
  visibleItems,
} from "./derive";
import type { AiToolId } from "./mcp";
import { strings } from "./strings";
import { useMcpConnect } from "./useMcpConnect";

export const TAB_KEY = "needt.connections.tab";
/**
 * Screen memory (prototype `needt.cnState`): the search, the chip and
 * Connected / All live in sessionStorage, so leaving for Documents and coming
 * back lands where you were. Only an explicit action resets them.
 */
export const STATE_KEY = "needt.cnState";

interface Remembered {
  q: string;
  chip: string;
  show: Show;
}

function recall(): Partial<Remembered> {
  try {
    const v = JSON.parse(
      window.sessionStorage.getItem(STATE_KEY) ?? "{}"
    ) as Partial<Remembered>;
    return {
      ...(typeof v.q === "string" ? { q: v.q } : {}),
      ...(typeof v.chip === "string" ? { chip: v.chip } : {}),
      ...(v.show === "all" || v.show === "connected" ? { show: v.show } : {}),
    };
  } catch {
    return {};
  }
}

export type ConnectionsTab = "apps" | "ai";

/**
 * Everything Connections keeps or does, in one hook so the route calls it once
 * above its two faces (desktop cards, phone rows). Crossing 700 px swaps the
 * face; the tab, the search, the chip, the pending connect / disconnect, the
 * open confirm and the CalDAV sheet all live here and survive it.
 */
export function useConnectionsController() {
  const qc = useQueryClient();
  const plan = usePlan();
  const accounts = useConnections();
  const catalog = useCatalog();
  const openSettings = useNeedt3Ui((s) => s.openSettings);
  const [tab, setTab] = useState<ConnectionsTab>("apps");
  const [q, setQ] = useState("");
  const [chip, setChip] = useState("all");
  const [show, setShow] = useState<Show>("all");
  const [busy, setBusy] = useState<string | null>(null);
  /** The card whose Sync now is running (its key). */
  const [syncing, setSyncing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<CnItem | null>(null);
  const [caldav, setCaldav] = useState(false);
  const [api, setApi] = useState(false);
  const [setup, setSetup] = useState<AiToolId | null>(null);
  // Google Tasks: the lists sheet (by card key), and what Google sent us back with.
  const [listsKey, setListsKey] = useState<string | null>(null);
  const [returned, setReturned] = useState<string | null>(null);

  useEffect(() => {
    const v = recall();
    if (v.q !== undefined) setQ(v.q);
    if (v.chip !== undefined) setChip(v.chip);
    if (v.show !== undefined) setShow(v.show);
  }, []);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        STATE_KEY,
        JSON.stringify({ q, chip, show } satisfies Remembered)
      );
    } catch {
      /* private mode: the screen starts fresh next time */
    }
  }, [q, chip, show]);
  useEffect(() => {
    // `/settings#ai` lands here as `/connections#ai`: open the AI tools tab.
    if (window.location.hash === "#ai") return setTab("ai");
    try {
      if (window.localStorage.getItem(TAB_KEY) === "ai") setTab("ai");
    } catch {
      /* private mode: the tab starts on Apps */
    }
  }, []);
  useEffect(() => {
    // The Google Tasks callback lands here as `?googleTasks=<result>`: say what
    // happened (or open the lists to import) and take it off the address.
    const url = new URL(window.location.href);
    const result = url.searchParams.get("googleTasks");
    if (!result) return;
    url.searchParams.delete("googleTasks");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (result === "lists") return setReturned("lists");
    notify.error(
      result === "denied"
        ? strings.tasksDenied
        : result === "scope_missing"
          ? strings.tasksScopeMissing
          : strings.tasksConnectFailed
    );
  }, []);
  const pickTab = (t: ConnectionsTab) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      /* the choice lasts until reload */
    }
  };

  const isAdmin = !!catalog.data?.isAdmin;
  const items = useMemo(
    () =>
      catalog.data
        ? visibleItems(
            buildItems(
              catalog.data.catalog,
              catalog.data.integrations,
              accounts.data ?? []
            ),
            !!catalog.data.isAdmin
          )
        : [],
    [catalog.data, accounts.data]
  );
  useEffect(() => {
    if (returned !== "lists") return;
    const card = items.find(
      (i) => i.kind === "tasks" && i.state === "connected"
    );
    if (!card) return;
    setReturned(null);
    setListsKey(card.key);
    notify.success("Google Tasks connected");
  }, [returned, items]);
  const tasksLists = listsKey
    ? (items.find((i) => i.key === listsKey) ?? null)
    : null;
  const shown = filterItems(items, { q, chip, show });
  const c = counts(items);
  const locked = aiToolsLocked(plan.data?.kind);
  const mcp = useMcpConnect(api || (tab === "ai" && !locked && !!plan.data));

  const refresh = () => qc.invalidateQueries({ queryKey: qk.connections() });

  const connect = async (item: CnItem) => {
    const how = connectPlan(item, isAdmin);
    if (how.kind === "unavailable") return void notify.info(how.reason);
    if (how.kind === "caldav") return setCaldav(true);
    if (how.kind === "api") return setApi(true);
    setBusy(item.key);
    const r =
      how.kind === "navigate"
        ? await startOAuth(how.href)
        : await connectToolkit(how.toolkit);
    if (!r.ok) {
      notify.error(r.error);
      setBusy(null);
    }
  };
  /** Answers whether it went (a failure keeps the confirm open). */
  const disconnect = async (item: CnItem): Promise<boolean> => {
    if (!item.accountId) return false;
    setBusy(item.key);
    const kind = disconnectKind(item);
    const r =
      kind === "calendar"
        ? await disconnectCalendar(item.accountId)
        : kind === "mailbox"
          ? await disconnectMailbox(item.accountId)
          : kind === "pinterest"
            ? await disconnectPinterest()
            : kind === "tasks"
              ? await disconnectGoogleTasks(item.accountId)
              : await disconnectToolkit(item.accountId);
    setBusy(null);
    // A failure keeps the confirm open with its button live, to try again.
    if (!r.ok) {
      notify.error(r.error);
      return false;
    }
    setConfirm(null);
    notify.success(
      item.account && item.account !== item.name
        ? `${item.name} (${item.account}) disconnected`
        : `${item.name} disconnected`
    );
    await refresh();
    return true;
  };

  /**
   * Sync now: queue the worker's sync for a connected calendar or mailbox,
   * say so, and read the connections again a few seconds on, when the job has
   * run. The notice says "started": the job is queued, not finished.
   */
  const syncNow = async (item: CnItem) => {
    if (!canSyncNow(item) || !item.accountId || syncing) return;
    setSyncing(item.key);
    if (item.kind === "tasks") {
      const t = await syncGoogleTasksNow(item.accountId);
      setSyncing(null);
      if (!t.ok) return void notify.error(t.error);
      notify.success(strings.tasksSynced);
      void qc.invalidateQueries({ queryKey: qk.tasks() });
      void refresh();
      return;
    }
    const kind = item.kind === "mail" ? "mail" : "calendar";
    const r = await syncAccountNow(kind, item.accountId);
    if (!r.ok) {
      setSyncing(null);
      return void notify.error(r.error);
    }
    if (!r.queued) {
      setSyncing(null);
      return void notify.info("Nothing to sync yet.");
    }
    notify.success(`Syncing ${item.name}…`);
    window.setTimeout(() => {
      setSyncing(null);
      void refresh();
      void qc.invalidateQueries({ queryKey: qk.events() });
      void qc.invalidateQueries({ queryKey: qk.mail() });
    }, 5000);
  };

  /** Apple / iCloud connected: close the form, say so, reload the list. */
  const caldavDone = () => {
    setCaldav(false);
    notify.success("Apple / iCloud connected");
    void refresh();
  };

  return {
    plan,
    accounts,
    catalog,
    openSettings,
    tab,
    pickTab,
    q,
    setQ,
    chip,
    setChip,
    show,
    setShow,
    busy,
    syncing,
    confirm,
    setConfirm,
    caldav,
    setCaldav,
    api,
    setApi,
    items,
    shown,
    counts: c,
    locked,
    connect,
    disconnect,
    syncNow,
    tasksLists,
    openTasksLists: (item: CnItem) => setListsKey(item.key),
    closeTasksLists: () => setListsKey(null),
    caldavDone,
    mcp,
    setup,
    setSetup,
  };
}

export type ConnectionsController = ReturnType<typeof useConnectionsController>;
