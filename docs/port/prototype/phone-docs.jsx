/* phone-docs.jsx — Docs on the Plates phone: the Docs home, and the page
 * itself, fully editable the Craft way (wave 3, 09.10.26). Registers
 * window.PkPlaces.docs.
 *
 *   Home     the large "Docs" title (+ its glyph tile) collapses into the
 *            compact bar over the top blur (PkScreen) · a Quick Open field
 *            (filters by title and text as you type) · Recents / Shared ·
 *            New doc (primary) and From template · a 2-column grid of doc
 *            cards, each a real miniature of its page (backdrop, page colour,
 *            cover, ink, font and its first blocks — the desktop card's
 *            renderer, docs.css docs-mini-*) · long-press a card for Open /
 *            Pin / Duplicate / Move to… / Delete · ⋯ = Sort by (needt.docsSort,
 *            the desktop's choice) · pull down = search docs, Enter = new.
 *   Page     the page full-bleed (title, blocks, cover, backdrop), slid in
 *            over the home; back with the chip or a swipe from the left edge.
 *            Tap any block (or the title) to type: the menu pill tucks away,
 *            a keyboard accessory bar sits over the (simulated) keyboard —
 *            Aa Style · + Content · ⋯ · Done. Aa: block type (Text, Heading,
 *            List, To-do, Quote, Callout, Code), Bold / Italic / Strike and a
 *            colour (Choose a Color, 6 × 3). + Content: Task, To-do, Image,
 *            Divider, Table, Page link, Date. ⋯: Move up / down, Duplicate,
 *            Remind, Page Style, Delete. "/" opens the block menu, ":" the
 *            emoji suggestions (glass popovers over the bar).
 *            Long-press a block, or tap its right-edge handle → the block is
 *            selected and a glass action bar floats at the bottom: Style ·
 *            + Content · Remind · Actions (Duplicate, Move up / down, Copy
 *            link, Turn into) · Delete (with Undo).
 *            ⋯ (top right) = Page Style, Share, Move to…, Pin, Duplicate,
 *            Delete. Page Style: Presets, Cover (None / Image / Art),
 *            Background (None / Solid / Gradient / Image), Immersive / Faded,
 *            Blur image, Default font.
 *
 * Data — one store with the desktop: stores.jsx docStore / window.docs
 * (persisted as needt.docs), so an edit here is on the desktop's page too.
 * A page body is the store's short arrays, exactly the desktop's shape
 * (DocsScreen.jsx bodyToBlocks / blocksToBody): [kind, text, extra?, fmt?].
 * Kinds written here: p, h, li, todo [, done], quote, callout, code, task
 * [, meta], rule, table [rows], image [src], page [doc id], date [label].
 * Text is RICH (doc-style.jsx): a plain string or spans [{ t, b, i, s, code,
 * href, color, hl }] — marks sit on the selected words (Aa and the selection
 * bubble), on the whole block when nothing is selected. The 4th slot keeps
 * { date, remind }; an older page's block-level { b, i, s, color } reads as
 * spans (dxMigrateBlock) and is saved that way with the next edit. The style is
 * the desktop's own fields (doc-style.jsx dcStyleOf; written the way
 * docs-kit.jsx dcSetStyle writes them — window.dcSetStyle when loaded), plus
 * two the phone draws: style.bdLook ("immersive" | "faded") and
 * style.bdBlur (blur the backdrop picture).
 * window.PdDocReader / PdThumb / PdDocs stay exported.
 */
const PdNS = window.NeedtDesignSystem_25d3c8;
const { Icon: PdIcon } = PdNS;
const pdCx = (...a) => a.filter(Boolean).join(" ");
const pdClamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pdReduced = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
let pdSeq = 0;
const pdUid = () => "b" + (++pdSeq).toString(36) + Date.now().toString(36).slice(-3);

/* ── Sort: the desktop's keys and rules, one copy (doc-style.jsx). ── */
const PD_SUB = { name: "By name", viewed: "Recently viewed", created: "Recently created", updated: "Recently edited" };
const pdSortLine = (s) => (s.key !== "name" && s.dir === "asc" ? DC_SORTS.filter((x) => x[0] === s.key)[0][1] + ", oldest first" : s.key === "name" && s.dir === "desc" ? "By name, Z to A" : PD_SUB[s.key]);

/* ── Store access: the shared docs store (stores.jsx), else Mobile.jsx's. ── */
const pdFind = (id) => (window.docs && window.docs.find ? window.docs.find(id) : null);
const pdPatch = (id, p) => { if (window.docs && window.docs.find && window.docs.find(id)) window.docs.patch(id, p); else mbDocPatch(id, p); };
/* Style writes: the desktop's dcSetStyle when the page has it (docs-kit.jsx),
   else the same rule — style and coverUrl as the two fields they are. */
function pdSetStyle(docIn, patch) {
  const doc = pdFind(docIn.id) || docIn;
  if (typeof window.dcSetStyle === "function") { window.dcSetStyle(doc, patch); return; }
  const next = Object.assign({}, dcStyleOf(doc), patch);
  const coverUrl = next.cover || null;
  delete next.cover;
  const st = dcStyleField(doc);
  if (st.theme) next.theme = st.theme;
  if (st.ground) next.ground = st.ground;
  pdPatch(doc.id, { style: next, coverUrl: coverUrl });
}
/* A preset: the desktop's DcGallery rule (backdrop, page, text, font together). */
function pdApplyPreset(docIn, p) {
  const doc = pdFind(docIn.id) || docIn;
  const s = dcStyleOf(doc);
  const next = Object.assign({}, s, p.style);
  delete next.cover;
  const st = dcStyleField(doc);
  const theme = p.id === "sparkles" || p.id === "mist" ? st.theme : p.id;
  if (theme) next.theme = theme; else delete next.theme;
  if (st.ground) next.ground = st.ground;
  if (next.font !== "sans" && window.dcLoadFonts) window.dcLoadFonts();
  pdPatch(doc.id, { style: next });
}
/* A picture from a file, scaled to fit 1400 px, as a JPEG data URL (the
   desktop's dcReadCover rule). */
function pdReadImage(file, done) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1400 / (im.naturalWidth || 1400));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const x = c.getContext("2d"); x.fillStyle = cssVar("--color-white"); x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      done(c.toDataURL("image/jpeg", 0.82));
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}

/* ── Blocks: the store's arrays, with a local id for the editor. ── */
const PD_TEXT = { p: 1, h: 1, li: 1, todo: 1, quote: 1, callout: 1, code: 1, lead: 1, task: 1, event: 1, habit: 1, ask: 1 };
const PD_TYPES = [["p", "Text", "type"], ["h", "Heading", "heading"], ["li", "List", "list-bullets"], ["todo", "To-do", "list-checks"], ["quote", "Quote", "quote"], ["callout", "Callout", "callout"], ["code", "Code", "code-block"]];
const PD_CONTENT = [["task", "Task", "task", "blue"], ["todo", "To-do", "list-checks", "green"], ["image", "Image", "image", "sky"], ["rule", "Divider", "minus", "gray"],
  ["table", "Table", "table", "violet"], ["page", "Page link", "page", "teal"], ["date", "Date", "calendar-days", "red"]];
const PD_SLASH = PD_TYPES.map((t) => ({ k: t[0], label: t[1], icon: t[2], hue: "gray" })).concat(PD_CONTENT.filter((c) => c[0] !== "todo").map((c) => ({ k: c[0], label: c[1], icon: c[2], hue: c[3] })));
const PD_PH = { p: "Type something…", h: "Heading", li: "List", todo: "To-do", quote: "Quote", callout: "Callout", code: "Code", task: "Task name", lead: "Text", event: "Event", habit: "Habit", ask: "Ask Needt" };
/* Choose a Color: 6 × 3. "default" is the page's own ink. */
const PD_COLORS = [["default", "Default"], ["gray", "Gray"], ["brown", "Brown"], ["red", "Red"], ["orange", "Orange"], ["amber", "Amber"],
  ["yellow", "Yellow"], ["lime", "Lime"], ["green", "Green"], ["teal", "Teal"], ["cyan", "Cyan"], ["sky", "Sky"],
  ["blue", "Blue"], ["indigo", "Indigo"], ["violet", "Violet"], ["purple", "Purple"], ["pink", "Pink"], ["rose", "Rose"]];
const PD_EMOJI = [["smile", "😊"], ["grin", "😁"], ["joy", "😂"], ["wink", "😉"], ["heart", "❤️"], ["fire", "🔥"], ["star", "⭐"], ["sparkles", "✨"], ["tada", "🎉"],
  ["rocket", "🚀"], ["check", "✅"], ["x", "❌"], ["warning", "⚠️"], ["bulb", "💡"], ["pin", "📌"], ["memo", "📝"], ["calendar", "📅"], ["clock", "⏰"],
  ["thumbsup", "👍"], ["clap", "👏"], ["wave", "👋"], ["eyes", "👀"], ["thinking", "🤔"], ["coffee", "☕"], ["sun", "☀️"], ["moon", "🌙"], ["cloud", "☁️"],
  ["book", "📚"], ["art", "🎨"], ["music", "🎵"], ["camera", "📷"], ["target", "🎯"], ["chart", "📈"], ["money", "💰"], ["gift", "🎁"], ["muscle", "💪"],
  ["brain", "🧠"], ["seedling", "🌱"], ["flower", "🌸"], ["zap", "⚡"], ["lock", "🔒"], ["link", "🔗"], ["question", "❓"], ["hundred", "💯"], ["party", "🥳"]];

/* a block's words as plain text (its spans' t joined) */
const pdText = (a) => (a ? spansToText(a[1]) : "");
const pdFmt = (a) => (a && a[3] && typeof a[3] === "object" ? a[3] : {});
/* One array in the store's shape: trailing empties dropped. */
function pdArr(k, text, x2, fmt) {
  if (k === "rule") return ["rule"];
  const f = {}; let any = false;
  if (fmt) Object.keys(fmt).forEach((key) => { if (fmt[key] != null && fmt[key] !== false && fmt[key] !== "" && !(key === "color" && fmt[key] === "default")) { f[key] = fmt[key]; any = true; } });
  const out = [k, text == null ? "" : DX_TEXT_KINDS[k] ? dxNorm(text) : text];
  if (x2 != null || any) out.push(x2 == null ? null : x2);
  if (any) out.push(f);
  return out;
}
const pdWithText = (a, t) => pdArr(a[0], t, a[2], pdFmt(a));
const pdWithFmt = (a, p) => pdArr(a[0], a[1], a[2], Object.assign({}, pdFmt(a), p));
const pdBlocks = (body) => (body || []).map((a) => ({ id: pdUid(), a: dxMigrateBlock(a), v: 0 }));
const pdDateLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + dt.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getMonth()];
};
const pdToday = () => (window.NEEDT && window.NEEDT.toDate ? window.NEEDT.toDate("today") : new Date().toISOString().slice(0, 10));

/* Caret: the offset inside a plain-text editable, and putting it back. */
function pdCaret(el) {
  const s = window.getSelection();
  if (!el || !s || !s.rangeCount || !el.contains(s.anchorNode)) return null;
  const r = s.getRangeAt(0), pre = document.createRange();
  pre.selectNodeContents(el); pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function pdPlace(el, off) {
  if (!el) return;
  try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
  const s = window.getSelection(), r = document.createRange();
  const len = el.textContent.length;
  if (off == null || off >= len) { r.selectNodeContents(el); r.collapse(false); }
  else {
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let rem = Math.max(0, off), node, done = false;
    while ((node = w.nextNode())) { if (rem <= node.length) { r.setStart(node, rem); r.collapse(true); done = true; break; } rem -= node.length; }
    if (!done) { r.selectNodeContents(el); r.collapse(off <= 0); }
  }
  s.removeAllRanges(); s.addRange(r);
}
const pdEdOf = (root, id) => (root ? root.querySelector('[data-pd-ed="' + id + '"]') : null);

/* ── Glyph tiles (phone-kit PkGlyph when loaded) ── */
function PdGlyph({ place, kind, size }) {
  if (window.PkGlyph) return <window.PkGlyph place={place} kind={kind} size={size} />;
  return <span className="pd-glyph-fb" style={{ "--pd-gs": (typeof size === "number" ? size : 44) + "px" }} aria-hidden="true">{kind && window.Art ? <window.Art name={kind} size={24} /> : null}</span>;
}

/* ── The thumb (list rows, link sheet): backdrop, page, cover, ink. ── */
function PdThumb({ d }) {
  const s = mbDcStyleOf(d);
  const bd = s.backdrop !== "none";
  return (
    <span className={pdCx("pd-thumb", bd && "has-bd")} aria-hidden="true" style={bd ? mbDcBdVars(s.backdrop) : null}>
      <span className="dt-themed pd-thumb-page" style={window.dcVars ? window.dcVars(s) : null}>
        {s.cover && window.DcCover ? <span className="pd-thumb-cover"><window.DcCover cover={s.cover} /></span> : null}
        <span className="pd-thumb-lines">
          <span className="pd-thumb-head" />
          <span className="pd-thumb-line" />
          <span className="pd-thumb-line is-short" />
        </span>
      </span>
    </span>
  );
}

/* ── The card miniature: the desktop's renderer (docs-kit.jsx MiniDoc /
   MiniBlock, docs.css docs-mini-*) — window.MiniDoc where the page loads it,
   else the same drawing here. ── */
function PdMiniBlock({ b: raw }) {
  const b = dxMigrateBlock(raw);
  const k = b[0], c = b[2];
  const a = DX_TEXT_KINDS[k] ? renderSpans(b[1], true) : b[1];
  if (k === "h") return <div className="docs-mini-block-1">{a}</div>;
  if (k === "lead") return <div className="docs-mini-p docs-mini-lead">{a}</div>;
  if (k === "callout") return <div className="docs-mini-block-2">{a}</div>;
  if (k === "quote") return <div className="docs-mini-p docs-mini-quote">{a}</div>;
  if (k === "li") return <div className="docs-mini-p docs-mini-li"><span>•</span><span>{a}</span></div>;
  if (k === "todo") return <div className={"docs-mini-p docs-mini-todo" + (c ? " is-on" : "")}><span className={"docs-mini-block-3 docs-mini-block-s1" + (c ? " is-on" : "")} />{a}</div>;
  if (k === "rule") return <div className="docs-mini-block-4" />;
  if (k === "shot") return (
    <div className="docs-mini-block-5">
      <div className="docs-mini-block-6">
        <div className="docs-mini-block-7">{[70, 50, 60, 40].map((w, i) => <span className="docs-mini-block-8" key={i} style={{ width: w + "%" }} />)}</div>
        <div className="docs-mini-block-7"><span className="docs-mini-block-9" />{[90, 75, 82].map((w, i) => <span className="docs-mini-block-8" key={i} style={{ width: w + "%" }} />)}<span className="docs-mini-block-10" /></div>
      </div>
    </div>);
  if (k === "cards") return <div className="docs-mini-block-11">{(a || []).map((t) => <div className="docs-mini-block-12" key={t}>{t}</div>)}</div>;
  if (k === "table") return (
    <div className="docs-mini-block-13">
      {(a || []).map((row, i) => <div className={"docs-mini-block-14" + (i ? " pd-mini-sep" : "")} key={i} style={{ gridTemplateColumns: "repeat(" + row.length + ", 1fr)" }}>{row.map((x, j) => <span className={"docs-mini-block-15 docs-mini-block-s2" + (j ? " is-on" : "")} key={j}>{x}</span>)}</div>)}
    </div>);
  if (k === "task") return <div className="docs-mini-p docs-mini-task"><span className="docs-mini-block-16" />{a}</div>;
  if (k === "image") return a ? <img className="pd-mini-img" src={a} alt="" draggable={false} /> : null;
  if (k === "page") { const t = pdFind(a); return <div className="docs-mini-p docs-mini-task">{t ? t.title || "Untitled" : "Untitled page"}</div>; }
  if (k === "suggest" || (DX_TEXT_KINDS[k] ? !pdText(b) : typeof a !== "string" || !a)) return null;
  return <p className="docs-mini-p">{a}</p>;
}
function PdMini({ d, width, scale }) {
  const body = (d.body || []).slice(0, 14);
  if (window.MiniDoc) return <window.MiniDoc doc={Object.assign({}, d, { body: body })} width={width} scale={scale} title />;
  return (
    <div className="docs-mini-doc-1" style={{ width: width / scale, transform: "scale(" + scale + ")" }}>
      <div className={"docs-mini-doc-2 docs-mini-doc-s1" + (d.title ? " is-on" : "")}>{d.title || "Untitled"}</div>
      {body.map((b, i) => <PdMiniBlock key={i} b={b} />)}
    </div>
  );
}
function PdCardPage({ d }) {
  const s = mbDcStyleOf(d);
  const bd = s.backdrop !== "none";
  return (
    <span className={pdCx("pd-card-pic", bd && "has-bd")} aria-hidden="true" style={bd ? mbDcBdVars(s.backdrop) : null}>
      <span className="dt-themed pd-card-page" style={mbDcVars(s)}>
        {s.cover && window.DcCover ? <span className="pd-card-cover"><window.DcCover cover={s.cover} /></span> : null}
        <span className="pd-card-mini"><PdMini d={d} width={bd ? 128 : 148} scale={0.5} /></span>
      </span>
    </span>
  );
}

/* ── A glass round / chip over the screen's top band ── */
function PdGlass({ icon, label, children, className, onClick, data }) {
  return (
    <button type="button" className={pdCx("pd-glass", children != null && "has-label", className)} aria-label={label} onClick={onClick} {...(data || {})}>
      <PdIcon name={icon} size={20} />
      {children != null ? <span className="pd-glass-label">{children}</span> : null}
    </button>
  );
}

/* ── The ⋯ menu: a frosted card from the top right over the blurred screen.
   items: { label, icon, on, arrow, tone, onClick } | { head } | { sep } ── */
function PdMenu({ open, onClose, items, label }) {
  const scrim = React.useRef(null), card = React.useRef(null);
  const closeRef = React.useRef(onClose); closeRef.current = onClose;
  React.useLayoutEffect(() => { if (scrim.current) scrim.current.style.setProperty("--pk-scrim-k", open ? "1" : "0"); }, [open]);
  React.useEffect(() => {
    if (!open) return undefined;
    const first = card.current && card.current.querySelector("button");
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    const k = (e) => { if (e.key === "Escape") { e.stopPropagation(); closeRef.current(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]);
  return (
    <div className={pdCx("pd-menu-layer", open && "is-open")} data-pd-menu={open ? "open" : "shut"} aria-hidden={open ? undefined : "true"}>
      <PkScrim scrimRef={scrim} open={open} onClick={onClose} />
      <div ref={card} className="pd-menu" role="menu" aria-label={label}>
        {items.map((it, i) => {
          if (it.sep) return <span key={"s" + i} className="pd-menu-sep" role="separator" />;
          if (it.head) return <span key={"h" + i} className="pd-menu-head">{it.head}</span>;
          return (
            <button key={it.label} type="button" role={it.on != null ? "menuitemradio" : "menuitem"} aria-checked={it.on != null ? !!it.on : undefined}
              tabIndex={open ? 0 : -1} className={pdCx("pd-menu-item", it.on && "is-on", it.tone === "alert" && "is-alert")}
              onClick={it.onClick} data-pd-item={it.id || it.label}>
              <span className="pd-menu-icon">{it.icon ? <PdIcon name={it.icon} size={18} /> : it.on ? <PdIcon name="check" size={16} /> : null}</span>
              <span className="pd-menu-label">{it.label}</span>
              {it.arrow ? <span className="pd-menu-arrow" aria-label={it.arrowLabel}><PdIcon name={it.arrow} size={14} /></span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Move to…: No project and the projects ── */
function PdMoveSheet({ doc, open, onClose, onPick }) {
  const list = [{ id: null, name: "No project", color: null }].concat((window.NEEDT && window.NEEDT.projects) || []);
  const cur = doc ? doc.projectId || null : null;
  return (
    <PkSheet open={open} onClose={onClose} title="Move to" meta={doc ? doc.title || "Untitled" : null} label="Move to a project">
      <div className="pd-picks" role="radiogroup" aria-label="Project">
        {list.map((p) => {
          const on = (p.id || null) === cur;
          return (
            <button key={p.id || "none"} type="button" role="radio" aria-checked={on} className={pdCx("pd-pick", on && "is-on")} onClick={() => onPick(p)} data-pd-project={p.id || "none"}>
              <span className={pdCx("pd-pick-hue", !p.id && "is-none")} style={p.id ? { "--hue": p.color } : null} />
              <span className="pd-pick-name">{p.name}</span>
              {on ? <PdIcon name="check" size={18} /> : null}
            </button>
          );
        })}
      </div>
    </PkSheet>
  );
}

/* ── A list of rows in a sheet (actions, remind, link): icon tile + words ── */
function PdRows({ rows, label }) {
  return (
    <div className="pd-rows-sheet" role="group" aria-label={label}>
      {rows.map((r) => (
        <button key={r.id} type="button" className={pdCx("pd-srow", r.tone === "alert" && "is-alert", r.on && "is-on")} onClick={r.onClick} disabled={r.disabled} data-pd-row={r.id}>
          <span className={"pd-srow-tile is-" + (r.hue || "gray")}>{r.lead || <PdIcon name={r.icon} size={18} />}</span>
          <span className="pd-srow-text"><span className="pd-srow-title">{r.label}</span>{r.meta ? <span className="pd-srow-meta">{r.meta}</span> : null}</span>
          {r.on ? <PdIcon name="check" size={18} /> : r.arrow ? <PdIcon name="chevron-right" size={16} /> : null}
        </button>
      ))}
    </div>
  );
}

/* ── Aa: block type, marks, colour. Inline (the keyboard's place) or in a sheet. ── */
function PdStylePicker({ a, marks, onType, onMark, onColor, onHl }) {
  const k = a ? a[0] : "p";
  const can = !!(a && PD_TEXT[k]);
  const f = marks || {};
  const col = f.color || "default";
  return (
    <div className={pdCx("pd-sp", !can && "is-off")} data-pd-style="">
      <div className="pd-sp-types pk-no-drag" role="radiogroup" aria-label="Block type">
        {PD_TYPES.map(([id, label, icon]) => (
          <button key={id} type="button" role="radio" aria-checked={k === id} disabled={!can} className={pdCx("pd-sp-type", k === id && "is-on")}
            onPointerDown={(e) => e.preventDefault()} onClick={() => onType(id)} data-pd-type={id}>
            <PdIcon name={icon} size={18} /><span>{label}</span>
          </button>
        ))}
      </div>
      <div className="pd-sp-row">
        <div className="pd-sp-marks" role="group" aria-label="Text style">
          {[["b", "bold", "Bold"], ["i", "italic", "Italic"], ["s", "strikethrough", "Strikethrough"], ["code", "code", "Code"]].map(([m, icon, label]) => (
            <button key={m} type="button" aria-pressed={!!f[m]} aria-label={label} disabled={!can} className={pdCx("pd-sp-mark", f[m] && "is-on")}
              onPointerDown={(e) => e.preventDefault()} onClick={() => onMark(m)} data-pd-mark={m}><PdIcon name={icon} size={18} /></button>
          ))}
        </div>
        <button type="button" className="pd-sp-color" disabled={!can} onPointerDown={(e) => e.preventDefault()} onClick={onColor} data-pd-color-open="">
          <span className={"pd-dot is-" + col} />
          <span>Colour</span>
          <PdIcon name="chevron-right" size={14} />
        </button>
      </div>
      <div className="pd-sp-row">
        <button type="button" className="pd-sp-color" disabled={!can} onPointerDown={(e) => e.preventDefault()} onClick={onHl} data-pd-hl-open="">
          <span className={pdCx("pd-dot is-hl", f.hl && "dx-h-" + f.hl)}>{f.hl ? null : <PdIcon name="highlighter" size={14} />}</span>
          <span>Highlight</span>
          <PdIcon name="chevron-right" size={14} />
        </button>
      </div>
      {!can ? <span className="pd-sp-note">This block has no text to style.</span> : null}
    </div>
  );
}

/* ── + Content: coloured tiles ── */
function PdContentPicker({ onPick }) {
  return (
    <div className="pd-cp" role="group" aria-label="Add content" data-pd-content="">
      {PD_CONTENT.map(([k, label, icon, hue]) => (
        <button key={k} type="button" className="pd-cp-item" onPointerDown={(e) => e.preventDefault()} onClick={() => onPick(k)} data-pd-add={k}>
          <span className={"pd-tile is-" + hue}><PdIcon name={icon} size={20} /></span>
          <span className="pd-cp-label">{label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── ⋯ in the keyboard bar ── */
function PdMorePicker({ items }) {
  return (
    <div className="pd-cp" role="group" aria-label="More" data-pd-more-panel="">
      {items.map((it) => (
        <button key={it.id} type="button" className={pdCx("pd-cp-item", it.tone === "alert" && "is-alert")} disabled={it.disabled}
          onPointerDown={(e) => e.preventDefault()} onClick={it.onClick} data-pd-act={it.id}>
          <span className={"pd-tile is-" + it.hue}><PdIcon name={it.icon} size={20} /></span>
          <span className="pd-cp-label">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Choose a Color: 6 × 3 rounded swatches (block ink), or the page colours ── */
function PdColorSheet({ open, onClose, mode, value, onPick }) {
  const pages = mode === "page", hl = mode === "hl";
  const list = pages ? DC_PAGES.map((p) => [p.id, p.name, p]) : hl ? [["none", "None"]].concat(DX_HLS) : PD_COLORS;
  return (
    <PkSheet open={open} onClose={onClose} title={hl ? "Highlight" : "Choose a Color"} meta={pages ? "Page colour — each has a Light and a Dark reading" : hl ? "Behind the selected words, or the whole block" : "Colour of the selected words, or the whole block"} label={hl ? "Highlight" : "Choose a Color"}>
      <div className="pd-colors" role="radiogroup" aria-label={hl ? "Highlight" : "Colour"} data-pd-colors={pages ? "page" : hl ? "hl" : "text"}>
        {list.map(([id, name, p]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={name} className={pdCx("pd-swatch", value === id && "is-on")}
            onClick={() => onPick(id)} data-pd-swatch={id}>
            {pages ? <span className="pd-swatch-fill is-split" style={{ "--split-l": p.L, "--split-d": p.D }} />
              : hl ? <span className={pdCx("pd-swatch-fill is-hl", id !== "none" && "dx-h-" + id)}>{id === "none" ? <PdIcon name="x" size={16} /> : "Aa"}</span>
              : <span className={"pd-swatch-fill is-" + id}>{id === "default" ? "Aa" : null}</span>}
            <span className="pd-swatch-name">{name}</span>
          </button>
        ))}
      </div>
    </PkSheet>
  );
}

/* ── Page Style ── */
const PD_BG = [["none", "None"], ["solid", "Solid"], ["gradient", "Gradient"], ["image", "Image"]];
const PD_BG_OF = { mist: "gradient", sparkle: "gradient", dunes: "image", sage: "image", ocean: "image", ink: "image", grid: "image" };
const PD_BG_LIST = { gradient: ["mist", "sparkle"], image: ["dunes", "sage", "ocean", "ink", "grid"] };
const pdBgKind = (s) => (s.backdrop !== "none" ? PD_BG_OF[s.backdrop] || "image" : s.page !== "white" ? "solid" : "none");
function PdSeg({ items, value, onChange, label, attr }) {
  return (
    <div className="pd-seg" role="radiogroup" aria-label={label}>
      {items.map((it) => (
        <button key={it.id} type="button" role="radio" aria-checked={value === it.id} className={pdCx("pd-seg-btn", value === it.id && "is-on")} onClick={() => onChange(it.id)} {...{ [attr]: it.id }}>
          {it.icon ? <span className="pd-seg-icon">{it.icon}</span> : null}<span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}
function PdSwitch({ on, onChange, label, data }) {
  return (
    <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={pdCx("pd-switch", on && "is-on")} onClick={() => onChange(!on)} {...(data || {})}>
      <span className="pd-switch-knob" />
    </button>
  );
}
function PdBdTile({ id, on, onClick }) {
  const b = DC_BACKDROPS.filter((x) => x.id === id)[0];
  return (
    <button type="button" className={pdCx("pd-bd-tile", on && "is-on")} onClick={onClick} aria-pressed={on} data-pd-bd={id}>
      <span className="pd-bd-pic" style={mbDcBdVars(id)} />
      <span className="pd-bd-name">{b ? b.name : id}</span>
    </button>
  );
}
function PdPageStyleSheet({ doc, open, onClose, onSolid, say }) {
  const d = doc || {};
  const s = mbDcStyleOf(d);
  const set = (p) => { if (doc) pdSetStyle(doc, p); };
  const preset = DC_PRESETS.filter((p) => ["backdrop", "page", "text", "font"].every((k) => p.style[k] === s[k]))[0] || null;
  const bg = pdBgKind(s);
  const coverKind = !s.cover ? "none" : /^art:/.test(s.cover) ? "art" : "image";
  const onFile = (fs) => {
    const f = fs && fs[0]; if (!f || !doc) return;
    const before = s.cover;
    pdReadImage(f, (url) => { set({ cover: url }); say("Cover added", () => pdSetStyle(doc, { cover: before })); });
  };
  const pickBg = (k) => {
    if (k === "none") set({ backdrop: "none", page: "white" });
    else if (k === "solid") { set({ backdrop: "none" }); onSolid(); }
    else set({ backdrop: PD_BG_OF[s.backdrop] === k ? s.backdrop : PD_BG_LIST[k][0] });
  };
  const pickCover = (k) => {
    if (k === "none") set({ cover: null });
    else if (k === "art") set({ cover: coverKind === "art" ? s.cover : "art:" + DC_COVER_ARTS[0] });
    else window.needtPlatform.pickFile({ accept: "image/*" }).then(onFile);
  };
  const bgIcon = (k) => (k === "none" ? <PdIcon name="ban" size={16} /> : k === "image" ? <PdIcon name="image" size={16} /> : <span className={"pd-bg-ico is-" + k} />);
  const pg = dcPageOf(s.page);
  return (
    <PkSheet open={open} onClose={onClose} title="Page Style" detents={[0.62, 0.94]} label="Page Style" bodyClass="pd-ps-body">
      <div className="pd-ps" data-pd-pagestyle="">
        <section className="pd-ps-card">
          <span className="pd-ps-label">Presets</span>
          <div className="pd-ps-presets pk-no-drag" role="radiogroup" aria-label="Presets">
            {DC_PRESETS.map((p) => {
              const ps = Object.assign({}, DC_DEFAULT, p.style);
              const bd = ps.backdrop !== "none";
              const on = preset && preset.id === p.id;
              return (
                <button key={p.id} type="button" role="radio" aria-checked={!!on} className={pdCx("pd-preset", on && "is-on")} data-pd-preset={p.id}
                  onClick={() => { if (!doc) return; const before = d.style ? Object.assign({}, d.style) : null; pdApplyPreset(doc, p); say("Style: " + p.name, () => pdPatch(doc.id, { style: before })); }}>
                  <span className={pdCx("pd-preset-pic", bd && "has-bd")} style={bd ? mbDcBdVars(ps.backdrop) : null}>
                    <span className="dt-themed pd-preset-page" style={mbDcVars(ps)}>
                      <span className="pd-preset-aa">Aa</span>
                      <span className="pd-preset-line" /><span className="pd-preset-line is-short" />
                    </span>
                  </span>
                  <span className="pd-preset-name">{p.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="pd-ps-group">
          <span className="pd-ps-label">Cover</span>
          <PdSeg label="Cover" value={coverKind} onChange={pickCover} attr="data-pd-cover"
            items={[{ id: "none", label: "None", icon: <PdIcon name="ban" size={16} /> }, { id: "image", label: "Image", icon: <PdIcon name="image" size={16} /> }, { id: "art", label: "Art", icon: <PdIcon name="sparkles" size={16} /> }]} />
          {coverKind === "image" ? (
            <div className="pd-ps-cover-row">
              <span className="pd-ps-cover-pic"><window.DcCover cover={s.cover} /></span>
              <PkButton kind="quiet" small icon="upload" onClick={() => window.needtPlatform.pickFile({ accept: "image/*" }).then(onFile)}>Replace</PkButton>
            </div>
          ) : null}
          {coverKind === "art" ? (
            <div className="pd-ps-arts">
              {DC_COVER_ARTS.map((a) => (
                <button key={a} type="button" className={pdCx("pd-ps-art", s.cover === "art:" + a && "is-on")} onClick={() => set({ cover: "art:" + a })} aria-pressed={s.cover === "art:" + a} data-pd-art={a} aria-label={"Cover " + a}>
                  <window.DcCover cover={"art:" + a} />
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="pd-ps-group">
          <span className="pd-ps-label">Background</span>
          <PdSeg label="Background" value={bg} onChange={pickBg} attr="data-pd-bg" items={PD_BG.map(([id, label]) => ({ id: id, label: label, icon: bgIcon(id) }))} />
          {bg === "solid" ? (
            <button type="button" className="pd-ps-line" onClick={onSolid} data-pd-solid="">
              <span className="pd-ps-line-label">Page colour</span>
              <span className="pd-ps-line-value">{pg.name}</span>
              <span className="pd-swatch-fill is-split is-sm" style={{ "--split-l": pg.L, "--split-d": pg.D }} />
              <PdIcon name="chevron-right" size={14} />
            </button>
          ) : null}
          {bg === "gradient" || bg === "image" ? (
            <div className="pd-bd-row pk-no-drag">
              {PD_BG_LIST[bg].map((id) => <PdBdTile key={id} id={id} on={s.backdrop === id} onClick={() => set({ backdrop: id })} />)}
            </div>
          ) : null}
          {s.backdrop !== "none" ? (
            <>
              <PdSeg label="Backdrop look" value={s.bdLook === "faded" ? "faded" : "immersive"} onChange={(v) => set({ bdLook: v })} attr="data-pd-look"
                items={[{ id: "immersive", label: "Immersive" }, { id: "faded", label: "Faded" }]} />
              <div className="pd-ps-line is-static">
                <span className="pd-ps-line-label">Blur image</span>
                <PdSwitch on={!!s.bdBlur} onChange={(v) => set({ bdBlur: !!v })} label="Blur image" data={{ "data-pd-blur": "" }} />
              </div>
            </>
          ) : null}
        </section>

        <section className="pd-ps-group">
          <span className="pd-ps-label">Default font</span>
          <div className="pd-fonts" role="radiogroup" aria-label="Default font">
            {DC_FONTS.map((f) => (
              <button key={f.id} type="button" role="radio" aria-checked={s.font === f.id} className={pdCx("pd-font", s.font === f.id && "is-on")}
                onClick={() => { if (f.id !== "sans" && window.dcLoadFonts) window.dcLoadFonts(); set({ font: f.id }); }} data-pd-font={f.id}>
                <span className="pd-font-glyph" style={{ "--pd-font": f.css }}>{f.glyph}</span>
                <span className="pd-font-name">{f.name}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </PkSheet>
  );
}

/* ── Remind: a real task from the block, on a day ── */
function PdRemindSheet({ open, onClose, onPick, text }) {
  const dateRef = React.useRef(null);
  const rows = [
    { id: "today", label: "Later today", meta: "Today, 18:00", icon: "clock", hue: "amber", onClick: () => onPick({ date: "today", time: "6pm", label: "Today 18:00" }) },
    { id: "tomorrow", label: "Tomorrow", meta: "09:00", icon: "sunrise", hue: "orange", onClick: () => onPick({ date: "tomorrow", time: "9am", label: "Tomorrow 9:00" }) },
    { id: "week", label: "Next week", meta: "Monday, 09:00", icon: "calendar-days", hue: "blue", onClick: () => onPick({ date: "next week", time: "9am", label: "Next week" }) },
    { id: "pick", label: "Pick a date…", icon: "calendar", hue: "violet", arrow: true, onClick: () => { const el = dateRef.current; if (!el) return; try { el.showPicker(); } catch (e) { el.focus(); el.click(); } } }
  ];
  return (
    <PkSheet open={open} onClose={onClose} title="Remind me" meta={text ? "“" + text + "”" : "This block"} label="Remind me">
      <input ref={dateRef} type="date" className="pd-hidden" aria-label="Reminder date" data-pd-remind-date=""
        onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) onPick({ date: v, time: "9am", label: pdDateLabel(v) }); }} />
      <PdRows rows={rows} label="When" />
    </PkSheet>
  );
}

/* ── Link a page ── */
function PdLinkSheet({ open, onClose, cur, onPick }) {
  const all = mbUseDocs().filter((d) => !d.trashedAt && String(d.id) !== String(cur));
  const rows = [{ id: "new", label: "New page", meta: "An empty page, linked here", icon: "plus", hue: "green", onClick: () => onPick(null) }]
    .concat(all.map((d) => ({ id: "doc-" + d.id, label: d.title || "Untitled", meta: mbDocMeta(d) || null, lead: <PdThumb d={d} />, hue: "plain", onClick: () => onPick(d.id) })));
  return (
    <PkSheet open={open} onClose={onClose} title="Link a page" detents={[0.62, 0.94]} label="Link a page">
      <PdRows rows={rows} label="Pages" />
    </PkSheet>
  );
}

/* ── A link on the selected words: the address, Link, Remove ── */
function PdUrlSheet({ open, onClose, cur, onApply }) {
  const [v, setV] = React.useState(cur || "");
  const ref = React.useRef(null);
  React.useEffect(() => { if (open) { setV(cur || ""); const t = setTimeout(() => { if (ref.current) { try { ref.current.focus({ preventScroll: true }); } catch (e) { ref.current.focus(); } } }, 260); return () => clearTimeout(t); } return undefined; }, [open]);
  return (
    <PkSheet open={open} onClose={onClose} title="Link" meta="On the selected words, or the whole block" label="Link">
      <div className="pd-url">
        <input ref={ref} className="pd-url-input" type="url" inputMode="url" value={v} placeholder="Paste or type a link" aria-label="Link address" data-pd-url=""
          onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onApply(v.trim() || null); } }} />
        <div className="pd-url-acts">
          {cur ? <button type="button" className="pd-mini-chip" onClick={() => onApply(null)} data-pd-url-remove="">Remove link</button> : null}
          <button type="button" className="pd-mini-chip is-strong" onClick={() => onApply(v.trim() || null)} data-pd-url-apply="">Link</button>
        </div>
      </div>
    </PkSheet>
  );
}

/* ── The simulated keyboard (the device frame has none). Keys type into the
   page; a real phone shows its own and this is not drawn. ── */
const PD_KB = { a: ["qwertyuiop", "asdfghjkl", "zxcvbnm"], n: ["1234567890", "-/:;()&@\"", ".,?!'"] };
function PdKeyboard({ onKey }) {
  const [layer, setLayer] = React.useState("a");
  const [shift, setShift] = React.useState(false);
  const rows = PD_KB[layer];
  const press = (k) => (e) => {
    e.preventDefault();
    if (k === "shift") { setShift(!shift); return; }
    if (k === "layer") { setLayer(layer === "a" ? "n" : "a"); return; }
    onKey(k.length === 1 && shift ? k.toUpperCase() : k);
    if (shift && k.length === 1) setShift(false);
  };
  const key = (k, label, cls) => <span key={k + (label || "")} role="button" tabIndex={-1} className={pdCx("pd-key", cls)} onPointerDown={press(k)} data-pd-key={k}>{label || (shift ? k.toUpperCase() : k)}</span>;
  return (
    <div className="pd-kb" data-pd-kb={layer}>
      <div className="pd-kb-row">{rows[0].split("").map((c) => key(c))}</div>
      <div className="pd-kb-row is-mid">{rows[1].split("").map((c) => key(c))}</div>
      <div className="pd-kb-row">
        {layer === "a" ? key("shift", "⇧", pdCx("is-fn", shift && "is-on")) : key("layer", "ABC", "is-fn")}
        {rows[2].split("").map((c) => key(c))}
        {key("back", "⌫", "is-fn")}
      </div>
      <div className="pd-kb-row">
        {key("layer", layer === "a" ? "123" : "ABC", "is-fn is-wide")}
        {key("emoji", "☺", "is-fn")}
        {key(" ", "space", "is-space")}
        {key("enter", "return", "is-fn is-wide2")}
      </div>
    </div>
  );
}

/* ── One editable spot. Its text lives in the DOM while you type (the block
   keeps a copy), so React never rewrites it under the caret; a programmatic
   change bumps the block's v and the spans are drawn again (spansToHtml). ── */
function PdEd({ b, api, cls, ph, style, label }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const want = dxNorm(b.a[1]);
    if (JSON.stringify(domToSpans(el)) !== JSON.stringify(spansToText(want) ? want : "")) el.innerHTML = spansToHtml(want);
  }, [b.id, b.v]);
  const live = api.live;
  return (
    <div ref={ref} className={pdCx("pd-ed", cls)} contentEditable={live ? "plaintext-only" : "false"} suppressContentEditableWarning spellCheck={false}
      role="textbox" aria-multiline="true" aria-label={label || PD_PH[b.a[0]] || "Text"} tabIndex={live ? 0 : -1}
      data-pd-ed={b.id} data-ph={ph} style={style}
      onFocus={() => api.focus(b.id)} onInput={(e) => api.input(b.id, e.currentTarget)} onKeyDown={(e) => api.key(b.id, e)} />
  );
}

/* A table cell, editable the same way. */
function PdCell({ b, r, c, api, strong }) {
  const ref = React.useRef(null);
  const v = ((b.a[1] || [])[r] || [])[c] || "";
  React.useLayoutEffect(() => { const el = ref.current; if (el && el.textContent !== v) el.textContent = v; }, [b.id, b.v, r, c]);
  return (
    <span ref={ref} className={pdCx("pd-cell", strong && "is-strong")} contentEditable={api.live ? "plaintext-only" : "false"} suppressContentEditableWarning spellCheck={false}
      role="textbox" aria-label={"Cell " + (r + 1) + ", " + (c + 1)} data-pd-cell={b.id + ":" + r + ":" + c}
      onFocus={() => api.focus(b.id)} onInput={(e) => api.cell(b.id, r, c, e.currentTarget.textContent)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); api.cellNext(b.id, r, c); } }} />
  );
}

/* A block on the page: its drawing (the desktop's page classes, mb-doc-*),
   and the handle on its right edge. */
function PdBlock({ b, api, sep, sel, focused, ro, title }) {
  const k = b.a[0];
  const f = pdFmt(b.a);
  const ed = (cls, ph) => <PdEd b={b} api={api} cls={cls} ph={ph || PD_PH[k] || ""} />;
  let body = null;
  if (k === "p") body = ed(pdCx("mb-doc-p", b.a[2] && b.a[2].muted && "is-muted"), "Type something…");
  else if (k === "lead") body = ed("mb-doc-p is-lead");
  else if (k === "h") body = ed("mb-doc-h");
  else if (k === "li") body = <div className="mb-doc-p is-row is-li"><span aria-hidden="true">•</span>{ed("pd-fill")}</div>;
  else if (k === "todo") body = (
    <div className="mb-doc-p is-row">
      <button type="button" role="checkbox" aria-checked={!!b.a[2]} aria-label="Done" className={pdCx("mb-doc-check pd-check", b.a[2] && "is-on")} disabled={ro}
        onPointerDown={(e) => e.preventDefault()} onClick={() => api.toggle(b.id)} data-pd-check={b.id}>{b.a[2] ? <PdIcon name="check" size={11} /> : null}</button>
      {ed(pdCx("pd-fill mb-doc-todo", b.a[2] && "is-done"))}
    </div>);
  else if (k === "quote") body = ed("mb-doc-p is-quote");
  else if (k === "callout") body = <div className="mb-doc-p is-row is-callout"><span aria-hidden="true" className="mb-doc-callout-icon"><PdIcon name="alert-circle" size={16} /></span>{ed("pd-fill")}</div>;
  else if (k === "code") body = ed("mb-doc-code pd-code");
  else if (k === "task" || k === "event" || k === "habit") body = (
    <div className="mb-doc-p is-row is-center mb-doc-task">
      <span aria-hidden="true" className={k === "task" ? "mb-doc-task-ring" : "pd-task-glyph"}>{k === "task" ? null : <PdIcon name={k === "event" ? "calendar-days" : "flame"} size={16} />}</span>
      {ed("pd-fill mb-doc-task-title")}
      <span className="mb-doc-task-meta">{k === "task" ? b.a[2] || "Task · Today" : k === "event" ? "Event" : "Habit"}</span>
    </div>);
  else if (k === "ask") body = <div className="mb-doc-p is-row is-callout"><span aria-hidden="true" className="mb-doc-callout-icon"><PdIcon name="sparkles" size={16} /></span>{ed("pd-fill")}</div>;
  else if (k === "rule") body = <MbDocSep kind={sep} block />;
  else if (k === "image") body = b.a[1]
    ? <img className="pd-img" src={b.a[1]} alt="" draggable={false} data-pd-img={b.id} />
    : <button type="button" className="pd-empty-tile" disabled={ro} onClick={() => api.pickImage(b.id, "fill")} data-pd-img-add={b.id}><PdIcon name="image" size={20} /><span>Add an image</span></button>;
  else if (k === "table") {
    const rows = b.a[1] && b.a[1].length ? b.a[1] : [[""]];
    body = (
      <div className="pd-table-wrap">
        <div className="mb-doc-table pd-table" role="table">
          {rows.map((row, r) => (
            <span key={r} className="mb-doc-table-row" role="row">
              {row.map((c, j) => <PdCell key={j} b={b} r={r} c={j} api={api} strong={j === 0} />)}
            </span>
          ))}
        </div>
        {focused && !ro ? (
          <div className="pd-table-tools">
            <button type="button" className="pd-mini-chip" onPointerDown={(e) => e.preventDefault()} onClick={() => api.tableAdd(b.id, "row")} data-pd-table-add="row"><PdIcon name="plus" size={14} />Row</button>
            <button type="button" className="pd-mini-chip" onPointerDown={(e) => e.preventDefault()} onClick={() => api.tableAdd(b.id, "col")} data-pd-table-add="col"><PdIcon name="plus" size={14} />Column</button>
          </div>
        ) : null}
      </div>);
  }
  else if (k === "page") {
    const t = b.a[1] ? pdFind(b.a[1]) : null;
    body = (
      <button type="button" className="pd-link" onClick={() => api.openDoc(b.a[1])} disabled={!t} data-pd-link={b.a[1] || ""}>
        <PdGlyph kind="page" size={32} />
        <span className="pd-link-title">{t ? t.title || "Untitled" : "Untitled page"}</span>
        <PdIcon name="chevron-right" size={16} />
      </button>);
  }
  else if (k === "date") body = (
    <span className="pd-date-wrap">
      <button type="button" className="pd-date" onClick={() => api.pickDate(b.id)} disabled={ro} data-pd-date={b.id}>
        <PdIcon name="calendar-days" size={16} /><span>{pdText(b.a) || pdDateLabel(f.date)}</span>
      </button>
    </span>);
  else if (k === "cards" || k === "table") body = <MbDocBlock b={b.a} sep={sep} />;
  else if (DX_TEXT_KINDS[k] || (typeof b.a[1] === "string" && b.a[1])) body = ed("mb-doc-p");
  else if (k === "shot") body = <div className="pd-shot" aria-label="Screenshot" role="img"><PdMiniBlock b={["shot"]} /></div>;
  else if (k === "suggest") body = (
    <div className="pd-suggest">
      <span className="pd-suggest-line"><PdIcon name="sparkles" size={16} /><span>Move the Friday review to Thursday — Friday already holds two fixed events.</span></span>
      {ro ? null : <span className="pd-suggest-acts">
        <button type="button" className="pd-mini-chip is-strong" onClick={() => api.suggest(b.id, true)} data-pd-suggest="accept">Accept</button>
        <button type="button" className="pd-mini-chip" onClick={() => api.suggest(b.id, false)} data-pd-suggest="dismiss">Dismiss</button>
      </span>}
    </div>);
  else body = <span className="pd-empty-tile is-static"><PdIcon name="layers" size={18} /><span>{k}</span></span>;

  return (
    <div className={pdCx("pd-b", "is-" + k, sel && "is-sel", focused && "is-focus")} data-pd-b={b.id} data-pd-kind={k} onPointerDown={ro ? null : (e) => api.press(b.id, e)}>
      {body}
      {f.remind ? <span className="pd-remind" data-pd-remind={b.id}><PdIcon name="bell" size={12} />{f.remind.label}</span> : null}
      {ro ? null : (
        <button type="button" className="pd-handle" aria-label="Select block" tabIndex={-1} onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={() => api.select(b.id)} data-pd-handle={b.id}>
          <span className="pd-handle-grip" />
        </button>
      )}
    </div>
  );
}

/* ── The page. p = how far it sits to the right (0 open, 1 gone). Opening
   springs 1 → 0; back springs → 1 then calls onGone; the left-edge swipe
   drags p 1:1. ── */
const PD_EDGE = 24;
function PdDocReader({ doc, readOnly, backLabel, onBack, onGone, under, enter, onCover, say, onOpenDoc, autoEdit, onTrashed }) {
  const d = doc;
  const ro = !!readOnly;
  const s = mbDcStyleOf(d);
  const bd = s.backdrop !== "none";
  const st = d.style && typeof d.style === "object" ? d.style : {};
  const sayRef = React.useRef(say); sayRef.current = say || (() => {});
  const tell = (t, u) => sayRef.current(t, u);
  const root = React.useRef(null), sc = React.useRef(null), titleEl = React.useRef(null), dateRef = React.useRef(null);
  /* the image picker (needtPlatform): P.imgFor / P.imgMode say where it lands */
  const pickImg = () => window.needtPlatform.pickFile({ accept: "image/*" }).then((fs) => onImage(fs));
  const S = React.useRef({ p: { x: enter === false ? 0 : 1, v: 0 }, target: 0, raf: 0, last: 0, drag: null, ended: 0, leaving: false }).current;
  const goneRef = React.useRef(onGone); goneRef.current = onGone;
  React.useEffect(() => { if (s.font !== "sans" && window.dcLoadFonts) window.dcLoadFonts(); }, [s.font]);

  /* ── blocks: the store's body, with ids; writes go straight back ── */
  const [blocks, setBlocksState] = React.useState(() => pdBlocks(d.body));
  const B = React.useRef(blocks);
  const lastJ = React.useRef(JSON.stringify(d.body || []));
  const T = React.useRef({ save: 0, title: 0, titleText: null }).current;
  const save = React.useCallback(() => {
    clearTimeout(T.save); T.save = 0;
    if (ro) return;
    const body = B.current.map((x) => x.a);
    const j = JSON.stringify(body);
    if (j === lastJ.current) return;
    lastJ.current = j;
    pdPatch(d.id, { body: body, updated: "Just now" });
  }, [d.id, ro]);
  const saveTitle = React.useCallback(() => {
    clearTimeout(T.title); T.title = 0;
    if (ro || T.titleText == null) return;
    const t = T.titleText; T.titleText = null;
    const cur = pdFind(d.id);
    if (cur && cur.title !== t) pdPatch(d.id, { title: t, updated: "Just now" });
  }, [d.id, ro]);
  const setBlocks = (next, mode) => {
    B.current = next; setBlocksState(next);
    if (mode === "type") { clearTimeout(T.save); T.save = setTimeout(save, 350); }
    else if (mode !== "quiet") save();
  };
  /* someone else changed the page (the desktop, an undo): take it */
  React.useEffect(() => {
    const j = JSON.stringify(d.body || []);
    if (j !== lastJ.current) { lastJ.current = j; const nb = pdBlocks(d.body); B.current = nb; setBlocksState(nb); }
  }, [d.body]);
  React.useEffect(() => () => { save(); saveTitle(); }, [save, saveTitle]);

  /* ── modes ── */
  const [editing, setEditing] = React.useState(false);
  const [focusId, setFocusId] = React.useState(null);
  const [panel, setPanel] = React.useState(null);   /* null | "style" | "content" | "more" */
  const [sel, setSel] = React.useState(null);
  const [sheet, setSheet] = React.useState(null);   /* style | content | remind | actions | page | color | link | move */
  const [colorMode, setColorMode] = React.useState("text");
  const [menu, setMenu] = React.useState(false);
  const [pop, setPop] = React.useState(null);       /* { kind, id, q, start, i } */
  const focusRef = React.useRef(null); focusRef.current = focusId;
  const selRef = React.useRef(null); selRef.current = sel;
  const pending = React.useRef(null);               /* { id, off } | { cell } — focus after the next paint */
  const P = React.useRef({ lp: null, fired: 0, imgFor: null, imgMode: null, dateFor: null, linkFor: null, range: null }).current;
  const live = !ro && sel == null;
  const sim = typeof window !== "undefined" && window.innerWidth >= 500;   /* the device frame: draw a keyboard */
  const [kbLift, setKbLift] = React.useState(0);                         /* a real phone: its keyboard's height */

  const covered = editing || sel != null || sheet != null || menu;
  const coverRef = React.useRef(onCover); coverRef.current = onCover;
  React.useEffect(() => { if (coverRef.current) coverRef.current(covered); }, [covered]);
  React.useEffect(() => () => { if (coverRef.current) coverRef.current(false); }, []);

  React.useEffect(() => {
    if (!editing || sim || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const r = () => setKbLift(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    r(); vv.addEventListener("resize", r); vv.addEventListener("scroll", r);
    return () => { vv.removeEventListener("resize", r); vv.removeEventListener("scroll", r); };
  }, [editing, sim]);

  /* keep the caret's block above the keyboard */
  const reveal = React.useCallback((el) => {
    const scr = sc.current, r = root.current; if (!el || !scr || !r) return;
    const rr = r.getBoundingClientRect(), er = el.getBoundingClientRect();
    const bottom = rr.bottom - (sim ? 291 + 52 : kbLift + 52) - 16;
    const top = rr.top + 110;
    if (er.bottom > bottom) scr.scrollTop += er.bottom - bottom;
    else if (er.top < top) scr.scrollTop -= top - er.top;
  }, [sim, kbLift]);

  React.useLayoutEffect(() => {
    const p = pending.current; if (!p || !root.current) return;
    pending.current = null;
    const el = p.cell ? root.current.querySelector('[data-pd-cell="' + p.cell + '"]') : p.id === "title" ? titleEl.current : pdEdOf(root.current, p.id);
    if (el && p.end != null && p.end > p.off) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } dxSelect(el, p.off, p.end); }
    else if (el) { pdPlace(el, p.off); reveal(el); }
  });

  /* ── the slide (open / back / edge swipe) ── */
  const paint = React.useCallback(() => {
    const W = root.current ? root.current.clientWidth : 402;
    const x = Math.max(0, S.p.x);
    if (root.current) { root.current.style.transform = x > 0.0005 ? "translate3d(" + (x * W).toFixed(1) + "px,0,0)" : ""; root.current.setAttribute("data-pd-p", x.toFixed(2)); }
    const u = under && under.current;
    if (u) {
      u.style.transform = x < 0.999 ? "translate3d(" + ((x - 1) * W * 0.28).toFixed(1) + "px,0,0)" : "";
      u.style.setProperty("--pd-shade", (1 - x).toFixed(3));
    }
  }, [under]);
  const run = React.useCallback(() => {
    if (S.raf) return;
    S.last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - S.last) / 1000); S.last = now;
      const still = nvaStep(S.p, S.target, dt, 260, 0.92);
      paint();
      if (still) {
        S.p.x = S.target; S.p.v = 0; S.raf = 0; paint();
        if (S.target >= 1 && goneRef.current) goneRef.current();
        return;
      }
      S.raf = requestAnimationFrame(tick);
    };
    S.raf = requestAnimationFrame(tick);
  }, [paint]);
  const go = React.useCallback((target, vel) => {
    S.target = target;
    if (vel != null) S.p.v = vel;
    if (pdReduced()) { cancelAnimationFrame(S.raf); S.raf = 0; S.p.x = target; S.p.v = 0; paint(); if (target >= 1 && goneRef.current) goneRef.current(); return; }
    run();
  }, [paint, run]);
  React.useLayoutEffect(() => { paint(); go(0); return () => { cancelAnimationFrame(S.raf); S.raf = 0; const u = under && under.current; if (u) { u.style.transform = ""; u.style.setProperty("--pd-shade", "0"); } }; }, []);
  const back = React.useCallback(() => {
    if (S.leaving) return;
    save(); saveTitle();
    const a = document.activeElement; if (a && root.current && root.current.contains(a)) a.blur();
    setEditing(false); setSel(null); setPanel(null); setPop(null); setSheet(null); setMenu(false);
    S.leaving = true; if (onBack) onBack(); go(1);
  }, [go, onBack, save, saveTitle]);
  React.useImperativeHandle(enter && enter.ref ? enter.ref : null, () => ({ back: back }), [back]);

  /* scroll: the band, the compact title, the fog */
  React.useLayoutEffect(() => {
    const el = sc.current, r = root.current; if (!el || !r) return undefined;
    let last = "";
    const read = () => {
      const y = el.scrollTop;
      const t = titleEl.current ? titleEl.current.getBoundingClientRect().bottom - el.getBoundingClientRect().top + y : 160;
      const band = pdClamp(y / 24, 0, 1);
      const kt = pdClamp((y - (t - 96)) / 28, 0, 1);
      const fog = pdClamp((el.scrollHeight - el.clientHeight - y - 40) / 60, 0, 1);
      const key = band.toFixed(3) + kt.toFixed(3) + fog.toFixed(3);
      if (key === last) return;
      last = key;
      r.style.setProperty("--pk-band", band.toFixed(3));
      r.style.setProperty("--pk-kt", kt.toFixed(3));
      r.style.setProperty("--pk-fog-k", fog.toFixed(3));
      r.setAttribute("data-pd-collapsed", kt > 0.5 ? "1" : "0");
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro2 = typeof ResizeObserver === "function" ? new ResizeObserver(read) : null;
    if (ro2) { ro2.observe(el); if (el.firstElementChild) ro2.observe(el.firstElementChild); }
    return () => { el.removeEventListener("scroll", read); if (ro2) ro2.disconnect(); };
  }, [d.id]);

  /* the swipe from the left edge */
  const move = (e) => {
    const g = S.drag; if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
    const now = performance.now();
    g.s.push([now, e.clientX]); while (g.s.length > 2 && now - g.s[0][0] > 90) g.s.shift();
    if (!g.kind) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      g.kind = dx > 0 && Math.abs(dx) > Math.abs(dy) ? "back" : "none";
      if (g.kind === "back") { cancelAnimationFrame(S.raf); S.raf = 0; if (root.current) root.current.classList.add("is-dragging"); }
    }
    if (g.kind !== "back") return;
    if (e.cancelable) e.preventDefault();
    S.p.x = Math.max(0, dx) / g.W; S.p.v = 0;
    paint();
  };
  const end = () => {
    const g = S.drag; S.drag = null;
    if (root.current) root.current.classList.remove("is-dragging");
    if (!g || g.kind !== "back") return;
    S.ended = performance.now();
    const a = g.s[0], b = g.s[g.s.length - 1];
    const v = b[0] - a[0] > 0 ? (b[1] - a[1]) / (b[0] - a[0]) : 0;
    const vel = pdClamp((v * 1000) / g.W, -8, 8);
    if (S.p.x > 0.4 || (v > 0.45 && S.p.x > 0.06)) { S.p.v = vel; back(); }
    else go(0, vel);
  };
  const onPointerDown = (e) => {
    if ((e.button != null && e.button > 0) || S.leaving || !root.current || editing || sel != null) return;
    const r = root.current.getBoundingClientRect();
    if (e.clientX - r.left > PD_EDGE) return;
    S.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, W: r.width, kind: null, s: [[performance.now(), e.clientX]] };
    const mv = (ev) => move(ev);
    const up = (ev) => { window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", up, true); window.removeEventListener("pointercancel", up, true); end(ev); };
    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", up, true); window.addEventListener("pointercancel", up, true);
  };
  const swallow = (e) => {
    const now = performance.now();
    if (now - S.ended < 300 || now - P.fired < 450) { e.stopPropagation(); e.preventDefault(); return; }
    /* selecting: a tap on another block selects it, anywhere else lets go */
    if (selRef.current == null || !e.target.closest || e.target.closest(".pd-actbar, .pk-sheet-layer, .pd-menu-layer, .pd-bar")) return;
    const bEl = e.target.closest("[data-pd-b]");
    e.stopPropagation(); e.preventDefault();
    if (bEl && bEl.getAttribute("data-pd-b") !== selRef.current) setSel(bEl.getAttribute("data-pd-b"));
    else setSel(null);
  };

  /* ── editing ── */
  const idx = (id) => B.current.findIndex((x) => x.id === id);
  const blk = (id) => B.current.filter((x) => x.id === id)[0] || null;
  const replace = (id, a, bump) => B.current.map((x) => (x.id === id ? { id: x.id, a: a, v: bump ? x.v + 1 : x.v } : x));
  const [, setTick] = React.useState(0);
  const focusAt = (id, off, end) => { pending.current = { id: id, off: off, end: end }; setTick((x) => x + 1); };
  const startEdit = (id) => { setEditing(true); setSel(null); setFocusId(id); };
  const done = () => {
    save(); saveTitle();
    const a = document.activeElement; if (a && root.current && root.current.contains(a)) a.blur();
    const s0 = window.getSelection(); if (s0 && s0.rangeCount && root.current && root.current.contains(s0.anchorNode)) s0.removeAllRanges();
    setEditing(false); setPanel(null); setPop(null); setFocusId(null);
  };
  const doneRef = React.useRef(done); doneRef.current = done;

  /* insert arrays after a block (or in place of an empty text line) */
  const insert = (atId, arrs, focusIdx, replaceEmpty) => {
    const list = B.current.slice();
    let i = atId == null ? list.length - 1 : list.findIndex((x) => x.id === atId);
    const cur = i > -1 ? list[i] : null;
    const add = arrs.map((a) => ({ id: pdUid(), a: a, v: 0 }));
    const isBlank = (x) => x && x.a[0] === "p" && !pdText(x.a);
    const swap = replaceEmpty && isBlank(cur);
    const next = list[swap ? i + 1 : i + 1];
    /* a trailing empty line is only added when there is not one already */
    let reuse = null;
    if (add.length > 1 && isBlank(add[add.length - 1]) && isBlank(next)) { add.pop(); reuse = next; }
    if (swap) list.splice(i, 1, ...add); else list.splice(i + 1, 0, ...add);
    setBlocks(list);
    const fi = focusIdx == null ? 0 : focusIdx;
    return add[fi] || reuse || null;
  };
  const addContent = (k, atId) => {
    const at = atId || focusRef.current || selRef.current || (B.current.length ? B.current[B.current.length - 1].id : null);
    setPanel(null); setPop(null); setSheet(null);
    if (k === "image") { P.imgFor = at; P.imgMode = "insert"; pickImg(); return; }
    if (k === "page") { P.linkFor = at; setSheet("link"); return; }
    if (PD_TEXT[k]) { const n = insert(at, [pdArr(k, "")], 0, true); if (n) { startEdit(n.id); focusAt(n.id, 0); } return; }
    if (k === "rule") { const n = insert(at, [["rule"], ["p", ""]], 1, true); if (n) { startEdit(n.id); focusAt(n.id, 0); } return; }
    if (k === "table") { const n = insert(at, [["table", [["", "", ""], ["", "", ""], ["", "", ""]]], ["p", ""]], 0, true); if (n) { startEdit(n.id); pending.current = { cell: n.id + ":0:0", off: 0 }; setTick((x) => x + 1); } return; }
    if (k === "date") { const iso = pdToday(); const n = insert(at, [pdArr("date", pdDateLabel(iso), null, { date: iso }), ["p", ""]], 1, true); if (n) { startEdit(n.id); focusAt(n.id, 0); } return; }
  };

  const api = {
    live: live,
    focus: (id) => { if (sel != null) return; if (!editing) setEditing(true); if (focusRef.current !== id) { setFocusId(id); setPop(null); } },
    input: (id, el) => {
      if (!el.textContent && el.innerHTML) el.innerHTML = "";
      const b = blk(id); if (!b) return;
      const t = el.textContent;
      setBlocks(replace(id, pdWithText(b.a, dxFromEditor(el, b.a[1]))), "type");
      /* "/" and ":" suggestions, from the words before the caret */
      const off = pdCaret(el);
      const before = off == null ? t : t.slice(0, off);
      let m = /(?:^|\s)\/([^\s/]{0,20})$/.exec(before);
      if (m) { const q = m[1].toLowerCase(); setPop({ kind: "slash", id: id, q: q, start: before.length - q.length - 1, i: 0 }); }
      else if ((m = /(?:^|\s):([a-z_]{0,20})$/i.exec(before))) { const q = m[1].toLowerCase(); setPop({ kind: "emoji", id: id, q: q, start: before.length - q.length - 1, i: 0 }); }
      else if (pop) setPop(null);
      requestAnimationFrame(() => reveal(el));
    },
    key: (id, e) => {
      if (pop) {
        const items = popItems(pop);
        if (e.key === "ArrowDown") { e.preventDefault(); setPop(Object.assign({}, pop, { i: (pop.i + 1) % Math.max(1, items.length) })); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setPop(Object.assign({}, pop, { i: (pop.i - 1 + items.length) % Math.max(1, items.length) })); return; }
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPop(null); return; }
        if ((e.key === "Enter" || e.key === "Tab") && items.length) { e.preventDefault(); pickPop(items[Math.min(pop.i, items.length - 1)]); return; }
      }
      const b = blk(id); if (!b) return;
      if (e.key === "Enter" && !(b.a[0] === "code" && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); enterAt(id, pdCaret(e.currentTarget)); return; }
      if (e.key === "Backspace") {
        const s2 = window.getSelection();
        if (s2 && s2.rangeCount && !s2.getRangeAt(0).collapsed) return;
        if (pdCaret(e.currentTarget) === 0) { e.preventDefault(); backAt(id); }
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); done(); }
    },
    toggle: (id) => { const b = blk(id); if (!b) return; setBlocks(replace(id, pdArr("todo", b.a[1], b.a[2] ? null : true, pdFmt(b.a)))); },
    cell: (id, r, c, t) => {
      const b = blk(id); if (!b) return;
      const rows = (b.a[1] || []).map((row) => row.slice());
      if (!rows[r]) return; rows[r][c] = t;
      setBlocks(replace(id, ["table", rows]), "type");
    },
    cellNext: (id, r, c) => {
      const b = blk(id); if (!b) return;
      const rows = b.a[1] || [];
      if (c + 1 < rows[r].length) pending.current = { cell: id + ":" + r + ":" + (c + 1) };
      else if (r + 1 < rows.length) pending.current = { cell: id + ":" + (r + 1) + ":0" };
      else { api.tableAdd(id, "row"); return; }
      setTick((x) => x + 1);
    },
    tableAdd: (id, what) => {
      const b = blk(id); if (!b) return;
      const rows = (b.a[1] || [[""]]).map((row) => row.slice());
      if (what === "row") rows.push(rows[0].map(() => ""));
      else rows.forEach((row) => row.push(""));
      setBlocks(replace(id, ["table", rows], true));
      pending.current = { cell: what === "row" ? id + ":" + (rows.length - 1) + ":0" : id + ":0:" + (rows[0].length - 1) }; setTick((x) => x + 1);
    },
    pickImage: (id, mode) => { P.imgFor = id; P.imgMode = mode; pickImg(); },
    pickDate: (id) => {
      const b = blk(id); const el = dateRef.current; if (!b || !el) return;
      P.dateFor = id; el.value = pdFmt(b.a).date || pdToday();
      try { el.showPicker(); } catch (e) { el.focus(); el.click(); }
    },
    openDoc: (id) => { if (!id || !pdFind(id)) return; save(); saveTitle(); if (onOpenDoc) onOpenDoc(id); },
    press: (id, e) => {
      if (e.button != null && e.button > 0) return;
      if (e.target.closest && e.target.closest(".pd-handle")) return;
      clearTimeout(P.lp && P.lp.t);
      const x0 = e.clientX, y0 = e.clientY;
      const lp = { t: setTimeout(() => { P.fired = performance.now(); off(); select(id); }, 480) };
      const mv = (ev) => { if (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8) off(); };
      const off = () => { clearTimeout(lp.t); window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", off, true); window.removeEventListener("pointercancel", off, true); };
      P.lp = lp;
      window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", off, true); window.addEventListener("pointercancel", off, true);
    },
    select: (id) => select(id),
    suggest: (id, yes) => {
      const i = idx(id); if (i < 0) return;
      const before = B.current;
      setBlocks(B.current.filter((x) => x.id !== id));
      tell(yes ? "Suggestion accepted" : "Suggestion dismissed", () => setBlocks(before));
    }
  };

  const enterAt = (id, off) => {
    const b = blk(id); if (!b) return;
    const k = b.a[0], t = pdText(b.a);
    const o = off == null ? t.length : off;
    /* an empty list / to-do line ends the list */
    if ((k === "li" || k === "todo" || k === "quote" || k === "callout") && !t) {
      setBlocks(replace(id, pdArr("p", "", null, null), true)); focusAt(id, 0); return;
    }
    /* the words after the caret go down with their marks */
    const head = sliceSpans(b.a[1], 0, o), tail = sliceSpans(b.a[1], o);
    const nk = k === "li" || k === "todo" ? k : "p";
    const list = replace(id, pdWithText(b.a, head), true);
    const n = { id: pdUid(), a: pdArr(nk, tail, null, null), v: 0 };
    list.splice(list.findIndex((x) => x.id === id) + 1, 0, n);
    setBlocks(list); setFocusId(n.id); focusAt(n.id, 0);
  };
  const backAt = (id) => {
    const i = idx(id); if (i < 0) return;
    const b = B.current[i], k = b.a[0], t = pdText(b.a);
    if (k !== "p" && PD_TEXT[k]) { setBlocks(replace(id, pdArr("p", b.a[1], null, pdFmt(b.a)), true)); focusAt(id, 0); return; }
    if (i === 0) { focusAt("title", null); return; }
    const prev = B.current[i - 1];
    if (PD_TEXT[prev.a[0]]) {
      const pt = pdText(prev.a);
      const list = B.current.filter((x) => x.id !== id).map((x) => (x.id === prev.id ? { id: x.id, a: pdWithText(x.a, concatSpans(x.a[1], b.a[1])), v: x.v + 1 } : x));
      setBlocks(list); setFocusId(prev.id); focusAt(prev.id, pt.length);
    } else {
      /* a divider, a picture … above: that block goes */
      setBlocks(B.current.filter((x) => x.id !== prev.id)); focusAt(id, 0);
      tell("Block deleted", () => setBlocks(pdInsertBack(prev, i - 1)));
    }
  };
  const pdInsertBack = (b, at) => { const l = B.current.slice(); l.splice(Math.min(at, l.length), 0, b); return l; };

  /* the simulated keyboard */
  const onKey = (k) => {
    let id = focusRef.current;
    let el = id ? pdEdOf(root.current, id) : null;
    const act = document.activeElement;
    if (act && root.current && root.current.contains(act) && act.isContentEditable) el = act;
    else if (el) pdPlace(el, null);
    else if (titleEl.current) { el = titleEl.current; pdPlace(el, null); }
    if (!el) return;
    if (k === "enter") { if (el === titleEl.current) titleEnter(); else if (el.hasAttribute("data-pd-cell")) el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); else enterAt(el.getAttribute("data-pd-ed"), pdCaret(el)); return; }
    if (k === "back") {
      const s2 = window.getSelection();
      const collapsed = !s2 || !s2.rangeCount || s2.getRangeAt(0).collapsed;
      if (collapsed && pdCaret(el) === 0 && el.hasAttribute("data-pd-ed") && el !== titleEl.current) { backAt(el.getAttribute("data-pd-ed")); return; }
      document.execCommand("delete", false);
      return;
    }
    document.execCommand("insertText", false, k === "emoji" ? ":" : k);
  };

  /* the "/" and ":" popovers */
  const popItems = (p) => {
    if (!p) return [];
    if (p.kind === "slash") return PD_SLASH.filter((it) => !p.q || it.label.toLowerCase().indexOf(p.q) === 0 || it.k.indexOf(p.q) === 0 || it.label.toLowerCase().indexOf(" " + p.q) > -1).slice(0, 8);
    return PD_EMOJI.filter((x) => !p.q || x[0].indexOf(p.q) === 0).slice(0, 12);
  };
  const pickPop = (it) => {
    const p = pop; setPop(null); if (!p) return;
    const b = blk(p.id); const el = pdEdOf(root.current, p.id); if (!b) return;
    const t = el ? dxFromEditor(el, b.a[1]) : b.a[1];
    const end = p.start + 1 + p.q.length;
    if (p.kind === "emoji") {
      const nt = spliceText(t, p.start, end, it[1]);
      setBlocks(replace(p.id, pdWithText(b.a, nt), true)); focusAt(p.id, p.start + it[1].length); return;
    }
    const rest = spliceText(t, p.start, end, "");
    if (PD_TEXT[it.k]) {
      setBlocks(replace(p.id, pdArr(it.k, rest, it.k === b.a[0] ? b.a[2] : null, pdFmt(b.a)), true)); focusAt(p.id, p.start); return;
    }
    setBlocks(replace(p.id, pdWithText(b.a, rest), true), "quiet");
    addContent(it.k, p.id);
  };

  /* ── selection and block actions ── */
  const select = (id) => {
    save(); saveTitle();
    const a = document.activeElement; if (a && root.current && root.current.contains(a)) a.blur();
    setEditing(false); setPanel(null); setPop(null); setFocusId(null); setSel(id);
  };
  const target = () => sel || focusRef.current;
  const setType = (k) => {
    const id = target(); const b = blk(id); if (!b || !PD_TEXT[b.a[0]]) return;
    const el = pdEdOf(root.current, id); const off = el ? pdCaret(el) : null;
    setBlocks(replace(id, pdArr(k, el ? dxFromEditor(el, b.a[1]) : b.a[1], k === b.a[0] ? b.a[2] : null, pdFmt(b.a)), true));
    if (editing && sel == null) focusAt(id, off);
  };
  /* Marks go on the selected words (the last selection inside the target
     block, kept in P.range while a sheet has the focus); with nothing
     selected — a caret, or a block picked with its handle — on the whole
     block. Marks: b, i, s, code (toggle), href, color, hl (a value). */
  const rangeOf = (id, b) => {
    const r = P.range;
    if (editing && sel == null && r && r.id === id && r.end > r.start) return r;
    return { id: id, start: 0, end: pdText(b.a).length, whole: true };
  };
  const markRange = (mark, value) => {
    const id = target(); const b = blk(id); if (!b || !PD_TEXT[b.a[0]]) return null;
    const r = rangeOf(id, b);
    const caret = r.whole && editing && sel == null ? (P.range && P.range.id === id ? P.range.start : pdCaret(pdEdOf(root.current, id))) : null;
    setBlocks(replace(id, pdWithText(b.a, applyMark(b.a[1], r.start, r.end, mark, value)), true));
    if (editing && sel == null) { if (r.whole) focusAt(id, caret); else focusAt(id, r.start, r.end); }
    return r;
  };
  const marksNow = () => {
    const id = target(); const b = blk(id); if (!b || !PD_TEXT[b.a[0]]) return {};
    const r = rangeOf(id, b);
    return marksIn(b.a[1], r.start, r.end);
  };
  const setMark = (m) => { markRange(m); };
  const setColor = (c) => {
    if (colorMode === "page") { pdSetStyle(d, { page: c, backdrop: "none" }); setSheet(sel != null || !editing ? "page" : null); return; }
    const id = target(); const b = blk(id); if (!b) { setSheet(null); return; }
    markRange(colorMode === "hl" ? "hl" : "color", c === "default" || c === "none" ? null : c);
    setSheet(sel != null ? "style" : null);
  };
  const setLink = (url) => {
    setSheet(sel != null ? "style" : null);
    if (url == null) { markRange("href", null); return; }
    const h = dxSafeHref(url);
    if (!h) { tell("Enter a web address, like needt.app"); return; }
    markRange("href", h);
  };
  const moveBlock = (id, dir) => {
    const i = idx(id), j = i + dir; if (i < 0 || j < 0 || j >= B.current.length) return;
    const l = B.current.slice(); const x = l[i]; l[i] = l[j]; l[j] = x;
    setBlocks(l);
    if (editing && sel == null) focusAt(id, null);
  };
  const dupBlock = (id) => {
    const i = idx(id); if (i < 0) return;
    const c = { id: pdUid(), a: JSON.parse(JSON.stringify(B.current[i].a)), v: 0 };
    if (c.a[3] && c.a[3].remind) { delete c.a[3].remind; c.a = pdArr(c.a[0], c.a[1], c.a[2], c.a[3]); }
    const l = B.current.slice(); l.splice(i + 1, 0, c); setBlocks(l);
    if (sel != null) setSel(c.id);
    tell("Duplicated", () => setBlocks(B.current.filter((x) => x.id !== c.id)));
  };
  const delBlock = (id) => {
    const i = idx(id); if (i < 0) return;
    const before = B.current;
    let l = B.current.filter((x) => x.id !== id);
    if (!l.length) l = [{ id: pdUid(), a: ["p", ""], v: 0 }];
    setBlocks(l); setSel(null); setSheet(null);
    if (editing) { const n = l[Math.max(0, i - 1)]; if (n && PD_TEXT[n.a[0]]) { setFocusId(n.id); focusAt(n.id, null); } else done(); }
    tell("Block deleted", () => setBlocks(before));
  };
  const copyLink = (id) => {
    const url = "https://needt.app/d/" + d.id + "#" + (idx(id) + 1);
    setSheet(null);
    window.needtPlatform.copy(url).then((r) => tell(r.ok ? "Link copied" : "Link: " + url.replace("https://", "")));
  };
  const remind = (w) => {
    const id = target(); const b = blk(id); setSheet(null); if (!b) return;
    const words = pdText(b.a).trim() || (b.a[0] === "image" ? "Picture" : b.a[0] === "table" ? "Table" : "") || d.title || "Untitled";
    const title = words.length > 80 ? words.slice(0, 79) + "…" : words;
    const tid = pkDay.create({ title: title, date: w.date, time: w.time, note: "From the page “" + (d.title || "Untitled") + "”" });
    setBlocks(replace(id, pdWithFmt(b.a, { remind: { id: tid, label: w.label } })));
    tell("Reminder set · " + w.label, () => { mbTaskStore.set((l) => l.filter((t) => t.id !== tid)); const nb = blk(id); if (nb) setBlocks(replace(id, pdWithFmt(nb.a, { remind: null }))); });
  };

  /* image / date / link pickers */
  const onImage = (fs) => {
    const f = fs && fs[0]; if (!f) return;
    const at = P.imgFor, mode = P.imgMode;
    pdReadImage(f, (url) => {
      if (mode === "fill" && blk(at)) setBlocks(replace(at, ["image", url], true));
      else { const n = insert(at, [["image", url], ["p", ""]], 1, true); if (n) { startEdit(n.id); focusAt(n.id, 0); } }
      tell("Image added");
    });
  };
  const onDate = (e) => {
    const v = e.target.value, id = P.dateFor; const b = blk(id); if (!v || !b) return;
    setBlocks(replace(id, pdArr("date", pdDateLabel(v), null, Object.assign({}, pdFmt(b.a), { date: v })), true));
  };
  const onLink = (docId) => {
    setSheet(null);
    let id = docId;
    if (id == null) { const nd = window.docs.create({ title: "" }); id = nd.id; tell("New page linked"); }
    const n = insert(P.linkFor, [["page", id], ["p", ""]], 1, true);
    if (n) { startEdit(n.id); focusAt(n.id, 0); }
  };

  /* title */
  const titleEnter = () => {
    saveTitle();
    const first = B.current[0];
    if (first && PD_TEXT[first.a[0]]) { setFocusId(first.id); focusAt(first.id, 0); }
    else { const n = { id: pdUid(), a: ["p", ""], v: 0 }; setBlocks([n].concat(B.current)); setFocusId(n.id); focusAt(n.id, 0); }
  };
  React.useLayoutEffect(() => { const el = titleEl.current; if (el && document.activeElement !== el && el.textContent !== (d.title || "")) el.textContent = d.title || ""; }, [d.title]);
  React.useEffect(() => {
    if (!autoEdit || ro) return undefined;
    const t = setTimeout(() => { startEdit("title"); focusAt("title", null); }, pdReduced() ? 0 : 340);
    return () => clearTimeout(t);
  }, []);

  /* tap under the last block: type on a fresh line */
  const tail = () => {
    if (ro || sel != null) return;
    const last = B.current[B.current.length - 1];
    if (last && last.a[0] === "p" && !pdText(last.a)) { startEdit(last.id); focusAt(last.id, 0); return; }
    const n = { id: pdUid(), a: ["p", ""], v: 0 };
    setBlocks(B.current.concat([n])); startEdit(n.id); focusAt(n.id, 0);
  };
  /* Esc */
  React.useEffect(() => {
    if (!editing && sel == null) return undefined;
    const k = (e) => { if (e.key === "Escape" && !sheet && !menu) { if (sel != null) setSel(null); else doneRef.current(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [editing, sel, sheet, menu]);

  /* The selection inside a block's words: kept in P.range for Aa / the
     bubble / the sheets (they take the focus, the range stays), and the
     selection bubble over selected words. */
  const [bubble, setBubble] = React.useState(null);   /* { id, x, y, below } */
  const [, setRangeTick] = React.useState(0);          /* Aa open: its marks follow the selection */
  const panelRef = React.useRef(panel); panelRef.current = panel;
  React.useEffect(() => {
    if (!editing) { P.range = null; setBubble(null); return undefined; }
    const on = () => {
      const s2 = window.getSelection(), r0 = root.current;
      if (!s2 || !s2.rangeCount || !r0) return;
      const r = s2.getRangeAt(0), n = r.startContainer;
      const host = n && (n.nodeType === 1 ? n : n.parentElement);
      const el = host && host.closest ? host.closest("[data-pd-ed]") : null;
      if (!el || !r0.contains(el)) return;
      if (el === titleEl.current) { P.range = null; setBubble(null); return; }
      const o = dxRangeIn(el, r); if (!o) return;
      const id = el.getAttribute("data-pd-ed");
      const was = P.range;
      P.range = { id: id, start: o.start, end: o.end };
      if (panelRef.current === "style" && (!was || was.id !== id || was.start !== o.start || was.end !== o.end)) setRangeTick((x) => x + 1);
      if (o.end > o.start && el.contains(r.endContainer)) {
        const rr = r.getBoundingClientRect(), box = r0.getBoundingClientRect();
        const below = rr.top - box.top < 190;   /* no room under the top band: hang it below the words */
        setBubble({ id: id, x: pdClamp(rr.left + rr.width / 2 - box.left, 150, box.width - 150), y: below ? rr.bottom - box.top + 10 : rr.top - box.top - 10, below: below });
      } else setBubble(null);
    };
    document.addEventListener("selectionchange", on);
    return () => document.removeEventListener("selectionchange", on);
  }, [editing]);

  /* ── the page's ⋯ ── */
  const docNow = pdFind(d.id) || d;
  const share = () => {
    setMenu(false);
    const url = "https://needt.app/d/" + d.id, title = d.title || "Untitled";
    /* the share sheet where there is one (dismissed = nothing to say), else the clipboard */
    window.needtPlatform.share({ title: title, url: url }).then((r) => { if (r.via !== "native") tell(r.ok ? "Link copied" : "Link: " + url.replace("https://", "")); });
  };
  const trash = () => {
    setMenu(false); save(); saveTitle();
    pdPatch(d.id, { trashedAt: new Date().toISOString() });
    tell("Moved to Trash", () => pdPatch(d.id, { trashedAt: null }));
    if (onTrashed) onTrashed();
  };
  const moveTo = (p) => {
    setSheet(null);
    const before = docNow.projectId || null;
    if ((p.id || null) === before) return;
    pdPatch(d.id, { projectId: p.id || null });
    tell("Moved to " + p.name, () => pdPatch(d.id, { projectId: before }));
  };
  const pin = () => { setMenu(false); const on = !docNow.isFavorite; pdPatch(d.id, { isFavorite: on }); tell(on ? "Pinned" : "Unpinned", () => pdPatch(d.id, { isFavorite: !on })); };
  const dupPage = () => {
    setMenu(false); save(); saveTitle();
    const cur = pdFind(d.id) || d;
    const c = window.docs.create({ title: (cur.title || "Untitled") + " copy", body: JSON.parse(JSON.stringify(cur.body || [])), style: cur.style ? Object.assign({}, cur.style) : null, coverUrl: cur.coverUrl || null, projectId: cur.projectId || null });
    tell("Duplicated", () => window.docs.remove(c.id));
  };
  const menuItems = ro ? [{ id: "share", label: "Copy link", icon: "copy-link", onClick: share }] : [
    { id: "style", label: "Page Style", icon: "palette", onClick: () => { setMenu(false); setSheet("page"); } },
    { id: "share", label: "Share", icon: "share", onClick: share },
    { id: "move", label: "Move to…", icon: "folder", onClick: () => { setMenu(false); setSheet("move"); } },
    { id: "pin", label: docNow.isFavorite ? "Unpin" : "Pin", icon: "star", onClick: pin },
    { id: "dup", label: "Duplicate page", icon: "duplicate", onClick: dupPage },
    { sep: true },
    { id: "delete", label: "Delete", icon: "trash-2", tone: "alert", onClick: trash }
  ];

  const tgt = blk(sel || focusId);
  const tgtA = tgt ? tgt.a : null;
  const marks = marksNow();
  const moreItems = [
    { id: "up", label: "Move up", icon: "arrow-up", hue: "gray", disabled: !tgt || idx(tgt.id) <= 0, onClick: () => tgt && moveBlock(tgt.id, -1) },
    { id: "down", label: "Move down", icon: "arrow-down", hue: "gray", disabled: !tgt || idx(tgt.id) >= B.current.length - 1, onClick: () => tgt && moveBlock(tgt.id, 1) },
    { id: "dup", label: "Duplicate", icon: "duplicate", hue: "green", disabled: !tgt, onClick: () => tgt && dupBlock(tgt.id) },
    { id: "remind", label: "Remind", icon: "bell", hue: "amber", disabled: !tgt, onClick: () => setSheet("remind") },
    { id: "page", label: "Page Style", icon: "palette", hue: "violet", onClick: () => setSheet("page") },
    { id: "delete", label: "Delete", icon: "trash-2", hue: "red", tone: "alert", disabled: !tgt, onClick: () => tgt && delBlock(tgt.id) }
  ];
  const [turning, setTurning] = React.useState(false);
  React.useEffect(() => { if (sheet !== "actions") setTurning(false); }, [sheet]);
  const actionRows = turning
    ? PD_TYPES.map(([k, label, icon]) => ({ id: "turn-" + k, label: label, icon: icon, hue: "gray", on: tgtA && tgtA[0] === k, onClick: () => { setType(k); setSheet(null); } }))
    : [
      { id: "dup", label: "Duplicate", icon: "duplicate", hue: "green", onClick: () => { setSheet(null); if (tgt) dupBlock(tgt.id); } },
      { id: "up", label: "Move up", icon: "arrow-up", hue: "gray", disabled: !tgt || idx(tgt.id) <= 0, onClick: () => tgt && moveBlock(tgt.id, -1) },
      { id: "down", label: "Move down", icon: "arrow-down", hue: "gray", disabled: !tgt || idx(tgt.id) >= B.current.length - 1, onClick: () => tgt && moveBlock(tgt.id, 1) },
      { id: "link", label: "Copy link", icon: "copy-link", hue: "blue", onClick: () => tgt && copyLink(tgt.id) },
      { id: "turn", label: "Turn into", meta: tgtA && PD_TEXT[tgtA[0]] ? null : "Only for text blocks", icon: "swap", hue: "violet", arrow: true, disabled: !tgtA || !PD_TEXT[tgtA[0]], onClick: () => setTurning(true) }
    ];

  const vars = window.dcVars ? window.dcVars(s) : null;
  const faded = bd && s.bdLook === "faded";
  const kbH = sim ? 291 : kbLift;
  const popList = popItems(pop);
  const hasPop = pop && popList.length > 0;
  const metaLine = ro && d.sharedBy ? "Shared by " + d.sharedBy + (d.role ? " · " + d.role : "") : mbDocMeta(docNow);

  return (
    <div ref={root} className={pdCx("pd-reader", "pk-screen", bd && "is-bd", editing && "is-editing", sel != null && "is-selecting")} style={Object.assign({ "--pd-kb": kbH + "px" }, vars)}
      data-pd-reader={d.id} data-pd-collapsed="0" data-pd-mode={editing ? "edit" : sel != null ? "select" : "read"}
      onPointerDown={onPointerDown} onClickCapture={swallow}>
      <div ref={sc} className="pd-reader-scroll">
        <div className={pdCx("mb-doc pd-doc", bd && "has-bd", faded && "is-faded", bd && s.bdBlur && "is-blur")} data-mb-screen="doc" data-mb-doc-theme={st.theme || ("backdrop" in st ? "custom" : "default")}
          data-dc-backdrop={s.backdrop} data-dc-page={s.page} data-dc-font={s.font} style={bd ? mbDcBdVars(s.backdrop) : null}>
          <article data-dc-font={s.font} className={"dt-themed mb-doc-card" + (bd ? " on-backdrop" : "") + (s.cover ? " has-cover" : "")} style={mbDcVars(s)}>
            {s.cover ? <div data-mb-cover="" className="mb-doc-cover"><MbDocCover cover={s.cover} /></div> : null}
            <span className="mb-doc-meta">{metaLine}</span>
            <h1 ref={titleEl} className={pdCx("mb-doc-title pd-title", !d.title && "is-empty")} contentEditable={live ? "plaintext-only" : "false"} suppressContentEditableWarning spellCheck={false}
              role="textbox" aria-label="Title" data-pd-ed="title" data-ph="Untitled"
              onFocus={() => { if (sel != null) return; setEditing(true); setFocusId("title"); setPop(null); }}
              onInput={(e) => { const el = e.currentTarget; if (!el.textContent && el.innerHTML) el.innerHTML = ""; T.titleText = el.textContent.replace(/\n/g, " "); clearTimeout(T.title); T.title = setTimeout(saveTitle, 400); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); titleEnter(); } else if (e.key === "Escape") { e.preventDefault(); done(); } }} />
            <MbDocSep kind={s.separator} />
            <div className="pd-blocks" role="list">
              {blocks.map((b) => <PdBlock key={b.id} b={b} api={api} sep={s.separator} sel={sel === b.id} focused={focusId === b.id} ro={ro} title={d.title} />)}
            </div>
            {ro ? null : <div className="pd-tail" onClick={tail} data-pd-tail="" aria-hidden="true" />}
          </article>
        </div>
      </div>
      <PkTopBand />
      <div className="pk-compact" aria-hidden="true"><span className="pk-compact-title">{d.title || "Untitled"}</span></div>
      <div className="pd-bar">
        <PdGlass icon="chevron-left" label={"Back to " + (backLabel || "Docs")} className="pd-back" onClick={back} data={{ "data-pd-back": "" }}>{backLabel || "Docs"}</PdGlass>
        <PdGlass icon="ellipsis" label="More" onClick={() => setMenu(true)} data={{ "data-pd-more": "doc" }} />
      </div>
      {editing || sel != null ? null : <PkFog />}

      <input ref={dateRef} type="date" className="pd-hidden" onChange={onDate} aria-label="Date" data-pd-date-input="" />

      {/* the "/" and ":" popovers, over the keyboard bar */}
      {editing && hasPop ? (
        <div className={pdCx("pd-pop", pop.kind === "emoji" && "is-emoji")} role="listbox" aria-label={pop.kind === "slash" ? "Blocks" : "Emoji"} data-pd-pop={pop.kind}>
          {pop.kind === "slash" ? popList.map((it, i) => (
            <button key={it.k + it.label} type="button" role="option" aria-selected={i === pop.i} className={pdCx("pd-pop-item", i === pop.i && "is-on")}
              onPointerDown={(e) => e.preventDefault()} onClick={() => pickPop(it)} data-pd-slash={it.k}>
              <span className={"pd-tile is-sm is-" + it.hue}><PdIcon name={it.icon} size={16} /></span><span>{it.label}</span>
            </button>
          )) : popList.map((x, i) => (
            <button key={x[0]} type="button" role="option" aria-selected={i === pop.i} aria-label={x[0]} className={pdCx("pd-emoji", i === pop.i && "is-on")}
              onPointerDown={(e) => e.preventDefault()} onClick={() => pickPop(x)} data-pd-emoji={x[0]}>
              <span className="pd-emoji-char">{x[1]}</span><span className="pd-emoji-name">{":" + x[0]}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* the selection bubble: marks for the selected words */}
      {editing && bubble && !sheet && !panel && !hasPop ? (
        <div className={pdCx("pd-bubble", bubble.below && "is-below")} role="toolbar" aria-label="Format the selected words" data-pd-bubble=""
          style={{ left: bubble.x, top: bubble.y }} onPointerDown={(e) => e.preventDefault()}>
          {[["b", "bold", "Bold"], ["i", "italic", "Italic"], ["s", "strikethrough", "Strikethrough"], ["code", "code", "Code"]].map(([m, icon, label]) => (
            <button key={m} type="button" className={pdCx("pd-bubble-btn", marks[m] && "is-on")} aria-label={label} aria-pressed={!!marks[m]} onPointerDown={(e) => e.preventDefault()} onClick={() => setMark(m)} data-pd-bubble-mark={m}><PdIcon name={icon} size={17} /></button>
          ))}
          <button type="button" className={pdCx("pd-bubble-btn", marks.href && "is-on")} aria-label="Link" aria-pressed={!!marks.href} onPointerDown={(e) => e.preventDefault()} onClick={() => setSheet("url")} data-pd-bubble-mark="href"><PdIcon name="link" size={17} /></button>
          <span className="pd-bubble-sep" />
          <button type="button" className="pd-bubble-btn" aria-label="Text colour" onPointerDown={(e) => e.preventDefault()} onClick={() => { setColorMode("text"); setSheet("color"); }} data-pd-bubble-mark="color"><span className={"pd-dot is-sm is-" + (marks.color || "default")} /></button>
          <button type="button" className={pdCx("pd-bubble-btn", marks.hl && "is-on")} aria-label="Highlight" onPointerDown={(e) => e.preventDefault()} onClick={() => { setColorMode("hl"); setSheet("color"); }} data-pd-bubble-mark="hl"><PdIcon name="highlighter" size={17} /></button>
        </div>
      ) : null}

      {/* the keyboard accessory bar, and under it the keyboard (or a panel in its place) */}
      {editing ? (
        <div className="pd-kbd" data-pd-kbd={panel || "keys"} style={sim ? null : { bottom: kbLift }}>
          <div className="pd-acc" role="toolbar" aria-label="Formatting">
            <button type="button" className={pdCx("pd-acc-btn", panel === "style" && "is-on")} aria-label="Style" aria-pressed={panel === "style"} onPointerDown={(e) => e.preventDefault()} onClick={() => setPanel(panel === "style" ? null : "style")} data-pd-acc="style"><span className="pd-acc-aa">Aa</span></button>
            <button type="button" className={pdCx("pd-acc-btn", panel === "content" && "is-on")} aria-label="Add content" aria-pressed={panel === "content"} onPointerDown={(e) => e.preventDefault()} onClick={() => setPanel(panel === "content" ? null : "content")} data-pd-acc="content"><PdIcon name="plus" size={20} /></button>
            <button type="button" className={pdCx("pd-acc-btn", panel === "more" && "is-on")} aria-label="More" aria-pressed={panel === "more"} onPointerDown={(e) => e.preventDefault()} onClick={() => setPanel(panel === "more" ? null : "more")} data-pd-acc="more"><PdIcon name="ellipsis" size={20} /></button>
            <span className="pd-acc-gap" />
            {panel ? <button type="button" className="pd-acc-btn" aria-label="Keyboard" onPointerDown={(e) => e.preventDefault()} onClick={() => setPanel(null)} data-pd-acc="keys"><PdIcon name="keyboard" size={20} /></button> : null}
            <button type="button" className="pd-acc-done" onPointerDown={(e) => e.preventDefault()} onClick={done} data-pd-acc="done">Done</button>
          </div>
          {sim || panel ? (
            <div className="pd-kb-area">
              {panel === "style" ? <PdStylePicker a={focusId === "title" ? null : tgtA} marks={marks} onType={setType} onMark={setMark} onColor={() => { setColorMode("text"); setSheet("color"); }} onHl={() => { setColorMode("hl"); setSheet("color"); }} />
                : panel === "content" ? <PdContentPicker onPick={(k) => addContent(k)} />
                : panel === "more" ? <PdMorePicker items={moreItems} />
                : <PdKeyboard onKey={onKey} />}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* the block action bar */}
      {sel != null ? (
        <>
          <div className="pd-actbar" role="toolbar" aria-label="Block actions" data-pd-actbar="">
            {[["style", "Style", "style", "violet", () => setSheet("style")], ["content", "Content", "plus", "blue", () => setSheet("content")], ["remind", "Remind", "bell", "amber", () => setSheet("remind")],
              ["actions", "Actions", "ellipsis", "green", () => setSheet("actions")], ["delete", "Delete", "trash-2", "red", () => delBlock(sel)]].map(([id, label, icon, hue, fn]) => (
              <button key={id} type="button" className="pd-act" onClick={fn} data-pd-sel-act={id}>
                <span className={"pd-tile is-" + hue}><PdIcon name={icon} size={20} /></span>
                <span className="pd-act-label">{id === "content" ? "+ Content" : label}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      <PdMenu open={menu} onClose={() => setMenu(false)} items={menuItems} label="Page actions" />
      <PkSheet open={sheet === "style"} onClose={() => setSheet(null)} title="Style" label="Block style">
        <PdStylePicker a={tgtA} marks={marks} onType={setType} onMark={setMark} onColor={() => { setColorMode("text"); setSheet("color"); }} onHl={() => { setColorMode("hl"); setSheet("color"); }} />
      </PkSheet>
      <PkSheet open={sheet === "content"} onClose={() => setSheet(null)} title="Add content" meta="Goes under the selected block" label="Add content">
        <PdContentPicker onPick={(k) => { const at = sel; setSel(null); addContent(k, at); }} />
      </PkSheet>
      <PkSheet open={sheet === "actions"} onClose={() => setSheet(null)} title={turning ? "Turn into" : "Actions"} label="Block actions">
        <PdRows rows={actionRows} label="Actions" />
      </PkSheet>
      <PdRemindSheet open={sheet === "remind"} onClose={() => setSheet(null)} onPick={remind} text={tgtA ? pdText(tgtA).slice(0, 60) : ""} />
      <PdColorSheet open={sheet === "color"} onClose={() => setSheet(colorMode === "page" ? "page" : sel != null ? "style" : null)} mode={colorMode}
        value={colorMode === "page" ? s.page : colorMode === "hl" ? (marks.hl || "none") : (marks.color || "default")} onPick={setColor} />
      <PdUrlSheet open={sheet === "url"} onClose={() => setSheet(sel != null ? "style" : null)} cur={marks.href || ""} onApply={setLink} />
      <PdPageStyleSheet doc={docNow} open={sheet === "page"} onClose={() => setSheet(null)} say={tell} onSolid={() => { setColorMode("page"); setSheet("color"); }} />
      <PdLinkSheet open={sheet === "link"} onClose={() => setSheet(null)} cur={d.id} onPick={onLink} />
      <PdMoveSheet doc={docNow} open={sheet === "move"} onClose={() => setSheet(null)} onPick={moveTo} />
    </div>
  );
}

/* ── Docs home: Quick Open, Recents / Shared, the card grid; the page over it ── */
function PdCard({ d, onOpen, onHold, shared }) {
  const H = React.useRef({ t: 0, fired: 0 }).current;
  const down = (e) => {
    if (!onHold || (e.button != null && e.button > 0)) return;
    clearTimeout(H.t);
    const x0 = e.clientX, y0 = e.clientY;
    H.t = setTimeout(() => { H.fired = performance.now(); off(); onHold(d); }, 480);
    const mv = (ev) => { if (Math.abs(ev.clientX - x0) > 8 || Math.abs(ev.clientY - y0) > 8) off(); };
    const off = () => { clearTimeout(H.t); window.removeEventListener("pointermove", mv, true); window.removeEventListener("pointerup", off, true); window.removeEventListener("pointercancel", off, true); };
    window.addEventListener("pointermove", mv, true); window.addEventListener("pointerup", off, true); window.addEventListener("pointercancel", off, true);
  };
  const proj = !shared && window.NEEDT.projectName ? window.NEEDT.projectName(d) : null;
  return (
    <button type="button" className="pd-card" data-pd-card={d.id} onPointerDown={down} onContextMenu={(e) => { if (onHold) { e.preventDefault(); onHold(d); } }}
      onClick={(e) => { if (performance.now() - H.fired < 450) { e.preventDefault(); return; } onOpen(d); }}>
      <PdCardPage d={d} />
      <span className="pd-card-text">
        <span className={pdCx("pd-card-title", !d.title && "is-untitled")}>{d.isFavorite ? <span className="pd-pin" aria-label="Pinned"><PdIcon name="star" size={12} /></span> : null}{d.title || "Untitled"}</span>
        <span className="pd-card-meta">
          {shared ? "From " + String(d.sharedBy || "").split(" ")[0] + " · " + d.updated
            : <>{proj ? <span className="pd-card-proj"><span className="pk-hue" style={{ "--hue": mbHue(d.projectId) }} />{proj}</span> : null}{d.updated ? <span>{d.updated}</span> : null}</>}
        </span>
      </span>
    </button>
  );
}

function PdDocs({ say, onCover }) {
  const all = mbUseDocs();
  const docs = all.filter((d) => !d.trashedAt);
  const shared = (typeof MB_SHARED !== "undefined" ? (window.SHARED && window.TrashScreen ? window.SHARED : MB_SHARED) : []) || [];
  const [sort, setSortRaw] = React.useState(dcReadSort);
  React.useEffect(() => (window.needtSync ? window.needtSync.subscribe(DC_SORT_KEY, (v, info) => { if (info.origin !== "local") setSortRaw(dcReadSort()); }) : undefined), []);
  const [tab, setTab] = React.useState("recent");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(null);          /* { id, ro, doc, auto } */
  const [menu, setMenu] = React.useState(false);
  const [hold, setHold] = React.useState(null);          /* a doc, long-pressed */
  const [moving, setMoving] = React.useState(null);
  const [tpl, setTpl] = React.useState(false);
  const under = React.useRef(null);
  const readerRef = React.useRef(null);
  const placeEl = React.useRef(null);
  /* the place clips (overflow hidden) and never scrolls: a focus that would
     scroll it to reveal something (a field in a sheet) is put back */
  React.useEffect(() => {
    const el = placeEl.current; if (!el) return undefined;
    const fix = () => { if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; } };
    el.addEventListener("scroll", fix, { passive: true });
    return () => el.removeEventListener("scroll", fix);
  }, []);
  const sayRef = React.useRef(say); sayRef.current = say;
  const tell = (t, u) => sayRef.current && sayRef.current(t, u);
  const coverRef = React.useRef(onCover); coverRef.current = onCover;
  const sheetUp = menu || !!hold || !!moving || tpl;
  React.useEffect(() => { if (!open && coverRef.current) coverRef.current(sheetUp); }, [sheetUp, open]);

  const doc = open ? (open.ro ? open.doc : all.filter((d) => String(d.id) === String(open.id))[0]) : null;
  const docRef = React.useRef(null);
  if (doc) docRef.current = doc;
  const reading = !!open && !!docRef.current;

  const setSort = (key, dir) => {
    const v = { key: key, dir: dir || dcSortDefault(key) };
    setSortRaw(v);
    if (window.needtSync) window.needtSync.set(DC_SORT_KEY, v);
  };
  const openDoc = (id, auto) => {
    if (window.docs && window.docs.find && window.docs.find(id)) window.docs.patch(id, { viewed: "Just now" });
    else mbDocPatch(id, { viewed: "Just now" });
    setMenu(false); setHold(null);
    setOpen({ id: id, auto: !!auto, k: Date.now() });
  };
  const openShared = (d) => setOpen({ id: d.id, ro: true, doc: Object.assign({ body: [] }, d), k: Date.now() });
  const create = (title) => { const d = window.docs.create({ title: title || "" }); openDoc(d.id, true); };
  const fromTemplate = (t) => {
    setTpl(false);
    const d = window.docs.fromTemplate({ title: t.title, body: t.body, style: t.style });
    tell("Created from “" + t.title + "”", () => { if (readerRef.current) readerRef.current.back(); window.docs.remove(d.id); });
    openDoc(d.id, false);
  };
  /* a doc trashed elsewhere while open: back to the home */
  React.useEffect(() => { if (open && !open.ro && doc && doc.trashedAt && readerRef.current) readerRef.current.back(); }, [doc && doc.trashedAt]);

  const needle = q.trim().toLowerCase();
  const hit = (d) => !needle || String(d.title || "Untitled").toLowerCase().indexOf(needle) > -1
    || (d.body || []).some((b) => b[0] !== "image" && spansToText(Array.isArray(b[1]) && !DX_TEXT_KINDS[b[0]] ? "" : b[1]).toLowerCase().indexOf(needle) > -1);
  const mine = dcSortDocs(docs, sort.key, sort.dir).filter(hit);
  const theirs = shared.filter(hit);
  const shown = tab === "shared" ? theirs : mine;

  const sortItems = [{ head: "Sort by" }].concat(DC_SORTS.map(([id, l]) => {
    const on = sort.key === id;
    return { id: "sort-" + id, label: l, on: on, arrow: on ? (sort.dir === "asc" ? "arrow-up" : "arrow-down") : null, arrowLabel: on ? dcDirLabel(id, sort.dir) : null,
      onClick: () => { setSort(id, on ? (sort.dir === "asc" ? "desc" : "asc") : dcSortDefault(id)); setMenu(false); } };
  }));
  const pull = {
    search: (x) => docs.filter((d) => String(d.title || "Untitled").toLowerCase().indexOf(x.toLowerCase()) > -1).slice(0, 5)
      .map((d) => ({ id: d.id, title: d.title || "Untitled", meta: mbDocMeta(d) || null })),
    onPick: (h) => openDoc(h.id),
    onAdd: (x) => create(x),
    placeholder: "Search docs or start one…",
    hint: "Docs, by any word in their title. Enter starts a new one.",
    addLabel: (x) => (x ? "New doc “" + x + "”" : "New doc")
  };

  /* the long-press sheet */
  const h = hold;
  const holdRows = h ? [
    { id: "open", label: "Open", icon: "file-text", hue: "green", onClick: () => openDoc(h.id) },
    { id: "pin", label: h.isFavorite ? "Unpin" : "Pin", icon: "star", hue: "amber", onClick: () => { setHold(null); pdPatch(h.id, { isFavorite: !h.isFavorite }); tell(h.isFavorite ? "Unpinned" : "Pinned", () => pdPatch(h.id, { isFavorite: !!h.isFavorite })); } },
    { id: "dup", label: "Duplicate", icon: "duplicate", hue: "blue", onClick: () => { setHold(null); const c = window.docs.create({ title: (h.title || "Untitled") + " copy", body: JSON.parse(JSON.stringify(h.body || [])), style: h.style ? Object.assign({}, h.style) : null, coverUrl: h.coverUrl || null, projectId: h.projectId || null }); tell("Duplicated", () => window.docs.remove(c.id)); } },
    { id: "move", label: "Move to…", icon: "folder", hue: "violet", arrow: true, onClick: () => { setHold(null); setMoving(h); } },
    { id: "delete", label: "Delete", icon: "trash-2", hue: "red", tone: "alert", onClick: () => { setHold(null); pdPatch(h.id, { trashedAt: new Date().toISOString() }); tell("Moved to Trash", () => pdPatch(h.id, { trashedAt: null })); } }
  ] : [];
  const moveTo = (p) => {
    const d = moving; setMoving(null); if (!d) return;
    const before = d.projectId || null;
    if ((p.id || null) === before) return;
    pdPatch(d.id, { projectId: p.id || null });
    tell("Moved to " + p.name, () => pdPatch(d.id, { projectId: before }));
  };
  /* the phone's templates (Mobile.jsx MB_TEMPLATES): { title, meta, style, body } (or an old [title, meta, body]) */
  const tplList = (typeof MB_TEMPLATES !== "undefined" ? MB_TEMPLATES : []).map((t) => (Array.isArray(t) ? { id: t[0], title: t[0], meta: t[1], body: t[2], style: null } : t));

  return (
    <div ref={placeEl} className={pdCx("pd-place", reading && "is-reading")} data-pd-place="docs">
      <div ref={under} className="pd-under" aria-hidden={reading ? "true" : undefined}>
        <PkScreen screen="docs" title="Docs" glyph="docs" sub={docs.length ? docs.length + (docs.length === 1 ? " document" : " documents") + " · " + pdSortLine(sort) : null} onPull={pull}>
          <div className="pd-home">
            <label className="pd-qo" data-pd-quickopen="">
              <PdIcon name="search" size={18} />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quick Open" aria-label="Quick Open" enterKeyHint="go"
                onKeyDown={(e) => { if (e.key === "Enter" && shown.length) { e.preventDefault(); if (tab === "shared") openShared(shown[0]); else openDoc(shown[0].id); } else if (e.key === "Escape") setQ(""); }} />
              {q ? <button type="button" className="pd-qo-clear" aria-label="Clear" onClick={() => setQ("")}><PdIcon name="x" size={14} /></button> : null}
            </label>
            <div className="pd-tabs" role="tablist" aria-label="Which docs">
              {[["recent", "Recents"], ["shared", "Shared"]].map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={pdCx("pd-tab", tab === id && "is-on")} onClick={() => setTab(id)} data-pd-tab={id}>{label}</button>
              ))}
            </div>
            {tab === "recent" ? (
              <div className="pd-new">
                <PkButton kind="primary" small icon="plus" onClick={() => create("")} data-pd-new="">New doc</PkButton>
                <PkButton kind="quiet" small icon="layout-template" onClick={() => setTpl(true)} data-pd-new-tpl="">From template</PkButton>
              </div>
            ) : null}
            {shown.length ? (
              <div className="pd-grid" role="list">
                {shown.map((d) => <PdCard key={d.id} d={d} shared={tab === "shared"} onOpen={(x) => (tab === "shared" ? openShared(x) : openDoc(x.id))} onHold={tab === "shared" ? null : setHold} />)}
              </div>
            ) : (
              <div className="pd-empty">
                <PdGlyph place={tab === "shared" ? "shared" : "docs"} size="m" />
                <span className="pd-empty-title">{needle ? "Nothing matches" : tab === "shared" ? "Nothing shared yet" : "No documents yet"}</span>
                <span className="pd-empty-line">{needle ? "Try another word." : tab === "shared" ? "Pages others share with you show up here." : "Start one — pages you write on the desktop show up here too."}</span>
              </div>
            )}
          </div>
        </PkScreen>
        <div className="pd-bar is-list">
          <span />
          <PdGlass icon="ellipsis" label="Sort and more" onClick={() => setMenu(true)} data={{ "data-pd-more": "list" }} />
        </div>
        <span className="pd-shade" aria-hidden="true" />
      </div>
      {reading ? (
        <PdDocReader key={open.k} doc={docRef.current} readOnly={!!open.ro} autoEdit={open.auto} backLabel="Docs" under={under} enter={{ ref: readerRef }} say={say} onCover={onCover}
          onOpenDoc={(id) => openDoc(id)} onTrashed={() => { if (readerRef.current) readerRef.current.back(); }}
          onGone={() => { setOpen(null); docRef.current = null; }} />
      ) : null}
      <PdMenu open={menu && !reading} onClose={() => setMenu(false)} items={sortItems} label="Sort documents" />
      <PkSheet open={!!hold && !reading} onClose={() => setHold(null)} title={h ? h.title || "Untitled" : "Doc"} meta={h ? mbDocMeta(h) : null} label="Document actions">
        <PdRows rows={holdRows} label="Document actions" />
      </PkSheet>
      <PdMoveSheet doc={moving} open={!!moving && !reading} onClose={() => setMoving(null)} onPick={moveTo} />
      <PkSheet open={tpl && !reading} onClose={() => setTpl(false)} title="New from template" label="New from template">
        <PdRows label="Templates" rows={[{ id: "blank", label: "Blank page", meta: "Start from nothing", icon: "file-text", hue: "green", onClick: () => { setTpl(false); create(""); } }]
          .concat(tplList.map((t) => ({ id: "tpl-" + (t.id || t.title), label: t.title, meta: t.meta, lead: <PdGlyph kind="template" size={36} />, hue: "plain", onClick: () => fromTemplate(t) })))} />
      </PkSheet>
    </div>
  );
}

window.PkPlaces = window.PkPlaces || {};
window.PkPlaces.docs = PdDocs;
Object.assign(window, { PdDocs, PdDocReader, PdThumb });
