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
import { useMcpConnect } from "./useMcpConnect";

export const TAB_KEY = "needt.connections.tab";

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
  const [confirm, setConfirm] = useState<CnItem | null>(null);
  const [caldav, setCaldav] = useState(false);
  const [api, setApi] = useState(false);
  const [setup, setSetup] = useState<AiToolId | null>(null);

  useEffect(() => {
    // `/settings#ai` lands here as `/connections#ai`: open the AI tools tab.
    if (window.location.hash === "#ai") return setTab("ai");
    try {
      if (window.localStorage.getItem(TAB_KEY) === "ai") setTab("ai");
    } catch {
      /* private mode: the tab starts on Apps */
    }
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
  const disconnect = async (item: CnItem) => {
    if (!item.accountId) return;
    setBusy(item.key);
    const kind = disconnectKind(item);
    const r =
      kind === "calendar"
        ? await disconnectCalendar(item.accountId)
        : kind === "mailbox"
          ? await disconnectMailbox(item.accountId)
          : kind === "pinterest"
            ? await disconnectPinterest()
            : await disconnectToolkit(item.accountId);
    setBusy(null);
    setConfirm(null);
    if (!r.ok) return void notify.error(r.error);
    notify.success(
      item.account && item.account !== item.name
        ? `${item.name} (${item.account}) disconnected`
        : `${item.name} disconnected`
    );
    await refresh();
  };

  /**
   * Sync now: queue the worker's sync for a connected calendar or mailbox,
   * say so, and read the connections again a few seconds on, when the job has
   * run. The notice says "started": the job is queued, not finished.
   */
  const syncNow = async (item: CnItem) => {
    if (!canSyncNow(item) || !item.accountId) return;
    const kind = item.kind === "mail" ? "mail" : "calendar";
    const r = await syncAccountNow(kind, item.accountId);
    if (!r.ok) return void notify.error(r.error);
    if (!r.queued) return void notify.info("Nothing to sync yet.");
    notify.success(`Syncing ${item.name}…`);
    window.setTimeout(() => {
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
    caldavDone,
    mcp,
    setup,
    setSetup,
  };
}

export type ConnectionsController = ReturnType<typeof useConnectionsController>;
