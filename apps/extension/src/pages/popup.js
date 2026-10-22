// @ts-check
import { listProjects } from "../lib/api.js";
import { parseQuickAdd } from "../lib/quick-add.js";

const $ = (id) => /** @type {HTMLInputElement} */ (document.getElementById(id));
const status = (text) => ($("status").textContent = text);

let projects = [];
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

function render() {
  const parsed = parseQuickAdd($("title").value);
  $("chips").replaceChildren(
    ...parsed.chips.map((c) => Object.assign(document.createElement("span"), { className: "chip", textContent: c.label }))
  );
  if (parsed.project) {
    const match = projects.find((p) => p.name.toLowerCase().startsWith(parsed.project.toLowerCase()));
    if (match) $("project").value = match.id;
  }
  return parsed;
}

async function send(task) {
  status("Adding…");
  const answer = await chrome.runtime.sendMessage({ type: "capture", task });
  status(answer?.ok ? "Added and scheduled." : `Not added: ${answer?.error ?? "no answer"}`);
  if (answer?.ok) setTimeout(() => window.close(), 700);
}

function fields(parsed) {
  return {
    ...(parsed.estimatedMinutes ? { estimatedMinutes: parsed.estimatedMinutes } : {}),
    ...(parsed.priorityLevel ? { priorityLevel: parsed.priorityLevel } : {}),
    ...(parsed.deadline ? { deadline: parsed.deadline } : {}),
    ...($("project").value ? { projectId: $("project").value } : {}),
  };
}

$("title").addEventListener("input", render);
$("title").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("add").click();
});
$("add").addEventListener("click", () => {
  const parsed = render();
  if (!parsed.title) return status("Type a task first.");
  send({ title: parsed.title, url: tab?.url, pageTitle: tab?.title, fields: fields(parsed) });
});
$("page").addEventListener("click", () => {
  const parsed = render();
  send({ title: parsed.title || tab?.title || tab?.url || "Page", url: tab?.url, pageTitle: tab?.title, fields: fields(parsed) });
});
$("tabs").addEventListener("click", async () => {
  const id = $("project").value;
  if (!id) return status("Pick a project first.");
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const urls = tabs.map((t) => t.url).filter((u) => u && /^https?:/.test(u));
  const { projectTabs = {} } = await chrome.storage.sync.get("projectTabs");
  projectTabs[id] = { urls: urls.slice(0, 30), savedAt: Date.now() };
  await chrome.storage.sync.set({ projectTabs });
  status(`${urls.length} tabs saved. They open when this project's focus block starts.`);
});

// Selected text on the page becomes the title.
try {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => String(getSelection() ?? "").trim(),
  });
  if (result) $("title").value = result.slice(0, 300);
} catch {
  /* chrome:// pages and the like: no selection to read */
}
render();

try {
  projects = await listProjects();
  for (const p of projects) $("project").append(new Option(p.name, p.id));
  render();
} catch (error) {
  status(String(error?.message ?? error));
}
