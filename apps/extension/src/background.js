// @ts-check
import { api, getSettings, NeedtError, todayKey } from "./lib/api.js";
import { RULE_ID_BASE, rulesFor } from "./lib/blocking.js";

/**
 * The service worker: polls what Needt says to block, turns it into network
 * rules, opens a project's saved tabs when its focus block starts, and files
 * selections, links and pages as tasks from the context menu.
 */

const POLL = "needt-poll";
const POLL_MINUTES = 1;

/** @typedef {{ active: boolean, mode: string | null, sites: string[], apps: string[], until: string | null, profiles: { id: string, name: string, reason: { kind: string, id: string, title: string | null, until: string | null } }[] }} Active */

async function needtHost() {
  const { baseUrl } = await getSettings();
  return new URL(baseUrl).hostname;
}

/** Replaces our dynamic rules with the ones `active` asks for. */
async function applyRules(active) {
  const rules = rulesFor(active, await needtHost());
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.filter((r) => r.id >= RULE_ID_BASE).map((r) => r.id),
    addRules: /** @type {chrome.declarativeNetRequest.Rule[]} */ (rules),
  });
}

/** Opens the saved tabs of the projects behind newly active profiles. */
async function openProjectTabs(active, previous) {
  const before = new Set((previous?.profiles ?? []).map((p) => p.id));
  const started = active.profiles.filter((p) => !before.has(p.id));
  if (started.length === 0) return;
  const { projectTabs = {} } = await chrome.storage.sync.get("projectTabs");
  let profiles = [];
  try {
    profiles = (await api("/api/blocking/profiles")).profiles ?? [];
  } catch {
    return;
  }
  const projectIds = new Set(
    profiles
      .filter((p) => started.some((s) => s.id === p.id))
      .flatMap((p) => p.projectIds)
  );
  const urls = [...projectIds].flatMap((id) => projectTabs[id]?.urls ?? []);
  const open = new Set((await chrome.tabs.query({})).map((t) => t.url));
  for (const url of urls) if (!open.has(url)) await chrome.tabs.create({ url, active: false });
}

/** One poll: read, store, apply. Errors leave blocking off and are kept for the UI. */
export async function refresh() {
  const { active: previous } = await chrome.storage.local.get("active");
  /** @type {Active} */
  let active = { active: false, mode: null, sites: [], apps: [], until: null, profiles: [] };
  let status = "ok";
  try {
    active = await api("/api/blocking/active");
  } catch (error) {
    status =
      error instanceof NeedtError
        ? error.code === "UPGRADE_REQUIRED"
          ? "upgrade"
          : error.status === 404
            ? "unavailable"
            : error.status === 401
              ? "signed-out"
              : "error"
        : "offline";
  }
  await chrome.storage.local.set({ active, blockingStatus: status, checkedAt: Date.now() });
  await applyRules(active);
  if (active.active) await openProjectTabs(active, previous);
  if (active.until) {
    const when = new Date(active.until).getTime() + 1000;
    if (when > Date.now()) chrome.alarms.create("needt-until", { when });
  }
}

const MENU = {
  selection: "needt-selection",
  link: "needt-link",
  page: "needt-page",
};

function setupMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.selection, title: "Add “%s” to Needt", contexts: ["selection"] });
    chrome.contextMenus.create({ id: MENU.link, title: "Add link to Needt", contexts: ["link"] });
    chrome.contextMenus.create({ id: MENU.page, title: "Add page to Needt", contexts: ["page"] });
  });
}

/** Files a task; the description carries where it came from. */
export async function captureTask({ title, url, pageTitle, quote, fields = {} }) {
  const source = [quote ? `> ${quote}` : "", pageTitle && url ? `[${pageTitle}](${url})` : url ?? ""]
    .filter(Boolean)
    .join("\n\n");
  return api("/api/connect/tasks", {
    method: "POST",
    body: { title: title.slice(0, 500), description: source || undefined, ...fields },
  });
}

async function notify(message) {
  await chrome.action.setBadgeText({ text: message ? "✓" : "" });
  setTimeout(() => chrome.action.setBadgeText({ text: "" }), 2000);
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    if (info.menuItemId === MENU.selection && info.selectionText) {
      await captureTask({ title: info.selectionText, quote: info.selectionText, url: tab?.url, pageTitle: tab?.title });
    } else if (info.menuItemId === MENU.link && info.linkUrl) {
      await captureTask({ title: info.linkUrl, url: info.linkUrl });
    } else if (tab?.url) {
      await captureTask({ title: tab.title || tab.url, url: tab.url, pageTitle: tab.title });
    }
    await notify("added");
  } catch (error) {
    await chrome.action.setBadgeText({ text: "!" });
    console.warn("Needt capture failed", error);
  }
});

/** The YouTube filter and the pages ask the worker; it owns the snooze budget. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message?.type === "refresh") {
      await refresh();
      sendResponse(await chrome.storage.local.get(["active", "blockingStatus"]));
    } else if (message?.type === "snooze") {
      const key = `snooze:${todayKey()}`;
      const { [key]: used = 0, filterDailySnooze = 15 } = await chrome.storage.local.get([key, "filterDailySnooze"]);
      const minutes = Math.min(message.minutes ?? 5, filterDailySnooze - used);
      if (minutes <= 0) return sendResponse({ ok: false, left: 0 });
      const until = Date.now() + minutes * 60_000;
      await chrome.storage.local.set({ [key]: used + minutes, snoozedUntil: until });
      sendResponse({ ok: true, until, left: filterDailySnooze - used - minutes });
    } else if (message?.type === "capture") {
      try {
        sendResponse({ ok: true, task: await captureTask(message.task) });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message ?? error) });
      }
    }
  })();
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL || alarm.name === "needt-until") refresh();
});

chrome.runtime.onInstalled.addListener(() => {
  setupMenus();
  chrome.alarms.create(POLL, { periodInMinutes: POLL_MINUTES });
  refresh();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL, { periodInMinutes: POLL_MINUTES });
  refresh();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.token || changes.baseUrl)) refresh();
});
