// @ts-check
import { api, DEFAULT_BASE_URL } from "../lib/api.js";
import { reasonLine } from "../lib/blocking.js";

const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean);

const STATUS = {
  ok: "",
  upgrade: "Focus blocking is part of Pro.",
  unavailable: "Focus blocking is not switched on for this account yet.",
  "signed-out": "The token was refused. Generate a new one in Settings → Personal API.",
  error: "Needt did not answer. It will try again in a minute.",
  offline: "Offline. It will try again in a minute.",
};

async function showBlocking() {
  const { active, blockingStatus } = await chrome.runtime.sendMessage({ type: "refresh" });
  $("blocking").textContent =
    STATUS[blockingStatus] ||
    (active?.active ? `Blocking ${active.sites.length} sites: ${reasonLine(active)}` : "Nothing is blocked right now.");
}

const s = await chrome.storage.local.get([
  "baseUrl", "token", "filterEnabled", "filterThreshold", "filterDailySnooze", "allowChannels", "blockChannels",
]);
$("baseUrl").value = s.baseUrl || DEFAULT_BASE_URL;
$("token").value = s.token || "";
$("filterEnabled").value = s.filterEnabled === false ? "off" : "on";
$("filterThreshold").value = String(s.filterThreshold ?? 0.34);
$("filterDailySnooze").value = String(s.filterDailySnooze ?? 15);
$("allowChannels").value = (s.allowChannels ?? []).join("\n");
$("blockChannels").value = (s.blockChannels ?? []).join("\n");

$("save").addEventListener("click", async () => {
  const baseUrl = $("baseUrl").value.trim().replace(/\/+$/, "") || DEFAULT_BASE_URL;
  const origin = `${new URL(baseUrl).origin}/*`;
  if (!origin.startsWith("https://use.needt.app")) {
    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) return ($("connection").textContent = "Chrome needs permission to reach that server.");
  }
  await chrome.storage.local.set({ baseUrl, token: $("token").value.trim() });
  try {
    const today = await api("/api/connect/today");
    $("connection").textContent = `Connected. ${today?.counts?.open ?? 0} open tasks today.`;
  } catch (error) {
    $("connection").textContent = String(error?.message ?? error);
  }
  showBlocking();
});

$("saveFilter").addEventListener("click", async () => {
  await chrome.storage.local.set({
    filterEnabled: $("filterEnabled").value === "on",
    filterThreshold: Number($("filterThreshold").value),
    filterDailySnooze: Number($("filterDailySnooze").value),
    allowChannels: lines($("allowChannels").value),
    blockChannels: lines($("blockChannels").value),
  });
  $("filterStatus").textContent = "Saved.";
});

showBlocking();
