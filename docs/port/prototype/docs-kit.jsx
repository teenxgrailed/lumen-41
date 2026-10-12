const { Menu } = window.NeedtDesignSystem_25d3c8;

/* DOCS KIT — the part of the Docs place the rest of the app needs at first
   paint (08.10.26, split from DocsScreen.jsx for the lazy build): the seed
   pages (DOCS), the desktop's theme helpers, dcSetStyle, and the
   miniature (MiniDoc / DocThumb) the sidebar, search and cards draw. The
   Docs grid, the editor, Share and the inspector stay in DocsScreen.jsx,
   which loads on demand (build.js). The style model itself (tables,
   dcStyleOf, backdrops, covers) is in doc-style.jsx, shared with the phone. */

/* Every card shows the page's own words, never grey bars: a document is
   recognised by what it says. */
const DOCS = [
  { id: "launch", title: "Launch brief — September", projectId: "ops", hue: "var(--info)", style: { ground: "sand" }, updated: "20 min ago", viewed: "Just now", created: "2 Sep",
    body: [["lead", "The scheduler places work into real free hours, so the calendar is the plan rather than a record of it."], ["h", "Scope"], ["li", "Tasks and events share one grid."], ["li", "The rail on a block means movability, and nothing else."], ["shot"], ["h", "Open questions"], ["todo", "Decide the Mail tab badge", true], ["todo", "Friday review owns the rest"]] },
  { id: "rules", title: "Needt design rules", projectId: "ds", hue: "var(--success)", style: { ground: "mist", theme: "sage" }, updated: "Yesterday", viewed: "Yesterday", created: "11 Sep",
    body: [["callout", "Four rules hold every screen together. Break one only on purpose and write down why."], ["rule"], ["h", "Get to know the rules"], ["cards", ["Greys", "Type", "Accent", "Rows"]]] },
  { id: "placement", title: "Scheduler — placement notes", projectId: "ds", hue: "var(--success)", style: { theme: "rose" }, updated: "3 days ago", viewed: "3 days ago", created: "20 Aug",
    body: [["p", "Every auto-placed block has a reason and no planner shows one, which is why people redo the scheduler's work by hand."], ["quote", "Show the reason on hover, never as a badge."], ["p", "Next step: a reason line under the block title, 12px, quaternary."]] },
  { id: "review", title: "Weekly review, week 35", projectId: null, style: { ground: "sage" }, updated: "5 days ago", viewed: "5 days ago", created: "29 Aug",
    body: [["h", "Went well"], ["todo", "Shipped the shell", true], ["todo", "Four sales on Vinted", true], ["h", "Next"], ["todo", "Mailbox as a place, not a link"], ["todo", "Book the B1 exam date"]] },
  { id: "german", title: "German B2 — verbs to drill", projectId: "german", hue: "var(--text-muted)", style: { ground: "stone", theme: "ocean" }, updated: "1 week ago", viewed: "4 days ago", created: "1 Aug",
    body: [["table", [["sich verlassen", "auf + Akk"], ["sich beschweren", "über + Akk"], ["abhängen", "von + Dat"], ["teilnehmen", "an + Dat"]]], ["p", "Drill two a day, out loud, in a full sentence."]] },
  { id: "untitled", title: "", projectId: null, style: null, updated: "1 hour ago", viewed: "27 min ago", created: "Today", body: [] }
];

/* The ambient tint on the app's ground, written as a style element so the
   shell's own writes to <html> can never wipe it. Null fades it back out. */
function dtAmbient(t) {
  const root = document.documentElement;
  let el = document.getElementById("dt-ambient");
  if (!el) { el = document.createElement("style"); el.id = "dt-ambient"; document.head.appendChild(el); }
  if (t && t.amb) {
    el.textContent = ":root{--dt-amb:" + t.amb[0] + "}:root.dark{--dt-amb:" + t.amb[1] + "}";
    root.setAttribute("data-dt-ambient", t.id);
  } else root.removeAttribute("data-dt-ambient");
}

/* Writes style and coverUrl back as the two fields they are. */
function dcSetStyle(doc, patch) {
  if (!doc) return;
  const next = Object.assign({}, dcStyleOf(doc), patch);
  const coverUrl = next.cover || null;
  delete next.cover;
  const st = dcStyleField(doc);
  if (st.theme) next.theme = st.theme;
  if (st.ground) next.ground = st.ground;
  window.docs.patch(doc.id, { style: next, coverUrl: coverUrl });
}
const docText = (doc) => doc.body.map((b) => b[0] === "cards" ? b[1].join(" · ") : b[0] === "table" ? b[1].map((r) => r.join(" ")).join(" · ") : b[0] === "image" ? "" : spansToText(b[1])).filter((t) => typeof t === "string" && t).join(" · ");
/* A block in miniature. Text is rich (doc-style.jsx spans): drawn with its
   marks, links as words (the card's click opens the page). */
function MiniBlock({ b: raw }) {
  const b = dxMigrateBlock(raw);
  const k = b[0], c = b[2];
  const a = DX_TEXT_KINDS[k] ? renderSpans(b[1], true) : b[1];
  if (k === "h") return <div className="docs-mini-block-1">{a}</div>;
  if (k === "lead") return <div className="docs-mini-p docs-mini-lead">{a}</div>;
  if (k === "callout") return <div className="docs-mini-block-2">{a}</div>;
  if (k === "quote") return <div className="docs-mini-p docs-mini-quote">{a}</div>;
  if (k === "li") return <div className="docs-mini-p docs-mini-li"><span>•</span><span>{a}</span></div>;
  if (k === "todo") return (
    <div className={"docs-mini-p docs-mini-todo" + (c ? " is-on" : "")}>
      <span className={"docs-mini-block-3 docs-mini-block-s1" + (c ? " is-on" : "")} />{a}
    </div>);
  if (k === "rule") return <div className="docs-mini-block-4" />;
  if (k === "shot") return (
    <div className="docs-mini-block-5">
      <div className="docs-mini-block-6">
        <div className="docs-mini-block-7">{[70, 50, 60, 40].map((w, i) => <span className="docs-mini-block-8" key={i} style={{ width: w + "%" }} />)}</div>
        <div className="docs-mini-block-7">
          <span className="docs-mini-block-9" />
          {[90, 75, 82].map((w, i) => <span className="docs-mini-block-8" key={i} style={{ width: w + "%" }} />)}
          <span className="docs-mini-block-10" />
        </div>
      </div>
    </div>);
  if (k === "cards") return (
    <div className="docs-mini-block-11">
      {a.map((t) => <div className="docs-mini-block-12" key={t}>{t}</div>)}
    </div>);
  if (k === "table") return (
    <div className="docs-mini-block-13">
      {a.map((row, i) => <div className="docs-mini-block-14" key={i} style={{ gridTemplateColumns: "repeat(" + row.length + ", 1fr)", boxShadow: i ? "var(--border) 0 1px 0 0 inset" : "none" }}>{row.map((x, j) => <span className={"docs-mini-block-15 docs-mini-block-s2" + (j ? " is-on" : "")} key={j}>{x}</span>)}</div>)}
    </div>);
  if (k === "task") return <div className="docs-mini-p docs-mini-task"><span className="docs-mini-block-16" />{a}</div>;
  if (k === "suggest") return null;
  /* the phone's + Content blocks (phone-docs.jsx): a picture, a page link, a date */
  if (k === "image") return a ? <img className="docs-mini-img" src={a} alt="" draggable={false} /> : null;
  if (k === "page") { const t = a && window.docs && window.docs.find ? window.docs.find(a) : null; return <div className="docs-mini-p docs-mini-task">{t ? t.title || "Untitled" : "Untitled page"}</div>; }
  if (k === "date") return <p className="docs-mini-p">{a}</p>;
  return <p className="docs-mini-p">{DX_TEXT_KINDS[k] || typeof a === "string" ? a : ""}</p>;
}
function MiniDoc({ doc, width, scale, title }) {
  return (
    <div className="docs-mini-doc-1" style={{ width: width ? width / scale : (100 / scale) + "%", transform: "scale(" + scale + ")" }}>
      {title ? <div className={"docs-mini-doc-2 docs-mini-doc-s1" + (doc.title ? " is-on" : "")}>{doc.title || "Untitled"}</div> : null}
      {doc.body.map((b, i) => <MiniBlock key={i} b={b} />)}
    </div>
  );
}
function DocMiniature({ doc, rows }) {
  if (!doc.body.length) return null;
  return <MiniDoc doc={Object.assign({}, doc, { body: doc.body.slice(0, rows || 99) })} scale={0.5} />;
}

/* A page in miniature: the page's ground as a frame, the white sheet inside
   it. Used where a document needs a face smaller than a card. */
function DocThumb({ doc, w, h }) {
  const s = dcStyleOf(doc);
  const bd = s.backdrop !== "none";
  const pad = bd ? Math.max(2, Math.round(w / 9)) : 0;
  const ip = Math.round(w / 8);
  return (
    <span aria-hidden="true" className={"docs-thumb" + (bd ? " dc-bd" : "")} style={Object.assign({ width: w, height: h, borderRadius: Math.round(w / 5),
      padding: bd ? pad + "px " + pad + "px 0" : 0 }, bd ? dcBdVars(s.backdrop) : null)}>
      <span className={"dt-themed docs-thumb-page" + (bd ? " is-on" : "")} style={Object.assign({ borderRadius: bd ? ip + "px " + ip + "px 0 0" : 0 }, dcVars(s))}>
        {s.cover ? <span className="docs-doc-thumb-1" style={{ height: Math.round(h * 0.22) }}><DcCover cover={s.cover} /></span> : null}
        <span className="docs-doc-thumb-2" style={{ padding: ip }}>
          <MiniDoc doc={doc} width={w - 2 * pad - 2 * ip} scale={0.14 * w / 30} title />
        </span>
      </span>
    </span>
  );
}

Object.assign(window, { DocThumb, MiniDoc, DOCS, dcSetStyle });
if (window.docs) window.docs.seed(DOCS);
