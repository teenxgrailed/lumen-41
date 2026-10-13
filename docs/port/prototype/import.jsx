/* IMPORT — the footer's ⬇ menu made real (07.10.26). Each source opens the
   file picker for the formats that source exports; the files become pages,
   events or tasks, and one toast offers Undo for the whole batch.
   Notion and Google Docs have no live connection in the prototype: they take
   the files those apps export (Markdown/CSV, HTML/text). */
const IM_ACCEPT = { markdown: ".md,.markdown,.txt", notion: ".md,.csv,.txt", gdocs: ".html,.htm,.txt,.md", ics: ".ics", csv: ".csv" };

function imMdBlocks(text) {
  const out = []; let title = null;
  text.replace(/\r/g, "").split("\n").forEach((raw) => {
    const l = raw.trimEnd(); if (!l.trim()) return;
    let m;
    if ((m = l.match(/^#\s+(.*)/)) && title == null) { title = m[1].trim(); return; }
    if ((m = l.match(/^#{1,6}\s+(.*)/))) out.push(["h", m[1]]);
    else if ((m = l.match(/^\s*[-*]\s+\[( |x|X)\]\s+(.*)/))) out.push(m[1] === " " ? ["todo", m[2]] : ["todo", m[2], true]);
    else if ((m = l.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)/))) out.push(["li", m[1]]);
    else if ((m = l.match(/^>\s?(.*)/))) out.push(["quote", m[1]]);
    else out.push(["p", l.trim()]);
  });
  return { title: title, body: out };
}
function imHtmlBlocks(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = []; let title = (doc.querySelector("title") || {}).textContent || null;
  doc.body.querySelectorAll("h1,h2,h3,h4,p,li").forEach((el) => {
    const t = el.textContent.replace(/\s+/g, " ").trim(); if (!t) return;
    const tag = el.tagName.toLowerCase();
    if (tag === "h1" && !title) title = t;
    else if (tag[0] === "h") out.push(["h", t]);
    else if (tag === "li") out.push(["li", t]);
    else if (!el.closest("li")) out.push(["p", t]);
  });
  return { title: title, body: out };
}
function imCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === "," || c === ";") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
/* A CSV of tasks: the header names the columns (title/name/task, due/date,
   project, estimate/minutes); without a header the first column is the title. */
function imTasks(rows) {
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const find = (...ks) => head.findIndex((h) => ks.some((k) => h.indexOf(k) > -1));
  let ti = find("title", "name", "task", "content"), di = find("due", "date"), pi = find("project", "list"), ei = find("est", "minute", "duration");
  const hasHead = ti > -1; if (!hasHead) ti = 0;
  const known = (window.projectStore ? window.projectStore.get().list : (window.WK_PROJECTS || [])).map((p) => p.name || p);
  const base = Date.now();
  return rows.slice(hasHead ? 1 : 0).map((r, i) => {
    const proj = pi > -1 ? (r[pi] || "").trim() : "";
    return { id: base + i, title: (r[ti] || "").trim(), projectId: known.indexOf(proj) > -1 ? window.NEEDT.projectIdOf(proj) : null, status: "todo",
      dueDate: di > -1 && r[di] ? window.NEEDT.toDate(r[di].trim()) : null,
      estimatedMinutes: ei > -1 && parseInt(r[ei], 10) ? parseInt(r[ei], 10) : 30, done: false };
  }).filter((t) => t.title);
}
/* VEVENTs onto the prototype's calendar: the day is counted from the real
   today onto the prototype's today (1 Sep), the hour kept as is. */
function imIcs(text) {
  const t = text.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
  const evs = [];
  t.split("BEGIN:VEVENT").slice(1).forEach((blk) => {
    const get = (k) => { const m = blk.match(new RegExp("^" + k + "[^:\\n]*:(.*)$", "m")); return m ? m[1].trim() : null; };
    const s = get("DTSTART"); if (!s) return;
    const p = (v) => { const m = v.match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2}))?/); return m ? new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0)) : null; };
    const a = p(s), e = get("DTEND") ? p(get("DTEND")) : null; if (!a) return;
    const now = new Date(); const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const off = Math.round((new Date(a.getFullYear(), a.getMonth(), a.getDate()) - d0) / 86400000);
    if (off < -1 || off > 29) return;
    /* An ISO date counted from the prototype's today (NEEDT.today), so days
       21–31 no longer fold back into August the way a day-of-month did. */
    const N = window.NEEDT, t0 = N.today, iso = N.iso(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() + off));
    evs.push(N.eventAt(iso, a.getHours() + a.getMinutes() / 60, e ? Math.max(15, Math.round((e - a) / 60000)) : 60, { title: (get("SUMMARY") || "Event").replace(/\\,/g, ",") }));
  });
  return evs;
}

function imPages(files, parse) {
  const made = files.map(([name, text]) => {
    const r = parse(text);
    return window.docs.create({ title: r.title || name.replace(/\.[^.]+$/, ""), body: r.body.length ? r.body : [["p", ""]] });
  });
  window.toast(made.length === 1 ? "Imported “" + (made[0].title || "Untitled") + "”" : "Imported " + made.length + " pages", { undo: () => made.forEach((d) => window.docs.remove(d.id)) });
  if (made.length === 1) window.docs.open(made[0].id); else if (window.__app) window.__app.setScreen("docs");
}
function imAddTasks(list) {
  const app = window.__app; if (!app || !app.setTasksRaw || !list.length) { window.toast("No tasks found in that file"); return; }
  app.setTasksRaw((l) => l.concat(list));
  const ids = new Set(list.map((t) => t.id));
  window.toast("Imported " + list.length + (list.length === 1 ? " task" : " tasks"), { undo: () => app.setTasksRaw((l) => l.filter((t) => !ids.has(t.id))) });
  app.setScreen("tasks");
}

function needtImport(kind) {
  window.needtPlatform.pickFile({ multiple: kind !== "ics", accept: IM_ACCEPT[kind] || "" }).then((fs) => {
    if (!fs.length) return;
    Promise.all(fs.map((f) => f.text().then((t) => [f.name, t]))).then((files) => {
      try {
        if (kind === "ics") {
          const evs = files.reduce((a, [, t]) => a.concat(imIcs(t)), []);
          if (!evs.length || !window.calEvents) { window.toast("No events in the next 30 days in that file"); return; }
          const made = evs.map((e) => window.calEvents.add(e));
          window.toast("Imported " + made.length + (made.length === 1 ? " event" : " events"), { undo: () => made.forEach((e) => window.calEvents.remove(e.id)) });
          window.__app && window.__app.setScreen("calendar");
          return;
        }
        if (kind === "csv" || (kind === "notion" && files.every(([n]) => /\.csv$/i.test(n)))) {
          imAddTasks(files.reduce((a, [, t]) => { const rows = imCsv(t); return rows.length ? a.concat(imTasks(rows)) : a; }, []));
          return;
        }
        const pages = files.filter(([n]) => !/\.csv$/i.test(n));
        imPages(pages, (t) => /<\s*(html|body|p|h1|div)[\s>]/i.test(t) ? imHtmlBlocks(t) : imMdBlocks(t));
      } catch (e) { window.toast("Couldn't read that file"); }
    });
  });
}

Object.assign(window, { needtImport });
