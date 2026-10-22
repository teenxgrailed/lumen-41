// @ts-check
import { api, getSettings } from "../lib/api.js";
import { reasonLine } from "../lib/blocking.js";

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

$("clock").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

const { active } = await chrome.storage.local.get("active");
if (active?.active) {
  $("focus").hidden = false;
  $("focus").append(el("div", { className: "meta" }, ["Focus"]), el("div", {}, [el("span", { className: "mark" }), reasonLine(active)]));
}

try {
  const { baseUrl } = await getSettings();
  const today = await api("/api/connect/today");
  if (today.event) {
    $("event").hidden = false;
    $("event").append(
      el("div", { className: "meta" }, ["Next event"]),
      el("div", { className: "item" }, [
        el("span", { textContent: today.event.title }),
        el("span", { className: "meta", textContent: today.event.allDay ? "All day" : time(today.event.start) }),
      ])
    );
  }
  const tasks = (today.tasks ?? []).slice(0, 3);
  if (tasks.length) {
    $("tasks").hidden = false;
    $("tasks").append(
      el("div", { className: "meta" }, [`Today · ${today.counts.done} of ${today.counts.total} done`]),
      ...tasks.map((t) =>
        el("div", { className: "item" }, [
          el("a", { href: `${baseUrl}${t.href}`, textContent: t.title }),
          el("span", { className: "meta", textContent: t.start ? time(t.start) : t.overdue ? "Overdue" : "" }),
        ])
      )
    );
  }
  if (!today.event && !tasks.length && !active?.active) {
    $("empty").hidden = false;
    $("empty").textContent = "Nothing planned for the rest of today.";
  }
} catch (error) {
  $("empty").hidden = false;
  $("empty").textContent = String(error?.message ?? error);
}
