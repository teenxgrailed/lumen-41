const { NavRow, Switch, Checkbox, SidebarHint, IconButton, Icon, Menu, MenuItem, MenuLabel, MenuSeparator, Avatar } = window.NeedtDesignSystem_25d3c8;

/* Docs grid, the document editor, Share and the inspector. The seed pages,
   themes, styles and the miniature live in docs-kit.jsx (loaded first). */

function dcReadCover(file, done) {
  const r = new FileReader();
  r.onload = () => {
    const im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1600 / (im.naturalWidth || 1600));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      const x = c.getContext("2d"); x.fillStyle = cssVar("--color-white"); x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
      done(c.toDataURL("image/jpeg", 0.85));
    };
    im.src = r.result;
  };
  r.readAsDataURL(file);
}

/* The separator: under the title and for every divider block. */
function DcSep({ kind, style, className }) {
  const x = className ? " " + className : "";
  if (kind === "dots") return <div aria-hidden="true" className={"docs-sep-dots" + x} style={style}>{[0, 1, 2].map((i) => <span className="docs-dc-sep-1" key={i} />)}</div>;
  if (kind === "wave") return (
    <div aria-hidden="true" className={"docs-sep-wave" + x} style={style}>
      <svg width="120" height="12" viewBox="0 0 120 12" fill="none"><path d="M2 7.5c6-5 10-5 15-.6 5 4.4 9.6 4.2 15-.4 5.6-4.7 10-4.5 15.4.2 5.2 4.6 9.6 4.2 15-.4 5.5-4.6 10-4.3 15.2.3 5.2 4.6 9.5 4.1 15-.6 4.4-3.8 8-4 12.4-.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
    </div>);
  return <div aria-hidden="true" className={"docs-sep-line" + x} style={style} />;
}

/* A popover hung to the LEFT of the inspector, top-aligned with its trigger,
   kept inside the window. Portaled, so the panel's scroller never clips it. */
function DcPop({ trigger, width, children, label }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit(open, 130);
  const tRef = React.useRef(null), pRef = React.useRef(null);
  const [pos, setPos] = React.useState({ right: 0, top: 0 });
  const place = () => {
    const el = tRef.current; if (!el) return;
    const r = el.getBoundingClientRect(), side = el.closest("aside"), ar = side ? side.getBoundingClientRect() : r;
    setPos({ right: Math.max(8, window.innerWidth - ar.left + 12), top: r.top });
  };
  React.useLayoutEffect(() => {
    const p = pRef.current; if (!shown || !p) return;
    const h = p.offsetHeight, max = window.innerHeight - h - 12;
    if (pos.top > max) setPos((q) => Object.assign({}, q, { top: Math.max(12, max) }));
  }, [shown, pos.top]);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if ((pRef.current && pRef.current.contains(e.target)) || (tRef.current && tRef.current.contains(e.target))) return; setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc); window.addEventListener("resize", place);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); window.removeEventListener("resize", place); };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <>
      <span className="docs-dc-pop-1" ref={tRef} onClick={() => { if (!open) place(); setOpen(!open); }}>{typeof trigger === "function" ? trigger(open) : trigger}</span>
      {shown ? ReactDOM.createPortal(
        <div ref={pRef} role="dialog" aria-label={label} className={"docs-dc-pop-2 " + "nx-pop is-right" + (leaving ? " is-leaving" : "")}
          style={{ right: pos.right, top: pos.top, width: width }}>
          {typeof children === "function" ? children(close) : children}
        </div>, document.body) : null}
    </>
  );
}

/* A swatch split on the diagonal: the Light reading over the Dark one. */
function DcSplit({ l, d, size, round, inner }) {
  const s = size || 26;
  return (
    <span className="docs-dc-split-1" aria-hidden="true" style={{ width: s, height: s, borderRadius: round === false ? 7 : s, "--split-l": l, "--split-d": d }}>{inner}</span>
  );
}
/* A page in miniature on its backdrop: the style preview, the gallery tile,
   the card frame. Everything inside reads from the same vars as the page. */
function DcMiniPage({ s, title, h, pad, radius, lines, glyph }) {
  const f = dcFontOf(s.font);
  return (
    <span className="dt-themed docs-mini-page" style={Object.assign({ height: h || "100%", borderRadius: radius || 8, fontFamily: f.css }, dcVars(s))}>
      {s.cover ? <span className="docs-dc-mini-page-1"><DcCover cover={s.cover} /></span> : null}
      <span className="docs-dc-mini-page-2" style={{ padding: pad || 10 }}>
        <span className={"docs-dc-mini-page-3" + (glyph ? " is-glyph" : "")} style={{ "--mini-font": f.css }}>{glyph || title || "Untitled"}</span>
        {(lines || [86, 70, 78]).map((w, i) => <span className="docs-dc-mini-page-4" key={i} style={{ width: w + "%" }} />)}
      </span>
    </span>
  );
}
/* The backdrop as a surface: none falls back to the app's ground. */
function DcBackdrop({ id, style, className, children, frame }) {
  const none = id === "none";
  return (
    <span className={"dc-bd docs-bd" + (none ? " is-none" + (frame ? " is-frame" : "") : "") + (className ? " " + className : "")} style={none ? style : Object.assign({}, dcBdVars(id), style)}>{children}</span>
  );
}

/* Section label and row, Craft's inspector rhythm: small caps, 44px rows,
   hairlines between. Shared by all four tabs. */
function DcLabel({ children, action, first }) {
  return (
    <div className={"docs-dc-label-1 docs-dc-label-s1" + (first ? " is-on" : "")}>
      {children}{action ? <span className="docs-dc-label-2">{action}</span> : null}
    </div>
  );
}
function DcRow({ label, children, onClick, last, row, sub, badge }) {
  return (
    <div data-dc-row={row} onClick={onClick} className={"docs-dc-row-1 " + "dc-row is-press" + (last ? "" : " dc-hair")}>
      <span className="docs-dc-row-2">
        <span className="docs-dc-row-3">{label}{badge || null}</span>
        {sub ? <span className="docs-dc-row-4">{sub}</span> : null}
      </span>
      <span className="docs-dc-row-5">{children}</span>
    </div>
  );
}
/* Segmented control: equal cells on a recessed track, the chosen one raised. */
function DcSeg({ items, value, onChange, tall, attr }) {
  return (
    <div className="docs-dc-seg-1" role="radiogroup">
      {items.map(([id, content, title]) => {
        const on = value === id;
        return (
          <button key={id} type="button" role="radio" aria-checked={on} title={title} {...(attr ? { [attr]: id } : {})} onClick={() => onChange(id)}
            className={"docs-seg-cell" + (tall ? " is-tall" : "")}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

/* The gallery of complete styles: large tiles, a click applies, Undo in the toast. */
function DcGallery({ doc, s, close }) {
  const cur = dcPresetOf(s);
  const apply = (p) => {
    const before = doc.style ? Object.assign({}, doc.style) : null, beforeTheme = dcStyleField(doc).theme;
    const next = Object.assign({}, s, p.style);
    delete next.cover;
    const theme = p.id === "sparkles" || p.id === "mist" ? beforeTheme : p.id;
    if (theme) next.theme = theme;
    if (dcStyleField(doc).ground) next.ground = dcStyleField(doc).ground;
    window.docs.patch(doc.id, { style: next });
    close();
    window.toast("Style: " + p.name, { undo: () => window.docs.patch(doc.id, { style: before }) });
  };
  return (
    <div className="docs-dc-gallery-1">
      <div className="docs-dc-gallery-2">
        <span className="docs-dc-gallery-3">All Styles</span>
        <span className="docs-dc-row-4">Backdrop, page, text and font together</span>
      </div>
      <div className="scroll-inner docs-dc-gallery-4">
        {DC_PRESETS.map((p) => {
          const ps = Object.assign({}, DC_DEFAULT, p.style);
          const on = cur && cur.id === p.id;
          return (
            <button key={p.id} type="button" data-dc-preset={p.id} aria-pressed={on} onClick={() => apply(p)} className={"dc-tile docs-dc-gallery-5 docs-dc-gallery-s1" + (on ? " is-on" : "")}>
              <DcBackdrop id={ps.backdrop} frame className={"docs-gallery-frame" + (on ? " is-on" : "")}>
                <span className="docs-dc-gallery-6"><DcMiniPage s={ps} title={p.name} radius={8} pad={10} /></span>
              </DcBackdrop>
              <span className="docs-dc-gallery-7">{p.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DcSwatchGrid({ children, cols }) {
  return <div className="docs-dc-swatch-grid-1" style={{ gridTemplateColumns: "repeat(" + (cols || 5) + ", minmax(0, 1fr))" }}>{children}</div>;
}

/* Style tab. */
/* Pro (08.10.26, paywall.jsx): Document themes — All Styles and Backdrop —
   are Pro. Free: the button and the row wear a locked PRO pill and open the
   paywall on "Document themes"; colour, text, cover, separator and font stay
   free. Pro/trial: the same controls with a small PRO pill. */
const DC_PRO_FEATURE = "Document themes";
function DcProPill({ pro }) { return window.ProBadge ? <window.ProBadge size="sm" locked={!pro} /> : null; }
function DcStylePanel() {
  const doc = window.useOpenDoc();
  const pro = window.useNeedtPro ? window.useNeedtPro() : true;
  const toPaywall = () => window.openPaywall && window.openPaywall(DC_PRO_FEATURE);
  if (!doc) return null;
  const s = dcStyleOf(doc);
  const set = (p) => dcSetStyle(doc, p);
  const pg = dcPageOf(s.page);
  const txt = DC_TEXTS.find((t) => t.id === s.text) || DC_TEXTS[0];
  const bdName = (DC_BACKDROPS.find((b) => b.id === s.backdrop) || DC_BACKDROPS[0]).name;
  const preset = dcPresetOf(s);
  const onFile = (fs) => { const f = fs && fs[0]; if (!f) return; const before = s.cover; dcReadCover(f, (url) => { dcSetStyle(window.docs.find(doc.id) || doc, { cover: url }); window.toast("Cover added", { undo: () => dcSetStyle(window.docs.find(doc.id) || doc, { cover: before }) }); }); };
  return (
    <div className="docs-dc-style-panel-1" data-dc-style="">
      <DcLabel first>Style</DcLabel>
      <DcBackdrop id={s.backdrop} frame className="docs-style-preview">
        <span className={"docs-dc-style-panel-2 docs-dc-style-panel-s1" + (s.wide ? " is-on" : "")}>
          <DcMiniPage s={s} title={doc.title} radius={10} pad={12} lines={[92, 74, 84, 60]} />
        </span>
      </DcBackdrop>
      <div className="docs-dc-style-panel-3">
        {pro ? (
          <DcPop width={460} label="All Styles" trigger={(open) => (
            <button type="button" data-dc-allstyles="" aria-expanded={open} className="nx-btn nx-btn-secondary docs-dc-style-panel-4">
              <Icon name="layers" size={15} />All Styles<DcProPill pro />{preset ? <span className="docs-dc-style-panel-5">{preset.name}</span> : null}
            </button>)}>
            {(close) => <DcGallery doc={doc} s={s} close={close} />}
          </DcPop>
        ) : (
          <button type="button" data-dc-allstyles="locked" className="nx-btn nx-btn-secondary docs-dc-style-panel-4" onClick={toPaywall} title="Unlock Document themes with Pro">
            <Icon name="layers" size={15} />All Styles<DcProPill pro={false} /><span className="docs-dc-style-panel-5">Themes</span>
          </button>
        )}
      </div>

      <DcLabel>Color</DcLabel>
      {!pro ? (
        <DcRow label="Backdrop" row="backdrop" sub={s.backdrop === "none" ? "Themes with Pro" : bdName + " · change with Pro"} onClick={toPaywall} badge={<DcProPill pro={false} />}>
          <DcBackdrop id={s.backdrop} frame className="docs-bd-chip">{s.backdrop === "none" ? <span className="docs-dc-style-panel-6" /> : null}</DcBackdrop>
        </DcRow>
      ) : null}
      {pro ? <DcPop width={272} label="Backdrop" trigger={
        <DcRow label="Backdrop" row="backdrop" sub={bdName} badge={<DcProPill pro />}>
          <DcBackdrop id={s.backdrop} frame className="docs-bd-chip">
            {s.backdrop === "none" ? <span className="docs-dc-style-panel-6" /> : null}
          </DcBackdrop>
        </DcRow>}>
        {(close) => (
          <div className="docs-dc-gallery-1">
            <span className="docs-dc-style-panel-7">Backdrop</span>
            <div className="docs-dc-style-panel-8">
              {DC_BACKDROPS.map((b) => (
                <button key={b.id} type="button" data-dc-swatch={b.id} aria-pressed={s.backdrop === b.id} onClick={() => set({ backdrop: b.id })} className="docs-swatch-btn">
                  <DcBackdrop id={b.id} frame className={"docs-bd-swatch" + (s.backdrop === b.id ? " is-on" : "")}>
                    {b.id === "none" ? <span className="docs-dc-style-panel-6" /> : null}
                  </DcBackdrop>
                  {b.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </DcPop> : null}
      <DcPop width={252} label="Document color" trigger={
        <DcRow label="Document Color" row="page" sub={pg.name}><DcSplit l={pg.L} d={pg.D} size={28} /></DcRow>}>
        {() => (
          <div className="docs-dc-style-panel-9">
            <span className="docs-dc-style-panel-7">Document Color</span>
            <DcSwatchGrid cols={5}>
              {DC_PAGES.map((p) => (
                <button className="docs-dc-style-panel-10" key={p.id} type="button" data-dc-swatch={p.id} title={p.name} aria-label={p.name} aria-pressed={s.page === p.id} onClick={() => set({ page: p.id })}>
                  <DcSplit l={p.L} d={p.D} size={32} />
                </button>
              ))}
            </DcSwatchGrid>
            <span className="docs-dc-style-panel-11">Each colour has a Light and a Dark reading.</span>
          </div>
        )}
      </DcPop>
      <DcPop width={252} label="Text color" trigger={
        <DcRow label="Text Color" row="text" sub={txt.name + (s.text === "auto" ? " · by page" : "")} last>
          <DcSplit l={pg.L} d={pg.D} size={28} inner={<span className="docs-dc-style-panel-12">
            <span className="docs-dc-style-panel-13" style={{ "--ink": dcInkFor(pg.L, s.text) }}>A</span><span className="docs-dc-style-panel-14" style={{ "--ink": dcInkFor(pg.D, s.text) }}>a</span></span>} />
        </DcRow>}>
        {() => (
          <div className="docs-dc-style-panel-9">
            <span className="docs-dc-style-panel-7">Text Color</span>
            <DcSwatchGrid cols={4}>
              {DC_TEXTS.map((t) => (
                <button key={t.id} type="button" data-dc-swatch={"text-" + t.id} aria-pressed={s.text === t.id} onClick={() => set({ text: t.id })} className="docs-swatch-btn">
                  <span className="docs-dc-style-panel-15">
                    <DcSplit l={pg.L} d={pg.D} size={34} inner={<span className="docs-dc-style-panel-16">
                      <span className="docs-dc-style-panel-17" style={{ "--ink": dcInkFor(pg.L, t.id) }}>A</span><span className="docs-dc-style-panel-18" style={{ "--ink": dcInkFor(pg.D, t.id) }}>a</span></span>} />
                  </span>
                  {t.name}
                </button>
              ))}
            </DcSwatchGrid>
            <span className="docs-dc-style-panel-19">Auto picks dark or light ink for the page, so text always reads.</span>
          </div>
        )}
      </DcPop>

      <DcLabel>Cover</DcLabel>
      <DcPop width={272} label="Cover image" trigger={
        <DcRow label="Cover Image" row="cover" sub={s.cover ? (/^data:/.test(s.cover) ? "Your picture" : "Drawn") : "None"} last>
          {s.cover ? <span className="docs-dc-style-panel-21"><DcCover cover={s.cover} /></span>
            : <span className="nx-btn nx-btn-secondary nx-btn-sm docs-dc-style-panel-22"><Icon name="plus" size={15} /></span>}
        </DcRow>}>
        {(close) => (
          <div className="docs-dc-gallery-1">
            <span className="docs-dc-style-panel-7">Cover Image</span>
            <button type="button" className="nx-btn nx-btn-secondary" data-dc-cover-upload="" onClick={() => { close(); window.needtPlatform.pickFile({ accept: "image/*" }).then(onFile); }}><Icon name="upload" size={15} />Upload a picture</button>
            <div className="docs-dc-style-panel-23">
              {DC_COVER_ARTS.map((a) => (
                <button className={"docs-dc-style-panel-24" + (s.cover === "art:" + a ? " is-on" : "")} key={a} type="button" data-dc-cover-art={a} onClick={() => set({ cover: "art:" + a })}>
                  <DcCover cover={"art:" + a} />
                </button>
              ))}
            </div>
            {s.cover ? <button type="button" className="nx-btn nx-btn-text" onClick={() => { set({ cover: null }); close(); }}>Remove cover</button> : null}
          </div>
        )}
      </DcPop>

      <DcLabel>Separator Style</DcLabel>
      <DcSeg value={s.separator} onChange={(v) => set({ separator: v })} attr="data-dc-sep" items={[
        ["line", <span className="docs-dc-style-panel-25" />, "Line"],
        ["dots", <span className="docs-dc-style-panel-26">{[0, 1, 2].map((i) => <span className="docs-dc-style-panel-27" key={i} />)}</span>, "Dots"],
        ["wave", <svg width="34" height="10" viewBox="0 0 34 10" fill="none"><path d="M1 6c3-3.5 5.5-3.5 8-.5s5 3 8 0 5.5-3.3 8 0 4.6 3 8-.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>, "Hand-drawn"]
      ]} />

      <DcLabel>Font</DcLabel>
      <DcSeg tall value={s.font} onChange={(v) => { dcLoadFonts(); set({ font: v }); }} attr="data-dc-font" items={DC_FONTS.map((f) => [f.id,
        <><span className={"docs-font-glyph" + (f.id === "mono" ? " is-mono" : "")} style={{ "--glyph-font": f.css }}>{f.glyph}</span><span className="docs-dc-style-panel-28">{f.name}</span></>, f.name])} />

      <DcLabel>Advanced</DcLabel>
      <DcRow label="Wide Page" row="wide" last>
        <span className="docs-dc-style-panel-29" data-dc-wide=""><Switch checked={!!s.wide} onChange={(v) => set({ wide: !!v })} /></span>
      </DcRow>
    </div>
  );
}


/* The folder line on a card: the doc's project by id, or the label a
   template / shared card carries in its place. */
const dcProjectLabel = (doc) => (doc && ((doc.projectId && window.NEEDT.project(doc.projectId) && window.NEEDT.project(doc.projectId).name) || doc.label)) || null;
function DocMeta({ doc }) {
  return (
    <div className="docs-doc-meta-1">
      {dcProjectLabel(doc) ? <><Icon name="folder" size={14} /><span className="docs-doc-meta-2">{dcProjectLabel(doc)}</span><span className="docs-doc-meta-3">•</span></> : null}
      <span className="docs-doc-meta-4">{doc.meta || "Updated " + doc.updated}</span>
    </div>
  );
}

/* Craft's card: the document's backdrop is the frame, its page sits inside
   in its own colour (cover strip on top when it has one) and runs off the
   bottom edge, so the card reads as the top of the real page. */
function DocCard({ doc, onOpen, masonry }) {
  const s = dcStyleOf(doc);
  const bd = s.backdrop !== "none";
  const f = dcFontOf(s.font);
  return (
      <div onClick={onOpen} data-ctx="doc" data-ctx-id={doc.id} className={"docs-card" + (bd ? " dc-bd is-on" : "") + (masonry ? " is-masonry" : "")}
        style={bd ? dcBdVars(s.backdrop) : undefined}>
        <div className={"dt-themed docs-card-page" + (bd ? " is-on" : "")} style={dcVars(s)}>
          {s.cover ? <div className="docs-doc-card-1"><DcCover cover={s.cover} /></div> : null}
          <div className={"docs-doc-card-2 docs-doc-card-s1" + (bd ? " is-on" : "")}>
          <div className="docs-doc-card-3">
            <div className="docs-doc-card-4">
              <span className={"docs-doc-card-5 docs-card-title" + (doc.title ? "" : " is-untitled")} style={{ fontFamily: f.css }} title={doc.title || undefined}>{doc.title || "Untitled Document"}</span>
              <span className={"docs-doc-card-6" + (doc.isFavorite ? " is-on" : "")} onClick={(e) => { e.stopPropagation(); if (window.docs && window.docs.find(doc.id)) window.docs.star(doc.id); }}><IconButton label={doc.isFavorite ? "Unpin" : "Pin"} variant="ghost"><Icon name="star" size={14} /></IconButton></span>
            </div>
            <DocMeta doc={doc} />
          </div>
          <div className={"docs-doc-card-7 docs-doc-card-s2" + (masonry ? " is-on" : "")}>
            <DocMiniature doc={doc} />
          </div>
          </div>
        </div>
      </div>
      );
}

/* Sorting: dcAge / DC_SORTS / dcSortDocs / dcReadSort live in doc-style.jsx
   (one copy for the desktop grid and the phone's Docs). */
/* Sort rows for a Craft-style ⋯ menu: a check on the active key, and an
   arrow on that row that flips the direction when the row is clicked again.
   The menu stays open so the grid can be seen re-ordering behind it. */
function SortMenuItems({ sorts, value, onChange }) {
  return (
    <>
      <MenuLabel>Sort by</MenuLabel>
      {sorts.map(([id, l]) => {
        const on = value.key === id;
        return (
          <MenuItem key={id} icon={on ? <Icon name="check" size={14} /> : <span className="docs-docs-screen-5" />}
            shortcut={on ? <span className="docs-sort-arrow" aria-label={dcDirLabel(id, value.dir)}><Icon name={value.dir === "asc" ? "arrow-up" : "arrow-down"} size={13} /></span> : undefined}
            onClick={(e) => { e.stopPropagation(); onChange(id, on ? (value.dir === "asc" ? "desc" : "asc") : dcSortDefault(id)); }}>{l}</MenuItem>
        );
      })}
    </>
  );
}
/* The whole library as one Markdown file. */
function dcToMarkdown(list) {
  const line = (b) => {
    const k = b[0], t = DX_TEXT_KINDS[k] ? spansToMarkdown(dxMigrateBlock(b)[1]) : typeof b[1] === "string" ? b[1] : "";
    if (k === "h") return "## " + t;
    if (k === "li") return "- " + t;
    if (k === "todo") return (b[2] ? "- [x] " : "- [ ] ") + t;
    if (k === "task") return "- [ ] " + t;
    if (k === "quote" || k === "callout") return "> " + t;
    if (k === "code") return "```\n" + t + "\n```";
    if (k === "rule") return "---";
    if (k === "cards") return (b[1] || []).map((x) => "- " + x).join("\n");
    if (k === "table") return (b[1] || []).map((r, i) => "| " + r.join(" | ") + " |" + (i === 0 ? "\n|" + r.map(() => " --- |").join("") : "")).join("\n");
    return t;
  };
  return list.map((d) => "# " + (d.title || "Untitled") + "\n\n" + (d.body || []).map(line).filter(Boolean).join("\n\n")).join("\n\n---\n\n") + "\n";
}
function dcDownload(name, text, type) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: type }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {}
}

function DocList({ docs, onOpen, sort, dir, onSort }) {
  const cols = "minmax(0, 1fr) 120px 120px 100px";
  const head = (key, label) => {
    const on = sort === key;
    return (
      <button type="button" className={"docs-list-head is-btn" + (on ? " is-sorted" : "")} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
        onClick={() => onSort && onSort(key, on ? (dir === "asc" ? "desc" : "asc") : dcSortDefault(key))}>
        {label}{on ? <Icon name={dir === "asc" ? "arrow-up" : "arrow-down"} size={12} /> : null}
      </button>
    );
  };
  return (
    <div className="docs-dc-style-panel-1">
      <div className="docs-doc-list-1" style={{ gridTemplateColumns: cols }}>
        {head("name", "Name")}
        {head("viewed", "Last viewed")}
        {head("updated", "Updated")}
        {head("created", "Created")}
      </div>
      {docs.map((d) => (
        <div key={d.id} onClick={() => onOpen && onOpen(d.id)} className="nav-row docs-doc-list-2" data-ctx="doc" data-ctx-id={d.id}
          style={{ gridTemplateColumns: cols }}>
          <span className="docs-doc-list-3">
            <DocThumb doc={d} w={30} h={38} />
            <span className="docs-doc-list-4">
              <span className={"docs-doc-list-5 docs-doc-list-s1" + (d.title ? " is-on" : "")} title={d.title || undefined}>{d.title || "Untitled"}</span>
              <span className="docs-doc-list-6">{d.body.length ? docText(d) : "Empty document"}</span>
            </span>
          </span>
          <span className="docs-dc-row-4">{d.viewed}</span>
          <span className="docs-dc-row-4">{d.updated}</span>
          <span className="docs-dc-row-4">{d.created}</span>
        </div>
      ))}
    </div>
  );
}

/* A menu hung under its trigger, closed by a click anywhere else. */
function DropMenu({ trigger, width, align, children }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit(open, 130);
  const wrap = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className="docs-drop-menu-1" ref={wrap}>
      <span className="docs-drop-menu-2" onClick={() => setOpen(!open)}>{trigger}</span>
      {shown ? <div className={"nx-pop docs-drop-pop" + (align === "right" ? " is-right" : "") + (leaving ? " is-leaving" : "")} onClick={() => setOpen(false)}><Menu width={width}>{children}</Menu></div> : null}
    </span>
  );
}

/* A round icon button (36, per the scale) on the secondary look. */
const ROUND_CLS = "nx-btn nx-btn-secondary";

function DocsScreen({ onOpenDoc }) {
  const [view, setView] = React.useState("grid");
  const [sortState, setSortState] = React.useState(dcReadSort);
  React.useEffect(() => (window.needtSync ? window.needtSync.subscribe(DC_SORT_KEY, (v, info) => { if (info.origin !== "local") setSortState(dcReadSort()); }) : undefined), []);
  const [daily, setDaily] = React.useState(true);
  const all = window.useDocs();
  const mine = all.filter((d) => !d.trashedAt);
  const shown = dcSortDocs(mine, sortState.key, sortState.dir);
  const setSort = (key, dir) => {
    const v = { key: key, dir: dir || dcSortDefault(key) };
    setSortState(v);
    if (window.needtSync) window.needtSync.set(DC_SORT_KEY, v);
  };
  const views = [["grid", "layout-template", "Grid"], ["masonry", "layers", "Cards by length"], ["list", "list", "List"]];
  const say = (m) => window.toast && window.toast(m);
  // Every way in names the page it opens; the screen then shows that page.
  const open = (id) => { if (window.docs && window.docs.open) window.docs.open(id); else if (onOpenDoc) onOpenDoc(id); };
  return (
    <>
      {/* Craft's header: [+] title … view switcher and a ⋯ menu. Search lives
          in the top bar (⌘K), so the grid has no field of its own. */}
      <header className="docs-docs-screen-1">
        <window.PageAddButton label="New document" width={312} items={[
            { art: "doc", title: "New Doc", sub: "Start something new", kbd: "⌘N", onClick: () => window.docs.newDoc() },
            { art: "folder", title: "New Folder", sub: "Keep things tidy" },
            { art: "template", title: "From Template", sub: "Save time with templates" }
          ]} />
        <h1 className="docs-docs-screen-2">Documents</h1>
        <span className="docs-docs-screen-3">
          {views.map(([id, icon, label]) => (
            <button className={"docs-docs-screen-4 docs-docs-screen-s1" + (view === id ? " is-on" : "")} key={id} type="button" aria-label={label} title={label} aria-pressed={view === id} onClick={() => setView(id)}>
              <Icon name={icon} size={16} />
            </button>
          ))}
        </span>
        <DropMenu width={232} align="right" trigger={<button type="button" aria-label="More" data-docs-more="" className={ROUND_CLS + " docs-raised-round"}><Icon name="ellipsis" size={18} /></button>}>
          <MenuItem icon={<Icon name="circle-check" size={14} />} onClick={() => say("Multi-select is coming soon")}>Select</MenuItem>
          <MenuSeparator />
          <SortMenuItems sorts={DC_SORTS} value={sortState} onChange={setSort} />
          <MenuSeparator />
          <MenuItem icon={<Icon name="calendar-days" size={14} />} shortcut={daily ? <span className="docs-sort-arrow"><Icon name="check" size={14} /></span> : undefined} onClick={(e) => { e.stopPropagation(); setDaily(!daily); }}>Show daily notes</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icon name="upload" size={14} />} onClick={() => window.needtImport && window.needtImport("markdown")}>Import</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icon name="file-text" size={14} />} onClick={() => { dcDownload("Needt documents.md", dcToMarkdown(shown), "text/markdown"); say("Exported " + shown.length + (shown.length === 1 ? " document" : " documents") + " as Markdown"); }}>Export as Markdown</MenuItem>
          <MenuItem icon={<Icon name="download" size={14} />} onClick={() => say("PDF export is on its way")}>Export as PDF</MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Icon name="sliders-horizontal" size={14} />} onClick={() => window.__app && window.__app.setScreen && window.__app.setScreen("settings")}>Settings</MenuItem>
        </DropMenu>
      </header>
      <div className="scroll-inner docs-docs-screen-6">
        {mine.length === 0 ? (
          <div className="docs-docs-screen-7" data-docs-empty="">
            <window.Art name="doc" size={56} />
            <span className="docs-docs-screen-8">No documents yet. Start one and it shows up here.</span>
            <button type="button" className="nx-btn nx-btn-primary" onClick={() => window.docs.newDoc()}><Icon name="plus" size={15} />New doc</button>
          </div>
        ) : view === "list" ? <DocList docs={shown} onOpen={open} sort={sortState.key} dir={sortState.dir} onSort={setSort} />
          : view === "masonry" ? (
            <div className="dc-masonry docs-docs-screen-9">{shown.map((d) => <DocCard key={d.id} doc={d} onOpen={() => open(d.id)} masonry />)}</div>
          ) : (
            <div className="dc-grid docs-docs-screen-10">
              {shown.map((d, i) => <div key={d.id} className="nx-swap" style={{ animationDelay: Math.min(i * 30, 240) + "ms" }}><DocCard doc={d} onOpen={() => open(d.id)} /></div>)}
            </div>
          )}
      </div>
    </>
  );
}

/* ---------- the document ---------- */

/* The outline is the page's own headings, under its title. */
const outlineOf = (doc) => doc ? [[doc.title || "Untitled", 0]].concat((doc.body || []).filter((b) => b[0] === "h" && dxText(b)).map((b) => [dxText(b), 1])) : [];
/* One list feeds both the inspector's Insert tab and the "/" menu, so the two
   never disagree. Row: [icon, label, block kind, Craft-style shortcut, art]. */
const BLOCKS = [
  ["", [["type", "Text", "p", ""], ["heading", "Heading", "h", "#"], ["list", "Bullet list", "li", "-"], ["list-checks", "Checklist", "todo", "[]"],
    ["quote", "Quote", "quote", ">"], ["alert-circle", "Callout", "callout", "!"], ["minus", "Divider", "rule", "---"], ["code", "Code block", "code", "```"],
    ["file-text", "Page", "page", "[[", "page"], ["layout-template", "Card", "card", "", "doc"], ["paperclip", "File", "file", ""], ["image", "Image", "image", ""]]],
  ["From Needt", [["circle-check", "Task", "task", "@", "task"], ["calendar-days", "Event", "event", "", "event"], ["flame", "Habit", "habit", "", "habit"], ["message-square", "Ask Needt", "ask", "?"]]],
  ["Collections", [["table", "Table", "table", "||", "sheet"], ["layers", "Gallery", "gallery", "", "stack"], ["folder-kanban", "Board", "board", "", "folder"]]]
];

function PanelHead({ title, children }) {
  return (
    <div className="docs-panel-head-1">
      <span className="docs-dc-row-4">{title}</span>
      <span className="docs-panel-head-2">{children}</span>
    </div>
  );
}

function PanelOutline({ doc, at, onAt }) {
  const rows = outlineOf(doc);
  const go = (i) => {
    onAt(i);
    const page = document.querySelector("[data-doc-page]");
    const el = page && (i === 0 ? page.querySelector("h1") : page.querySelectorAll("article h2")[i - 1]);
    if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return (
    <>
      <PanelHead title="Contents" />
      {rows.map(([t, lvl], i) => <NavRow key={i} label={t} active={at === i} onClick={() => go(i)} style={{ paddingLeft: 8 + lvl * 14 }} />)}
      {rows.length < 2 ? <SidebarHint>Headings on the page show up here.</SidebarHint> : null}
    </>
  );
}

const DOC_TASKS = [
  { id: 1, title: "Ship the sidebar", where: ["Scope"], hue: "var(--success)", when: "Fri", done: false },
  { id: 2, title: "Write the Mailbox brief", where: ["Scope", "What ships"], hue: "var(--info)", when: "Thu", done: false },
  { id: 3, title: "Decide the onboarding door", where: ["Open questions"], hue: "var(--info)", when: null, done: true }
];

/* The tasks this page holds are the same tasks Workspace and Today hold:
   ticking one here ticks it everywhere. Grouped by the heading they sit under,
   so the panel doubles as a map of where the work is in the text. */
function PanelTasks() {
  const [tasks, setTasks] = React.useState(DOC_TASKS);
  const [showDone, setShowDone] = React.useState(false);
  const shown = tasks.filter((t) => showDone || !t.done);
  return (
    <>
      <PanelHead title="Tasks">
        <DropMenu width={220} align="right" trigger={<IconButton label="Task options" variant="ghost"><Icon name="ellipsis" size={14} /></IconButton>}>
          <MenuItem icon={showDone ? <Icon name="check" size={14} /> : <span className="docs-docs-screen-5" />} onClick={() => setShowDone(!showDone)}>Show completed</MenuItem>
          <MenuItem icon={<Icon name="folder-kanban" size={14} />}>Open in Workspace</MenuItem>
        </DropMenu>
      </PanelHead>
      {shown.length === 0 ? <SidebarHint>No open tasks on this page. Type [] in the text to add one.</SidebarHint> : null}
      {shown.map((t) => (
        <div key={t.id} className="nav-row docs-panel-tasks-1">
          <span className="docs-panel-tasks-2" onClick={() => setTasks((l) => l.map((x) => x.id === t.id ? Object.assign({}, x, { done: !x.done }) : x))}>
            <Checkbox checked={t.done} onChange={() => {}} />
          </span>
          <span className="docs-doc-list-4">
            <span className={"docs-panel-tasks-3 docs-panel-tasks-s1" + (t.done ? " is-on" : "")}>{t.title}</span>
            <span className="docs-panel-tasks-4">
              <span className="docs-panel-tasks-5" style={{ "--hue": t.hue }} />
              {t.where.join(" › ")}{t.when ? " · " + t.when : ""}
            </span>
          </span>
        </div>
      ))}
    </>
  );
}

function PanelFiles() {
  return (
    <>
      <PanelHead title="Attachments">
        <IconButton label="Add a file" variant="ghost"><Icon name="plus" size={14} /></IconButton>
      </PanelHead>
      <span className="docs-panel-files-1">Media</span>
      <div className="docs-panel-files-2">
        <span className="docs-files-thumb"><Icon name="image" size={18} /></span>
        <span className="docs-files-thumb"><Icon name="image" size={18} /></span>
      </div>
      <span className="docs-panel-files-3">Files</span>
      {[["sidebar-spec.pdf", "PDF · 240 KB"], ["prices-2026.csv", "CSV · 4 KB"]].map(([n, m]) => (
        <div key={n} className="nav-row docs-panel-files-4">
          <span className="docs-panel-files-5"><Icon name="paperclip" size={12} /></span>
          <span className="docs-panel-files-6">
            <span className="docs-panel-files-7">{n}</span>
            <span className="docs-dc-row-4">{m}</span>
          </span>
        </div>
      ))}
    </>
  );
}

/* Find counts in the page itself; replace is the same panel with a second
   field, not a second dialog. */
function PanelFind() {
  const [mode, setMode] = React.useState("find");
  const [q, setQ] = React.useState("");
  const [r, setR] = React.useState("");
  const [cased, setCased] = React.useState(false);
  const [i, setI] = React.useState(0);
  const text = (typeof document !== "undefined" && document.querySelector("article")) ? document.querySelector("article").innerText : "";
  const n = q ? (cased ? text : text.toLowerCase()).split(cased ? q : q.toLowerCase()).length - 1 : 0;
  return (
    <>
      <div className="docs-panel-find-1">
        <DropMenu width={200} trigger={<button type="button" className="nav-row docs-panel-find-2">{mode === "find" ? "Find" : "Find and replace"}<Icon name="chevron-down" size={12} /></button>}>
          <MenuItem icon={mode === "find" ? <Icon name="check" size={14} /> : <span className="docs-docs-screen-5" />} onClick={() => setMode("find")}>Find</MenuItem>
          <MenuItem icon={mode === "replace" ? <Icon name="check" size={14} /> : <span className="docs-docs-screen-5" />} onClick={() => setMode("replace")}>Find and replace</MenuItem>
        </DropMenu>
        <span className="docs-panel-find-3">
          <DropMenu width={200} align="right" trigger={<IconButton label="Find options" variant="ghost"><Icon name="sliders-horizontal" size={14} /></IconButton>}>
            <MenuItem icon={cased ? <Icon name="check" size={14} /> : <span className="docs-docs-screen-5" />} onClick={() => setCased(!cased)}>Match case</MenuItem>
            <MenuItem icon={<span className="docs-docs-screen-5" />}>Search all documents</MenuItem>
          </DropMenu>
        </span>
      </div>
      <div className="docs-panel-find-4">
        <span className="docs-panel-find-5">
          <span className="docs-panel-find-6"><Icon name="search" size={14} /></span>
          <input value={q} onChange={(e) => { setQ(e.target.value); setI(0); }} placeholder="Find on this page" className="docs-find-input" />
        </span>
        {mode === "replace" ? <>
          <span className="docs-panel-find-5">
            <span className="docs-panel-find-6"><Icon name="repeat" size={14} /></span>
            <input value={r} onChange={(e) => setR(e.target.value)} placeholder="Replace with" className="docs-find-input" />
          </span>
          <span className="docs-panel-find-7">
            <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" disabled={!n}>Replace</button>
            <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" disabled={!n}>Replace all</button>
          </span>
        </> : null}
        <div className="docs-panel-find-8">
          <span className="docs-panel-find-9">{!q ? "Type to search" : n ? (Math.min(i, n - 1) + 1) + " of " + n : "No results"}</span>
          <span className="docs-panel-find-10">
            <IconButton label="Previous" variant="ghost" disabled={!n} onClick={() => setI((i - 1 + n) % n)}><Icon name="arrow-up" size={14} /></IconButton>
            <IconButton label="Next" variant="ghost" disabled={!n} onClick={() => setI((i + 1) % n)}><Icon name="arrow-down" size={14} /></IconButton>
          </span>
        </div>
      </div>
    </>
  );
}

/* Opening a document trades the app's places for the document's own: the
   rail becomes its control panel — what it is, what is in it, how to move
   through it. The folder button at the foot hands the rail back. */
function DocPanel({ onBack }) {
  const [tab, setTab] = React.useState("outline");
  const [at, setAt] = React.useState(0);
  const doc = window.useOpenDoc();
  React.useEffect(() => setAt(0), [doc && doc.id]);
  return (
    <aside className="docs-doc-panel-1">
      <div className="docs-doc-panel-2">
        <IconButton label="Back to Documents" variant="ghost" onClick={onBack}><Icon name="arrow-left" size={16} /></IconButton>
        <IconButton label="Hide panel" variant="ghost"><Icon name="layout-template" size={16} /></IconButton>
      </div>
      <div className="docs-doc-panel-3">
        {doc ? <DocThumb doc={doc} w={30} h={36} /> : null}
        <span className="docs-doc-list-4">
          <span className={"docs-doc-list-5 docs-doc-panel-s1" + (doc && doc.title ? " is-on" : "")}>{(doc && doc.title) || "Untitled"}</span>
          <span className="docs-dc-row-4">{doc ? "Updated " + (doc.updated || "just now").replace(/^Just now$/, "just now") : ""}</span>
        </span>
      </div>
      <span className="docs-doc-panel-4">
        {[["outline", "list", "Contents"], ["tasks", "circle-check", "Tasks in this document"], ["files", "paperclip", "Files"], ["find", "search", "Find in document"]].map(([id, icon, label]) => (
          <button className={"docs-doc-panel-5 docs-doc-panel-s2" + (tab === id ? " is-on" : "")} key={id} type="button" aria-label={label} title={label} onClick={() => setTab(id)}>
            <Icon name={icon} size={16} />
          </button>
        ))}
      </span>
      <div className="scroll-inner docs-doc-panel-6">
        {tab === "outline" ? <PanelOutline doc={doc} at={at} onAt={setAt} />
          : tab === "tasks" ? <PanelTasks />
          : tab === "files" ? <PanelFiles />
          : <PanelFind />}
      </div>
      {window.SidebarSwitcher ? <window.SidebarSwitcher value="doc" /> : null}
    </aside>
  );
}

/* ---------- Share (08.10.26) ----------
   Built like the Moodboard share sheet: invite by email with a role, the
   people on the page, general access and the link. AI access is its own block
   under it: every AI tool connected over Needt MCP (window.connections) and
   what it may do on THIS page. Local state, kept per doc in this browser
   (needt.docShare) until the share API exists. */
const DC_AI_TOOLS = [["claude", "Claude"], ["chatgpt", "ChatGPT"], ["cursor", "Cursor"], ["gemini", "Gemini"], ["perplexity", "Perplexity"], ["othermcp", "MCP client"]];
const DC_AI_LEVELS = [["none", "None"], ["read", "Read"], ["edit", "Read & edit"]];
const DC_SHARE_KEY = "needt.docShare";
const DC_SHARE_SEED = { launch: { members: [{ email: "lena@fischer.studio", name: "Lena Fischer", role: "edit" }] } };
const dcShareBlank = () => ({ members: [], access: "private", linkRole: "view", ai: {} });
let dcShareAll = (() => { const v = window.needtSync ? window.needtSync.get(DC_SHARE_KEY) : null; return v && typeof v === "object" ? v : {}; })();
/* Another window's sharing lands here (the share sheet listens for needt-docshare). */
if (window.needtSync) window.needtSync.subscribe(DC_SHARE_KEY, (v, info) => {
  if (info.origin === "local" || info.origin === "error") return;
  dcShareAll = v && typeof v === "object" ? v : {};
  window.dispatchEvent(new CustomEvent("needt-docshare", { detail: { id: null } }));
});
function dcShareOf(id) { return Object.assign(dcShareBlank(), DC_SHARE_SEED[id] || {}, dcShareAll[id] || {}); }
function dcSharePut(id, patch) {
  dcShareAll = Object.assign({}, dcShareAll, { [id]: Object.assign(dcShareOf(id), patch) });
  if (window.needtSync) window.needtSync.set(DC_SHARE_KEY, dcShareAll);
  window.dispatchEvent(new CustomEvent("needt-docshare", { detail: { id: id } }));
}
function useDocShare(id) {
  const [, bump] = React.useState(0);
  React.useEffect(() => { const on = () => bump((n) => n + 1); window.addEventListener("needt-docshare", on); return () => window.removeEventListener("needt-docshare", on); }, []);
  return dcShareOf(id);
}
/* The AI tools that are connected right now, live. */
function useAiTools() {
  const read = () => { const c = window.connections ? window.connections.get() : {}; return DC_AI_TOOLS.filter(([id]) => c[id] === "connected"); };
  const [v, setV] = React.useState(read);
  React.useEffect(() => { const on = () => setV(read()); window.addEventListener("needt-connections", on); return () => window.removeEventListener("needt-connections", on); }, []);
  return v;
}
function DcAiTile({ id, size }) {
  const BI = window.BrandIcon;
  if (BI && BI.has && BI.has(id)) return <BI id={id} size={size} />;
  return <span aria-hidden="true" className="docs-ai-tile" style={{ width: size, height: size }}><Icon name="mcp" size={Math.round(size * 0.5)} /></span>;
}
const dcInitials = (name) => name.split(/[\s.@_-]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const dcNameOf = (email) => { const n = email.split("@")[0].replace(/[._-]+/g, " "); return n.replace(/\b\w/g, (c) => c.toUpperCase()); };

/* A native select (keyboard and screen readers for free) on the app's look. */
function DcSelect({ value, onChange, label, options, plain }) {
  return (
    <span className={"docs-share-selwrap" + (plain ? " is-plain" : "")}>
      <select aria-label={label} className={"docs-share-select" + (plain ? " is-plain" : "")} value={value} onChange={(ev) => onChange(ev.target.value)}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <span className="docs-share-chev" aria-hidden="true"><Icon name="chevron-down" size={12} /></span>
    </span>
  );
}

function DcDialog({ open, onClose, label, width, children }) {
  const [shown, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
  React.useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!shown) return null;
  return ReactDOM.createPortal(
    <div className={"nx-scrim docs-dialog-scrim" + (leaving ? " is-leaving" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={label} className={"nx-sheet docs-dialog" + (leaving ? " is-leaving" : "")} style={{ maxWidth: width || 480 }}>
        {children}
      </div>
    </div>, document.body);
}

function DocShareSheet({ open, onClose }) {
  const doc = window.useOpenDoc();
  const id = doc ? doc.id : "none";
  const sh = useDocShare(id);
  const tools = useAiTools();
  const [tab, setTab] = React.useState("share");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("view");
  const [published, setPublished] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => { if (open) { setEmail(""); setRole("view"); setTab("share"); setTimeout(() => ref.current && ref.current.focus(), 40); } }, [open]);
  if (!doc) return null;
  const title = doc.title || "Untitled";
  const e = email.trim().toLowerCase();
  const okMail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const dupe = okMail && sh.members.some((m) => m.email === e);
  const link = "needt.app/d/" + doc.id;
  const put = (patch) => dcSharePut(id, patch);
  const invite = () => {
    if (!okMail || dupe) return;
    const before = sh.members;
    put({ members: before.concat({ email: e, name: dcNameOf(e), role: role }) });
    window.toast("Invited " + e + " · " + (role === "edit" ? "Can edit" : "Can view"), { undo: () => put({ members: before }) });
    setEmail("");
  };
  const setMemberRole = (m, r) => { const before = sh.members; put({ members: before.map((x) => x.email === m.email ? Object.assign({}, x, { role: r }) : x) }); window.toast(m.name + " can " + (r === "edit" ? "edit" : "view") + " now", { undo: () => put({ members: before }) }); };
  const removeMember = (m) => { const before = sh.members; put({ members: before.filter((x) => x.email !== m.email) }); window.toast("Removed " + m.name, { undo: () => put({ members: before }) }); };
  const copy = () => {
    window.needtPlatform.copy("https://" + link);
    window.toast(sh.access === "link" ? "Link copied — anyone with it can " + (sh.linkRole === "edit" ? "edit" : "view") : "Link copied — only people you invite can open it");
  };
  const aiOf = (tid) => sh.ai[tid] || "read";
  const setAi = (tid, lvl, name) => { const before = sh.ai; put({ ai: Object.assign({}, before, { [tid]: lvl }) }); window.toast(name + " · " + (DC_AI_LEVELS.find((x) => x[0] === lvl) || DC_AI_LEVELS[0])[1] + " on this page", { undo: () => put({ ai: before }) }); };
  const people = sh.members.length;
  const sub = sh.access === "link" ? "Anyone with the link can " + (sh.linkRole === "edit" ? "edit" : "view") + (people ? " · " + people + (people === 1 ? " person" : " people") + " invited" : "")
    : people ? "Shared with " + people + (people === 1 ? " person" : " people") : "Private — only you can see this page";
  return (
    <DcDialog open={open} onClose={onClose} label="Share document" width={500}>
      <div className="docs-share-head">
        <DocThumb doc={doc} w={30} h={36} />
        <span className="docs-share-head-col">
          <span className="docs-share-title">Share “{title}”</span>
          <span className="docs-share-meta" data-share-sub="">{sub}</span>
        </span>
      </div>
      <DcSeg value={tab} onChange={setTab} items={[["share", "Share"], ["publish", "Publish"], ["export", "Export"]]} />
      {tab === "share" ? <>
        <div className="docs-share-invite">
          <input ref={ref} name="doc-invite" type="email" value={email} placeholder="Invite by email" aria-label="Email address" onChange={(ev) => setEmail(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") invite(); }}
            className={"docs-share-input" + (e && !okMail ? " is-invalid" : "")} />
          <span className="docs-share-roles" role="radiogroup" aria-label="Role">
            {[["view", "View"], ["edit", "Edit"]].map(([k, n]) => <button key={k} type="button" role="radio" aria-checked={role === k} className="docs-share-role" onClick={() => setRole(k)}>{n}</button>)}
          </span>
          <button type="button" className="nx-btn nx-btn-primary" data-share-invite="" disabled={!okMail || dupe} onClick={invite}>Invite</button>
        </div>
        {e && !okMail ? <span className="docs-share-error">Enter a full email address.</span> : dupe ? <span className="docs-share-hint">Already on this page.</span> : null}

        <div className="docs-share-section">
          <span className="docs-share-label">People with access</span>
          <div className="docs-share-person">
            <Avatar initials="MK" name="Maks" size={28} />
            <span className="docs-share-col">
              <span className="docs-share-strong">Maks <span className="docs-share-you">(you)</span></span>
              <span className="docs-share-meta">maksym@needt.app</span>
            </span>
            <span className="docs-share-owner">Owner</span>
          </div>
          {sh.members.map((m) => (
            <div key={m.email} className="nx-swap docs-share-person" data-share-member={m.email}>
              <Avatar initials={dcInitials(m.name)} name={m.name} size={28} />
              <span className="docs-share-col">
                <span className="docs-share-strong">{m.name}</span>
                <span className="docs-share-meta">{m.email}</span>
              </span>
              <DcSelect label={"Role for " + m.name} value={m.role} onChange={(v) => setMemberRole(m, v)} options={[["view", "Can view"], ["edit", "Can edit"]]} />
              <button type="button" aria-label={"Remove " + m.name} className="nx-btn nx-btn-text nx-btn-sm" onClick={() => removeMember(m)}>Remove</button>
            </div>
          ))}
        </div>

        <div className="docs-share-rule" />
        <div className="docs-share-section">
          <span className="docs-share-label">General access</span>
          <div className="docs-share-person" data-share-access={sh.access}>
            <span className="docs-share-glyph"><Icon name={sh.access === "link" ? "globe" : "lock"} size={14} /></span>
            <span className="docs-share-col">
              <DcSelect plain label="General access" value={sh.access} onChange={(v) => put({ access: v })} options={[["private", "Private"], ["link", "Anyone with the link"]]} />
              <span className="docs-share-meta">{sh.access === "link" ? "No sign-in needed. Tasks inside stay private." : "Only you and the people above can open it."}</span>
            </span>
            {sh.access === "link" ? (
              <DcSelect label="Link role" value={sh.linkRole} onChange={(v) => put({ linkRole: v })} options={[["view", "Can view"], ["edit", "Can edit"]]} />) : null}
          </div>
        </div>

        <div className="docs-share-ai" data-share-ai="">
          <div className="docs-share-ai-head">
            <span className="docs-share-ai-glyph"><Icon name="mcp" size={14} /></span>
            <span className="docs-share-col">
              <span className="docs-share-strong">AI access</span>
              <span className="docs-share-meta">AI tools you connected through Needt MCP reach this page only as far as you allow here.</span>
            </span>
          </div>
          {tools.length ? tools.map(([tid, name]) => (
            <div key={tid} className="docs-share-person is-ai" data-share-ai-tool={tid}>
              <DcAiTile id={tid} size={28} />
              <span className="docs-share-col">
                <span className="docs-share-strong">{(window.cnLabel && window.cnLabel(tid)) || name}</span>
                <span className="docs-share-meta">{aiOf(tid) === "edit" ? "Reads the page and writes into it" : aiOf(tid) === "read" ? "Reads the page, changes nothing" : "Can’t see this page"}</span>
              </span>
              <DcSelect label={"AI access for " + name} value={aiOf(tid)} onChange={(v) => setAi(tid, v, name)} options={DC_AI_LEVELS} />
            </div>
          )) : (
            <div className="docs-share-ai-empty" data-share-ai-empty="">
              <span className="docs-share-meta">No AI tools connected yet.</span>
              <button type="button" className="nx-btn nx-btn-text nx-btn-sm docs-share-connect" onClick={() => { onClose(); if (window.needtSync) window.needtSync.set("needt.connections.tab", "ai"); if (window.__app && window.__app.setScreen) window.__app.setScreen("connections"); }}>
                Connect an AI tool<Icon name="arrow-right" size={13} />
              </button>
            </div>
          )}
        </div>

        <div className="docs-share-foot">
          <button type="button" className="nx-btn nx-btn-secondary" data-share-copy="" onClick={copy}><Icon name="link" size={14} />Copy link</button>
          <button type="button" className="nx-btn nx-btn-secondary" onClick={onClose}>Done</button>
        </div>
      </> : tab === "publish" ? <>
        <div className="docs-share-person">
          <span className="docs-share-col">
            <span className="docs-share-strong">Publish to the web</span>
            <span className="docs-share-meta">A public page anyone can find and read. Tasks inside stay private.</span>
          </span>
          <Switch checked={published} onChange={setPublished} />
        </div>
        {published ? <span className="docs-share-field is-url">needt.app/p/{doc.id}</span> : null}
        <div className="docs-share-foot"><button type="button" className="nx-btn nx-btn-secondary" onClick={onClose}>Done</button></div>
      </> : <>
        <div className="docs-share-panel-7">
          {[["file-text", "Markdown", ".md"], ["download", "PDF", ".pdf"], ["code", "HTML", ".html"], ["database", "Through the API", "GET /api/pages/:id"]].map(([i, l, h]) => (
            <button key={l} type="button" className="nav-row docs-share-panel-8"><Icon name={i} size={16} /><span className="docs-share-panel-9">{l}</span><span className="docs-share-panel-10">{h}</span></button>
          ))}
        </div>
        <div className="docs-share-foot"><button type="button" className="nx-btn nx-btn-secondary" onClick={onClose}>Done</button></div>
      </>}
    </DcDialog>
  );
}

/* The right inspector opens on request only (08.10.26): closed while you read,
   opened by the Insert button here, by the "/" menu's last row or by the top
   bar's panel toggle (⌘⌥\\). Its open state is the shell's docPanel pref,
   remembered per user; the first run after this change starts it closed. */
if (window.needtSync && window.needtSync.getRaw("needt.docPanel.v2") == null) {
  window.needtSync.set("needt.docPanel", "0");
  window.needtSync.set("needt.docPanel.v2", "1");
}
/* One call opens the Insert tab (or closes the panel if Insert is already up). */
const dcOpenInsert = (toggle) => window.dispatchEvent(new CustomEvent("needt-doc-insert", { detail: { toggle: !!toggle } }));
function useDocInspector() {
  const read = () => ({ open: !!(window.__app && window.__app.docPanel), tab: window.__docInspectorTab || "insert" });
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    const on = () => setV(read());
    window.addEventListener("needt-docpanel", on); window.addEventListener("needt-doc-tab", on);
    return () => { window.removeEventListener("needt-docpanel", on); window.removeEventListener("needt-doc-tab", on); };
  }, []);
  return v;
}

function DocTopRight() {
  const [share, setShare] = React.useState(false);
  const ins = useDocInspector();
  const insertOn = ins.open && ins.tab === "insert";
  return (
    <>
      <Avatar initials="MK" name="Maks" size={28} />
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-doc-insert-btn="" aria-expanded={insertOn} title="Insert a block — or type / on the page"
        onClick={() => dcOpenInsert(true)}><Icon name="plus" size={14} />Insert</button>
      <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" data-doc-share-btn="" aria-expanded={share} aria-haspopup="dialog" onClick={() => setShare(true)}><Icon name="users" size={14} />Share</button>
      <DocShareSheet open={share} onClose={() => setShare(false)} />
    </>
  );
}

function InsertRow({ icon, label, last }) {
  return (
    <div draggable className={"docs-insert-row-1 " + "dc-row is-press" + (last ? "" : " dc-hair")}>
      <span className="docs-insert-row-2"><Icon name={icon} size={15} /></span>
      <span className="docs-dc-row-3">{label}</span>
      <span className="dc-grip docs-insert-row-3"><Icon name="grip-vertical" size={14} /></span>
    </div>
  );
}
/* Insert tab: every block, grouped, Craft's rows. */
function InsertPanel() {
  return (
    <div className="docs-dc-style-panel-1">
      <span className="docs-insert-panel-1">Drag a block onto the page, or type / on it.</span>
      {BLOCKS.map(([group, items]) => (
        <React.Fragment key={group || "basics"}>
          <DcLabel>{group || "Basics"}</DcLabel>
          {items.map(([icon, label], i) => <InsertRow key={label} icon={icon} label={label} last={i === items.length - 1} />)}
        </React.Fragment>
      ))}
      <DcLabel>Line</DcLabel>
      <div className="docs-insert-panel-2">
        {["dotted", "thin", "thick", "space"].map((id) => (
          <div key={id} draggable title={id === "space" ? "Empty space" : id + " line"} className="dc-row is-press docs-insert-panel-3">
            <span className={"docs-insert-panel-4 is-" + id} />
          </div>
        ))}
      </div>
      <DcLabel>Page break</DcLabel>
      <InsertRow icon="file-text" label="New page from here" last />
    </div>
  );
}

function PanelRow({ label, value, last }) {
  return (
    <div className={"docs-panel-row-1 docs-panel-row-s1" + (last ? " is-on" : "")}>
      <span className="docs-panel-row-2">{label}</span>
      <span className="docs-panel-row-3">{value}</span>
    </div>
  );
}

function Eyebrow({ children, action, first }) { return <DcLabel action={action} first={first}>{children}</DcLabel>; }

/* A tile in a grid of choices: recessed at rest, accent at 12% when chosen. */
function Tile({ on, onClick, children, style, label, tall, className }) {
  return (
    <button type="button" aria-pressed={!!on} aria-label={label} onClick={onClick} className={"docs-tile" + (tall ? " is-tall" : "") + (className ? " " + className : "")} style={style}>
      {children}
    </button>
  );
}
function Joined({ items, value, onChange }) {
  return (
    <div className="docs-joined-1">
      {items.map(([id, icon, label], i) => (
        <button className="docs-joined-2" key={id} type="button" aria-label={label} title={label} aria-pressed={value === id} onClick={() => onChange && onChange(id)}>
          <Icon name={icon} size={15} />
        </button>
      ))}
    </div>
  );
}

const INKS = [["Ink", "var(--text-primary)"], ["Slate", "var(--text-tertiary)"], ["Mist", "var(--text-muted)"], ["Blue", "var(--accent)"], ["Sky", "color-mix(in oklab, var(--accent) 60%, var(--surface-raised))"], ["Amber", "var(--info)"], ["Green", "var(--success)"], ["Red", "var(--destructive)"]];

function FormatPanel() {
  const [style, setStyle] = React.useState("Body");
  const [group, setGroup] = React.useState(null);
  const [deco, setDeco] = React.useState("block");
  const [ink, setInk] = React.useState(0);
  const [list, setList] = React.useState(null);
  const [align, setAlign] = React.useState("left");
  const [font, setFont] = React.useState("default");
  const styles = [["Title", "is-title"], ["Subtitle", "is-semi"], ["Heading", "is-semi"], ["Strong", "is-semi"], ["Body", "is-body"], ["Caption", "is-caption"]];
  return (
    <div className="docs-share-panel-7">
      <Eyebrow first>Text</Eyebrow>
      <div className="docs-format-panel-1">
        {styles.map(([l, c]) => <Tile key={l} on={style === l} onClick={() => setStyle(l)} className={"docs-ts " + c}>{l}</Tile>)}
      </div>
      <Eyebrow>Group</Eyebrow>
      <div className="docs-format-panel-2">
        <Tile on={group === "page"} onClick={() => setGroup(group === "page" ? null : "page")} tall><Icon name="file-text" size={15} />Page</Tile>
        <Tile on={group === "card"} onClick={() => setGroup(group === "card" ? null : "card")} tall><Icon name="layout-template" size={15} />DocBlockCard</Tile>
      </div>
      <div className="docs-rule" />
      <Joined items={[["b", "bold", "Bold"], ["i", "italic", "Italic"], ["s", "strikethrough", "Strike"], ["c", "code", "Code"]]} />
      <Joined value={list} onChange={(v) => setList(list === v ? null : v)} items={[["check", "list-checks", "Checklist"], ["toggle", "corner-down-right", "Toggle"], ["bullet", "list", "Bullets"], ["number", "hash", "Numbered"]]} />
      <Joined value={align} onChange={setAlign} items={[["left", "align-left", "Align left"], ["out", "arrow-left", "Outdent"], ["in", "arrow-right", "Indent"], ["task", "circle-check", "Make it a task"]]} />
      <Eyebrow>Decoration</Eyebrow>
      <div className="docs-format-panel-2">
        <Tile on={deco === "focus"} onClick={() => setDeco("focus")} tall><span className="docs-format-panel-3" />Focus</Tile>
        <Tile on={deco === "block"} onClick={() => setDeco("block")} tall><span className="docs-format-panel-4">Block</span></Tile>
      </div>
      <Eyebrow>Colour</Eyebrow>
      <div className="docs-format-panel-5">
        {INKS.map(([n, c], i) => (
          <button className={"docs-format-panel-6" + (ink === i ? " is-on" : "")} key={n} type="button" aria-label={n} title={n} onClick={() => setInk(i)}
            style={{ "--ink": c }} />
        ))}
        <button className="docs-format-panel-7" type="button" aria-label="Highlight" title="Highlight"><Icon name="highlighter" size={13} /></button>
        <button className="docs-format-panel-8" type="button" aria-label="More colours" title="More colours"><Icon name="plus" size={13} /></button>
      </div>
      <Eyebrow>Font</Eyebrow>
      <FontRow value={font} onChange={setFont} />
    </div>
  );
}

function FontRow({ value, onChange }) {
  const opts = [["default", "Aa Default"], ["serif", "Ss"], ["mono", "00"], ["round", "Rr"]];
  return (
    <div className="docs-font-row-1">
      {opts.map(([id, l], i) => (
        <button className={"docs-font-row-2 is-" + id} key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

function InfoLine({ icon, label, value, last }) {
  return (
    <div className={"docs-info-line-1 docs-info-line-s1" + (last ? " is-on" : "")}>
      <span className="docs-info-line-2"><Icon name={icon} size={15} /></span>
      <span className="docs-info-line-3">{label}</span>
      <span className="docs-info-line-4" title={value}>{value}</span>
    </div>
  );
}
function ActionLine({ icon, label, keys, danger, off, onClick }) {
  return (
    <button type="button" className={"nav-row docs-action-line-1 docs-action" + (off ? " is-off" : danger ? " is-danger" : "")} disabled={off} onClick={onClick}>
      <Icon name={icon} size={15} /><span className="docs-share-panel-9">{label}</span>
      {keys ? <span className="docs-action-line-2">{keys}</span> : null}
    </button>
  );
}

function InfoPanel() {
  const [tab, setTab] = React.useState("page");
  const [review, setReview] = React.useState(true);
  const [done, setDone] = React.useState({});
  const doc = window.useOpenDoc ? window.useOpenDoc() : null;
  return (
    <div className="docs-dc-style-panel-1">
      <div className="docs-info-panel-1"><DcSeg value={tab} onChange={setTab} items={[["page", "Page info"], ["actions", "Actions"]]} /></div>
      {tab === "page" ? <>
        <Eyebrow>Properties</Eyebrow>
        <InfoLine icon="calendar" label="Created" value={(doc && doc.created) || "Today"} />
        <InfoLine icon="clock" label="Updated" value={(doc && doc.updated) || "Just now"} />
        <InfoLine icon="user" label="Author" value="Maks" />
        <InfoLine icon="folder" label="Project" value={dcProjectLabel(doc) || "No project"} last />
        <Eyebrow action={<IconButton label="Collapse" variant="ghost" onClick={() => setReview(!review)}><Icon name={review ? "chevron-down" : "chevron-right"} size={14} /></IconButton>}>Review by Needt</Eyebrow>
        {review ? [["spell", "Check spelling and grammar"], ["structure", "Feedback on structure"], ["tone", "Check the tone"], ["clarity", "Make it clearer"]].map(([k, l]) => (
          <button key={k} type="button" className="nav-row docs-action-line-1" onClick={() => setDone(Object.assign({}, done, { [k]: true }))}>
            <span className={"docs-info-panel-2 docs-info-panel-s1" + (done[k] ? " is-on" : "")}>{done[k] ? <Icon name="check" size={10} /> : null}</span>
            <span className="docs-share-panel-9">{l}</span>
            {done[k] ? <span className="docs-info-panel-3">2 notes</span> : null}
          </button>
        )) : null}
        <Eyebrow>Actions</Eyebrow>
        <ActionLine icon="sparkles" label="Present" />
        <ActionLine icon="folder" label="Move to…" />
        <ActionLine icon="copy" label="Duplicate" />
        <ActionLine icon="star" label="Pin" />
        <ActionLine icon="rotate-ccw" label="Versions" />
        <ActionLine icon="archive" label="Delete" danger />
        <Eyebrow>Numbers</Eyebrow>
        {[["Words", "214"], ["Characters", "1 286"], ["Blocks", "9"], ["Reading time", "1 min"]].map(([l, v], i) => <PanelRow key={l} label={l} value={v} last={i === 3} />)}
        <Eyebrow>Who wrote what</Eyebrow>
        {[["var(--text-primary)", "You", "92%"], ["var(--accent)", "Needt", "8%"]].map(([c, n, p]) => (
          <div className="docs-info-panel-4" key={n}>
            <span className="docs-info-panel-5" style={{ "--dot": c }} />{n}
            <span className="docs-info-panel-6">{p}</span>
          </div>
        ))}
      </> : <>
        <Eyebrow>Actions</Eyebrow>
        <ActionLine icon="search" label="Find in page" keys="⌘F" />
        <ActionLine icon="command" label="Open anything" keys="⌘K" />
        <ActionLine icon="message-square" label="Ask Needt" keys="⌘J" />
        <div className="docs-rule" />
        <ActionLine icon="message-circle" label="Add comment" keys="⌘⇧M" off />
        <div className="docs-rule" />
        <ActionLine icon="arrow-up" label="Move up" keys="⌥↑" off />
        <ActionLine icon="arrow-down" label="Move down" keys="⌥↓" off />
        <ActionLine icon="arrow-up" label="Move to top" keys="⌘⌥↑" off />
        <ActionLine icon="arrow-down" label="Move to bottom" keys="⌘⌥↓" off />
        <div className="docs-rule" />
        <ActionLine icon="layers" label="Group" keys="⌘G" off />
        <ActionLine icon="layers" label="Ungroup" keys="⌘⇧G" off />
        <div className="docs-rule" />
        <ActionLine icon="circle-check" label="Turn into a task" keys="⌘⏎" off />
        <ActionLine icon="copy" label="Duplicate" keys="⌘D" off />
        <ActionLine icon="archive" label="Delete" keys="⌫" danger off />
        <span className="docs-info-panel-7">Select a block to use the greyed ones.</span>
      </>}
    </div>
  );
}

/* A block answers the hand: on hover a small tray at its right edge, the
   tray's last button opens everything else that can happen to it. */
function Block({ children, style }) {
  const [hot, setHot] = React.useState(false);
  const [menu, setMenu] = React.useState(false);
  const live = hot || menu;
  return (
    <div onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)} className={"docs-block-wrap" + (live ? " is-on" : "")} style={style}>
      {children}
      <span className={"docs-block-1 docs-block-s1" + (live ? " is-on" : "")}>
        <span className="docs-block-2">
          <DropMenu width={252} align="right" trigger={<span className="docs-dc-style-panel-29" onClick={() => setMenu(!menu)}><IconButton label="Block actions" variant="ghost"><Icon name="ellipsis" size={14} /></IconButton></span>}>
            <MenuItem icon={<Icon name="plus" size={14} />}>Add inside this block</MenuItem>
            <MenuItem icon={<Icon name="message-square" size={14} />}>Comment</MenuItem>
            <MenuItem icon={<Icon name="heart" size={14} />}>React</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="circle-check" size={14} />}>Turn into a task</MenuItem>
            <MenuItem icon={<Icon name="layout-template" size={14} />}>Turn into a card</MenuItem>
            <MenuItem icon={<Icon name="sparkles" size={14} />}>Ask Needt about this</MenuItem>
            <MenuItem icon={<Icon name="bell" size={14} />} submenu>Remind me</MenuItem>
            <MenuSeparator />
            <MenuItem icon={<Icon name="arrow-up" size={14} />}>Insert above</MenuItem>
            <MenuItem icon={<Icon name="arrow-down" size={14} />}>Insert below</MenuItem>
            <MenuItem icon={<Icon name="link" size={14} />}>Copy link to block</MenuItem>
            <MenuItem icon={<Icon name="copy" size={14} />}>Duplicate</MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" icon={<Icon name="archive" size={14} />}>Delete</MenuItem>
          </DropMenu>
        </span>
      </span>
    </div>
  );
}

/* People a page can mention: who it is shared with, then everyone you have mail with. */
function dcPeople(doc) {
  const seen = {}, out = [];
  const add = (name, email) => { if (!email) return; const k = String(email).toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push({ name: name || email, email: email }); };
  if (doc) dcShareOf(doc.id).members.forEach((m) => add(m.name, m.email));
  if (window.mailApi && window.mailApi.contacts) window.mailApi.contacts().forEach((c) => add(c.name, c.email));
  return out.slice(0, 12);
}
/* A block's comment thread (fmt.comments): a badge in the right margin with
   the count; it opens the thread — each comment with the words it was left
   on, a reply field and Resolve (the thread goes, with Undo). */
function DocComments({ b, onChange }) {
  const list = (b.fmt && b.fmt.comments) || [];
  const [open, setOpen] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [open]);
  const send = () => { const t = reply.trim(); if (!t) return; onChange(list.concat([{ id: "cm" + Date.now().toString(36), text: t, quote: "", by: "Maks", at: new Date().toISOString() }])); setReply(""); };
  const resolve = () => { const before = list; onChange([]); setOpen(false); window.toast("Thread resolved", { undo: () => onChange(before) }); };
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  return (
    <span ref={ref} className="docs-cmt" data-doc-comments={list.length}>
      <button type="button" className="docs-cmt-badge" aria-expanded={open} aria-label={list.length + (list.length === 1 ? " comment" : " comments")} onClick={() => setOpen(!open)} data-doc-comment-badge="">
        <Icon name="message-square" size={12} />{list.length}
      </button>
      {open ? (
        <div className="docs-cmt-thread nx-up" role="dialog" aria-label="Comments" data-doc-thread="">
          {list.map((c) => (
            <div key={c.id} className="docs-cmt-item">
              <span className="docs-cmt-head"><Avatar initials={dcInitials(c.by)} name={c.by} size={18} /><b>{c.by}</b><span className="docs-cmt-when">{when(c.at)}</span></span>
              {c.quote ? <span className="docs-cmt-quote">{c.quote}</span> : null}
              <span className="docs-cmt-text">{c.text}</span>
            </div>
          ))}
          <div className="docs-cmt-reply">
            <input className="docs-selbar-input" value={reply} placeholder="Reply" aria-label="Reply" data-doc-reply=""
              onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } else if (e.key === "Escape") setOpen(false); }} />
            <button type="button" className="nx-btn nx-btn-sm nx-btn-secondary" onClick={resolve} data-doc-resolve="">Resolve</button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

/* Selecting text raises a bar over it. Its marks apply to the selected words
   only (doc-style.jsx applyMark over each block the selection crosses):
   Highlight · Bold · Italic · Strike · Code · Link · Colour. A pressed button
   = every selected character has that mark; pressing it again takes it off.
   Highlight and Colour open a swatch row over the bar, Link a field (⌘K).
   at = { x, y, parts: [{ id, start, end }], marks, mode: null | "hl" | "color" | "link" }.
   Then the words as people's: Mention (an @people picker — the words become
   a mention span), Comment (a thread on the block, a margin badge) and the
   one Craft does not have, Make a task (the selection becomes a task; the
   task keeps a link back — task.source, the block's fmt.task). */
function SelectionBar({ at, onMark, onMode, people, onMention, onComment, onTask }) {
  const [url, setUrl] = React.useState("");
  const [note, setNote] = React.useState("");
  const [who, setWho] = React.useState("");
  const mode = at ? at.mode : null;
  React.useEffect(() => { if (mode === "link") setUrl((at.marks && at.marks.href) || ""); if (mode === "comment") setNote(""); if (mode === "mention") setWho(""); }, [mode]);
  if (!at) return null;
  const m = at.marks || {};
  /* the bar keeps the page's selection: no focus change, no page mouse handlers */
  const keep = (e) => { e.stopPropagation(); if (e.target.tagName !== "INPUT") e.preventDefault(); };
  const btn = (mark, icon, label, kbd) => (
    <button key={mark} type="button" className="docs-selbar-btn" aria-label={label} title={label + (kbd ? "  " + kbd : "")} aria-pressed={!!m[mark]} data-selbar={mark}
      onClick={() => (mark === "href" ? onMode(mode === "link" ? null : "link") : onMark(mark))}><Icon name={icon} size={14} /></button>);
  const link = () => {
    const v = url.trim();
    if (!v) { onMark("href", null); return; }
    const h = dxSafeHref(v);
    if (!h) { window.toast && window.toast("Enter a web address, like needt.app"); return; }
    onMark("href", h);
  };
  return (
    <div className="docs-selbar-wrap" style={{ left: at.x, top: at.y }} onMouseDown={keep} onMouseUp={(e) => e.stopPropagation()} data-selbar-wrap="">
      {mode === "color" || mode === "hl" ? (
        <div className="docs-selbar-panel" role="radiogroup" aria-label={mode === "color" ? "Text colour" : "Highlight"} data-selbar-panel={mode}>
          {mode === "color" ? DX_COLORS.map(([id, name]) => (
            <button key={id} type="button" role="radio" aria-checked={(m.color || "default") === id} aria-pressed={(m.color || "default") === id} aria-label={name} title={name}
              className={"docs-selbar-sw is-ink" + (id === "default" ? "" : " dx-c-" + id)} data-selbar-color={id} onClick={() => onMark("color", id === "default" ? null : id)}>A</button>
          )) : [["none", "None"]].concat(DX_HLS).map(([id, name]) => (
            <button key={id} type="button" role="radio" aria-checked={(m.hl || "none") === id} aria-pressed={(m.hl || "none") === id} aria-label={name} title={name}
              className={"docs-selbar-sw" + (id === "none" ? "" : " dx-h-" + id)} data-selbar-hl={id} onClick={() => onMark("hl", id === "none" ? null : id)}>{id === "none" ? <Icon name="x" size={12} /> : null}</button>
          ))}
        </div>
      ) : null}
      {mode === "link" ? (
        <div className="docs-selbar-panel docs-selbar-link" data-selbar-panel="link">
          <input className="docs-selbar-input" autoFocus value={url} placeholder="Paste or type a link" aria-label="Link address" data-selbar-url=""
            onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); link(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onMode(null, true); } }} />
          <button type="button" className="nx-btn nx-btn-sm nx-btn-primary" onClick={link} data-selbar-apply="">Link</button>
          {m.href ? <button type="button" className="nx-btn nx-btn-sm nx-btn-secondary" onClick={() => onMark("href", null)} data-selbar-unlink="">Remove</button> : null}
        </div>
      ) : null}
      {mode === "mention" ? (() => {
        const q = who.trim().toLowerCase();
        const list = (people || []).filter((p) => !q || String(p.name).toLowerCase().indexOf(q) >= 0 || String(p.email).toLowerCase().indexOf(q) >= 0).slice(0, 6);
        return (
          <div className="docs-selbar-panel docs-selbar-people" data-selbar-panel="mention">
            <input className="docs-selbar-input" autoFocus value={who} placeholder="Mention someone" aria-label="Mention someone" data-selbar-who=""
              onChange={(e) => setWho(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && list[0]) { e.preventDefault(); onMention(list[0]); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onMode(null, true); } }} />
            {list.length ? list.map((p) => (
              <button key={p.email} type="button" className="docs-selbar-person" onClick={() => onMention(p)} data-selbar-person={p.email}>
                <Avatar initials={dcInitials(p.name)} name={p.name} size={20} /><span className="docs-selbar-person-name">{p.name}</span><span className="docs-selbar-person-mail">{p.email}</span>
              </button>)) : <span className="docs-selbar-empty">No one by that name</span>}
          </div>);
      })() : null}
      {mode === "comment" ? (
        <div className="docs-selbar-panel docs-selbar-link" data-selbar-panel="comment">
          <input className="docs-selbar-input" autoFocus value={note} placeholder="Add a comment" aria-label="Comment" data-selbar-note=""
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && note.trim()) { e.preventDefault(); onComment(note.trim()); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onMode(null, true); } }} />
          <button type="button" className="nx-btn nx-btn-sm nx-btn-primary" disabled={!note.trim()} onClick={() => onComment(note.trim())} data-selbar-comment-send="">Comment</button>
        </div>
      ) : null}
      <div className="docs-selection-bar-1" role="toolbar" aria-label="Format the selected words">
        <button type="button" className="docs-selbar-btn" aria-label="Highlight" title="Highlight" aria-pressed={!!m.hl || mode === "hl"} aria-expanded={mode === "hl"} data-selbar="hl" onClick={() => onMode(mode === "hl" ? null : "hl")}><Icon name="highlighter" size={14} /></button>
        <span className="docs-selection-bar-2" />
        {btn("b", "bold", "Bold", "⌘B")}{btn("i", "italic", "Italic", "⌘I")}{btn("s", "strikethrough", "Strike", "⌘⇧X")}{btn("code", "code", "Code")}{btn("href", "link", "Link", "⌘K")}
        <button type="button" className="docs-selbar-btn" aria-label="Text colour" title="Text colour" aria-expanded={mode === "color"} data-selbar="color" onClick={() => onMode(mode === "color" ? null : "color")}>
          <span className={"docs-selbar-ink" + (m.color ? " dx-c-" + m.color : "")}>A</span>
        </button>
        <span className="docs-selection-bar-2" />
        <button type="button" className="docs-selbar-btn" aria-label="Mention" title="Mention" aria-expanded={mode === "mention"} data-selbar="mention" onClick={() => onMode(mode === "mention" ? null : "mention")}><Icon name="mention" size={14} /></button>
        <button type="button" className="docs-selbar-btn" aria-label="Comment" title="Comment" aria-expanded={mode === "comment"} data-selbar="comment" onClick={() => onMode(mode === "comment" ? null : "comment")}><Icon name="message-square" size={14} /></button>
        <button type="button" className="nx-btn nx-btn-sm nx-btn-primary docs-selection-bar-3" data-selbar="task" onClick={onTask}><Icon name="circle-check" size={14} />Make a task</button>
      </div>
    </div>
  );
}

/* ---------- the page as a list of blocks, and Craft's "/" menu ---------- */

let DOC_BID = 0;
const newDocBlock = (kind, text, extra) => Object.assign({ id: "b" + (++DOC_BID), kind, text: text || "" }, extra);
const LAUNCH_LEAD = [{ t: "The scheduler places work into real free hours, so the calendar is " }, { t: "the plan", b: true }, { t: " rather than a record of it. This document sets the scope for the " }, { t: "September release", b: true }, { t: "." }];
const SEED_BLOCKS = () => [
  newDocBlock("lead", LAUNCH_LEAD), newDocBlock("h", "Scope"), newDocBlock("li", "Tasks and events share one grid."), newDocBlock("li", "The sidebar becomes places, not links.", { mb: 20 }),
  newDocBlock("task", "Ship the sidebar", { meta: "Task · Design system · Fri · 4 h" }), newDocBlock("suggest", ""), newDocBlock("h", "Open questions"),
  newDocBlock("p", "Collected through the week and closed in the Friday review.", { muted: true }), newDocBlock("p", "")
];
/* The store keeps a page as short arrays (the cards draw from them); the
   editor works on blocks with ids. These two turn one into the other, and
   blocks the store has no shape for keep their kind and text. */
/* The store's short arrays ⇄ the editor's blocks. One shape with the phone
   (phone-docs.jsx): [kind, text, extra?, fmt?]. Text is RICH (doc-style.jsx):
   a plain string or spans [{ t, b, i, s, code, href, color, hl }] — kept on
   the block as b.text and written back in its stored form (dxNorm). kinds
   image [src], page [doc id] and date [label] (+ fmt.date, the ISO day) come
   from the phone's + Content; the 4th slot fmt = { date, remind } holds the
   date's day and a reminder { id, label }. An older page's block-level
   { b, i, s, color } reads as spans over the whole text (dxMigrateBlock) and
   is saved that way with the next edit. fmt, src, ref and x2 are kept on the
   block and written back unchanged, so a page edited on either side keeps
   what the other one set. */
const docFmtOf = (a) => (a && a[3] && typeof a[3] === "object" ? Object.assign({}, a[3]) : null);
const docEmpty = (t) => !spansToText(t);
function bodyToBlocks(body) {
  return (body || []).map((a0) => {
    const a = dxMigrateBlock(a0);
    const k = a[0], fmt = docFmtOf(a);
    const keep = (o) => Object.assign(o, fmt ? { fmt: fmt } : null);
    if (k === "todo") return newDocBlock("todo", a[1], keep({ done: !!a[2] }));
    if (k === "table") return newDocBlock("table", "", keep({ rows: JSON.parse(JSON.stringify(a[1] || [])) }));
    if (k === "cards") return newDocBlock("cards", "", keep({ items: (a[1] || []).slice() }));
    if (k === "task") return newDocBlock("task", a[1], keep(a[2] ? { meta: a[2] } : {}));
    if (k === "image") return newDocBlock("image", "", keep({ src: typeof a[1] === "string" && a[1] ? a[1] : null }));
    if (k === "page") return newDocBlock("page", "", keep({ ref: a[1] != null && a[1] !== "" ? a[1] : null }));
    if (k === "p" && a[2] && a[2].muted) return newDocBlock("p", a[1], keep({ muted: true }));
    return newDocBlock(k, DX_TEXT_KINDS[k] ? dxNorm(a[1]) : typeof a[1] === "string" ? a[1] : "", keep(a[2] != null ? { x2: a[2] } : {}));
  });
}
function blocksToBody(blocks) {
  return blocks.filter((b) => !(b.kind === "p" && !spansToText(b.text) && !b.fmt)).map((b0) => {
    const b = DX_TEXT_KINDS[b0.kind] ? Object.assign({}, b0, { text: dxNorm(b0.text) }) : b0;
    const k = b.kind;
    let out;
    if (k === "todo") out = b.done ? ["todo", b.text, true] : ["todo", b.text];
    else if (k === "table") out = ["table", b.rows || []];
    else if (k === "cards") out = ["cards", b.items || []];
    else if (k === "task") out = b.meta ? ["task", b.text, b.meta] : ["task", b.text];
    else if (k === "image") out = ["image", b.src || ""];
    else if (k === "page") out = ["page", b.ref != null ? b.ref : ""];
    else if (k === "rule" || k === "shot" || k === "suggest") return [k];
    else if (k === "p" && b.muted) out = ["p", b.text, { muted: true }];
    else out = b.x2 != null ? [k, b.text || "", b.x2] : [k, b.text || ""];
    const f = b.fmt && Object.keys(b.fmt).some((x) => b.fmt[x] != null && b.fmt[x] !== false && b.fmt[x] !== "") ? b.fmt : null;
    if (f) { while (out.length < 3) out.push(null); out[3] = f; }
    return out;
  });
}
const docDateLabel = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  const dt = new Date(+m[1], +m[2] - 1, +m[3]);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getDay()] + " " + dt.getDate() + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getMonth()];
};
/* The launch brief keeps its richer demo (a task card, a suggestion) while
   its body is still the short one it shipped with. */
function blocksForDoc(doc) {
  if (!doc) return [newDocBlock("p", "")];
  const demo = DOCS.find((d) => d.id === "launch");
  const list = doc.id === "launch" && demo && JSON.stringify(doc.body) === JSON.stringify(demo.body) ? SEED_BLOCKS() : bodyToBlocks(doc.body);
  const l = list[list.length - 1];
  return l && l.kind === "p" && docEmpty(l.text) ? list : list.concat(newDocBlock("p", ""));
}
const SLASH_ITEMS = BLOCKS.flatMap(([g, items]) => items.map(([icon, label, kind, hint, art]) => ({ g: g || "Basics", icon, label, kind, hint, art })));
const DOC_PH = { p: "Type / for blocks", h: "Heading", li: "List", todo: "To-do", quote: "Quote", callout: "Callout", code: "Code", task: "Task name", event: "Event name", habit: "Habit name", ask: "Ask Needt anything…" };
const ED_CSS = ".nx-ed{outline:none;min-height:1.5em}.nx-ed:focus,.nx-ed:focus-visible,[data-slash] input:focus,[data-slash] input:focus-visible{outline:none!important;box-shadow:none!important}.nx-ed:empty::before{content:attr(data-ph);color:var(--text-disabled);pointer-events:none}.nx-ed:not(.is-tail):not(.ph-always):not(:focus):empty::before{content:none}";
const PH_ALWAYS = { task: 1, event: 1, habit: 1, ask: 1, callout: 1 };

function docFocusEnd(el) {
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}

/* An editable spot. Its text lives in the DOM while you type (the block keeps
   a copy, b.text, as rich text), so React never rewrites it under the caret:
   the spans are drawn once on mount (spansToHtml) and read back on every
   input (dxFromEditor). "plaintext-only" keeps the browser from adding its
   own formatting and pastes as plain words; marks come only from
   api.mark (the selection bar, ⌘B / ⌘I / ⌘⇧X / ⌘K), which redraws the block. */
const DOC_MARK_KEYS = { KeyB: "b", KeyI: "i" };
function DocEd({ b, as, cls, api }) {
  const ref = React.useRef(null);
  React.useLayoutEffect(() => { if (ref.current) ref.current.innerHTML = spansToHtml(b.text); }, [b.id]);
  const tail = b.kind === "p" && api.isTail(b);
  return React.createElement(as || "div", {
    ref: ref, contentEditable: "plaintext-only", suppressContentEditableWarning: true, "data-bid": b.id, "data-ph": DOC_PH[b.kind] || "",
    className: "nx-ed" + (tail ? " is-tail" : "") + (PH_ALWAYS[b.kind] ? " ph-always" : "") + (cls ? " " + cls : ""), spellCheck: false,
    onInput: (e) => { const el = e.currentTarget; if (!el.textContent) el.innerHTML = ""; b.text = dxFromEditor(el, b.text); if (api.changed) api.changed(); },
    onKeyDown: (e) => {
      const mod = (e.metaKey || e.ctrlKey) && !e.altKey;
      const mark = mod && !e.shiftKey ? DOC_MARK_KEYS[e.code] : mod && e.shiftKey && e.code === "KeyX" ? "s" : null;
      if (mark) { e.preventDefault(); e.stopPropagation(); if (api.mark) api.mark(mark); return; }
      if (mod && !e.shiftKey && e.code === "KeyU") { e.preventDefault(); return; }
      /* ⌘K over selected words is a link; with nothing selected it stays the app's Open anything */
      if (mod && !e.shiftKey && e.code === "KeyK" && api.linkKey && api.linkKey()) { e.preventDefault(); e.stopPropagation(); return; }
      if (e.key === "/") { e.preventDefault(); api.open(b, e.currentTarget); }
      else if (e.key === "Enter" && !e.shiftKey && b.kind !== "code") { e.preventDefault(); api.lineAfter(b); }
    },
    onClick: (e) => { if (tail && !e.currentTarget.textContent) api.open(b, e.currentTarget); }
  });
}

function DocBlockCard({ art, children, meta }) {
  return (
    <div className="docs-doc-block-card-1">
      {art}
      <span className="docs-doc-block-card-2">{children}{meta ? <span className="docs-dc-row-4">{meta}</span> : null}</span>
    </div>
  );
}

function DocPageBlock({ b, api }) {
  const ed = (as, cls) => <DocEd b={b} as={as} cls={cls} api={api} />;
  const k = b.kind;
  if (k === "lead") return <div className="docs-doc-page-block-1">{ed("div")}</div>;
  if (k === "shot") return <MiniBlock b={["shot"]} />;
  if (k === "cards") return (
    <div className="docs-doc-page-block-2">
      {(b.items || []).map((t, i) => <div key={i} className="docs-pb-tile docs-pb-card-tile"><window.Art name="doc" size={24} /><span className="docs-dc-gallery-3">{t}</span></div>)}
    </div>);
  if (k === "h") return ed("h2", "docs-ed-h");
  if (k === "li") return <div className="docs-doc-page-block-3"><span className="docs-doc-page-block-4">•</span>{ed("div", "docs-ed-fill")}</div>;
  if (k === "todo") return (
    <div className="docs-doc-page-block-5">
      <span className={"docs-doc-page-block-6 docs-doc-page-block-s1" + (b.done ? " is-on" : "")} role="checkbox" aria-checked={!!b.done} onClick={() => api.toggle && api.toggle(b)}>{b.done ? <Icon name="check" size={11} /> : null}</span>
      {ed("div", "docs-ed-fill docs-ed-todo" + (b.done ? " is-done" : ""))}
    </div>);
  if (k === "quote") return <div className="docs-doc-page-block-7">{ed("div", "docs-ed-quote")}</div>;
  if (k === "callout") return <div className="docs-doc-page-block-8"><span className="docs-doc-page-block-9"><Icon name="alert-circle" size={16} /></span>{ed("div", "docs-ed-fill")}</div>;
  if (k === "rule") return <DcSep kind={api.sep} className="docs-sep-rule" />;
  if (k === "code") return <pre className="docs-doc-page-block-10">{ed("code", "docs-ed-code")}</pre>;
  if (k === "page") {
    const t = b.ref != null && window.docs && window.docs.find ? window.docs.find(b.ref) : null;
    return <div className={"docs-pb-tile docs-pb-line" + (t ? " is-link" : "")} role={t ? "link" : undefined} tabIndex={t ? 0 : undefined} data-doc-link={b.ref != null ? b.ref : ""}
      onClick={t ? () => window.docs.open(t.id) : undefined} onKeyDown={t ? (e) => { if (e.key === "Enter") window.docs.open(t.id); } : undefined}>
      <window.Art name="page" size={24} /><span className="docs-dc-gallery-3">{t ? t.title || "Untitled" : "Untitled page"}</span><span className="docs-doc-page-block-11"><Icon name="chevron-right" size={14} /></span></div>;
  }
  if (k === "date") return <span className="docs-pb-date" data-doc-date={(b.fmt && b.fmt.date) || ""}><Icon name="calendar-days" size={14} /><span>{b.text || docDateLabel(b.fmt && b.fmt.date)}</span></span>;
  if (k === "card") return <div className="docs-pb-tile docs-pb-subcard"><window.Art name="doc" size={32} /><span className="docs-dc-gallery-3">Untitled card</span><span className="docs-pb-meta">Opens as its own page</span></div>;
  if (k === "file") return <div className="docs-pb-tile docs-pb-line is-muted"><Icon name="paperclip" size={16} /><span className="docs-panel-tasks-3">Choose a file, or drop one here</span></div>;
  if (k === "image") return b.src ? <img className="docs-pb-img" src={b.src} alt="" draggable={false} data-doc-img="" />
    : <div className="docs-pb-tile docs-pb-image"><Icon name="image" size={22} /><span className="docs-panel-tasks-3">Add an image</span></div>;
  if (k === "task") return <DocBlockCard art={<span className="docs-doc-page-block-12" />} meta={b.meta || "Task · " + ((api.title && api.title()) || "Untitled") + " · Today"}>{ed("span", "docs-ed-medium")}</DocBlockCard>;
  if (k === "event") return <DocBlockCard art={<window.Art name="event" size={24} />} meta="Event · Today · 14:00 – 15:00">{ed("span", "docs-ed-medium")}</DocBlockCard>;
  if (k === "habit") return <DocBlockCard art={<window.Art name="habit" size={24} />} meta="Habit · Every day · 0 of 7 this week">{ed("span", "docs-ed-medium")}</DocBlockCard>;
  if (k === "ask") return <div className="docs-doc-page-block-13"><span className="docs-doc-page-block-14"><Icon name="sparkles" size={16} /></span>{ed("div", "docs-ed-fill docs-ed-ui")}</div>;
  if (k === "table") {
    // A table from the "/" menu starts with a header row; one from the store
    // is its own rows, every cell editable and written back.
    if (!b.rows) { b.rows = [["Name", "Status", "Due"], ["", "", ""], ["", "", ""]]; b.head = true; }
    const head = !!b.head;
    return (
      <div className="docs-doc-page-block-15">
        {b.rows.map((row, r) => <div className={"docs-doc-page-block-16" + (r ? " is-sep" : "") + (head && !r ? " is-head" : "")} key={r} style={{ gridTemplateColumns: "repeat(" + row.length + ", minmax(0, 1fr))" }}>
          {row.map((cell, c) => <span className={"docs-doc-page-block-17" + (c ? " is-sep" : "") + ((head && !r) || (!head && !c) ? " is-strong" : "")} key={c} contentEditable suppressContentEditableWarning
            onInput={(e) => { b.rows[r][c] = e.currentTarget.textContent; if (api.changed) api.changed(); }}>{cell}</span>)}
        </div>)}
      </div>);
  }
  if (k === "gallery") return <div className="docs-doc-page-block-18">{["Untitled", "Untitled", "Untitled"].map((t, i) => <div key={i} className="docs-pb-tile docs-pb-gallery">{t}</div>)}</div>;
  if (k === "board") return <div className="docs-doc-page-block-18">{["To do", "Doing", "Done"].map((t) => <div key={t} className="docs-pb-tile docs-pb-board"><span className="docs-pb-meta">{t}</span><span className="docs-doc-page-block-19" /></div>)}</div>;
  if (k === "suggest") return <>
    <div className="docs-doc-page-block-20">
      <span className="docs-doc-page-block-21" />
      <span>Move the Friday review to Thursday — Friday already holds two fixed events.</span>
    </div>
    <div className="docs-doc-page-block-22"><button type="button" className="nx-btn nx-btn-secondary nx-btn-sm">Accept</button><button type="button" className="nx-btn nx-btn-text nx-btn-sm">Dismiss</button></div></>;
  return ed("p", "docs-ed-p" + (b.muted ? " is-muted" : ""));
}

const DOC_BLOCK_GAP = { h: "4px 0 8px", task: "0 0 20px", suggest: "0 0 24px", lead: "0 0 24px" };

function DocSlashMenu({ at, leaving, onPick, onClose, onPanel }) {
  const [q, setQ] = React.useState("");
  const [i, setI] = React.useState(0);
  const listRef = React.useRef(null);
  const needle = q.trim().toLowerCase();
  const items = SLASH_ITEMS.filter((it) => !needle || it.label.toLowerCase().includes(needle) || it.kind.startsWith(needle) || (it.hint && it.hint === needle));
  const idx = Math.min(i, Math.max(items.length - 1, 0));
  React.useEffect(() => { const el = listRef.current && listRef.current.querySelector('[data-on="1"]'); if (el) el.scrollIntoView({ block: "nearest" }); }, [idx, needle]);
  function key(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setI((idx + 1) % Math.max(items.length, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setI((idx - 1 + items.length) % Math.max(items.length, 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[idx] ? onPick(items[idx].kind) : onPick("p", q); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(true); }
    else if (e.key === "Backspace" && !q) { e.preventDefault(); onClose(true); }
  }
  let last = null;
  return (
    <div className={"docs-doc-slash-menu-1" + (at.up ? " is-up" : "")} data-slash="1" onMouseDown={(e) => { if (e.target.tagName !== "INPUT") e.preventDefault(); e.stopPropagation(); }} onMouseUp={(e) => e.stopPropagation()}
      style={{ left: at.x, top: at.y }}>
    <div className={"docs-doc-slash-menu-2 " + "nx-pop" + (leaving ? " is-leaving" : "") + " docs-doc-slash-menu-s1" + (at.up ? " is-on" : "")}>
      <div className="docs-doc-slash-menu-3">
        <span className="docs-doc-slash-menu-4">/</span>
        <input className="docs-doc-slash-menu-5" autoFocus value={q} placeholder="Search blocks" onKeyDown={key}
          onChange={(e) => { setQ(e.target.value.replace(/^\//, "")); setI(0); }} />
        <span className="docs-doc-slash-menu-6">esc</span>
      </div>
      <div ref={listRef} className="scroll-inner docs-doc-slash-menu-7">
        {items.length ? items.map((it, n) => {
          const head = it.g !== last ? (last = it.g, <div className="docs-doc-slash-menu-8" key={"g" + it.g}>{it.g}</div>) : null;
          const on = n === idx;
          return <React.Fragment key={it.label}>{head}
            <div className={"docs-doc-slash-menu-9 docs-doc-slash-menu-s2" + (on ? " is-on" : "")} data-on={on ? "1" : "0"} onMouseMove={() => { if (!on) setI(n); }} onClick={() => onPick(it.kind)}>
              {it.art ? <span className="docs-doc-slash-menu-10"><window.Art name={it.art} size={24} /></span>
                : <span className="docs-doc-slash-menu-11"><Icon name={it.icon} size={14} /></span>}
              <span className="docs-doc-slash-menu-12">{it.label}</span>
              {it.hint ? <span className="docs-doc-slash-menu-13">{it.hint}</span> : null}
            </div></React.Fragment>;
        }) : <div className="docs-doc-slash-menu-14">No blocks match — Enter writes it as text</div>}
      </div>
      {onPanel ? <button type="button" className="docs-slash-foot" data-slash-panel="" onClick={onPanel}>
        <Icon name="sidebar-right" size={14} /><span className="docs-share-panel-9">All blocks in the Insert panel</span><span className="docs-slash-foot-kbd">{"⌘⌥\\"}</span>
      </button> : null}
    </div>
    </div>
  );
}

/* The title is the page's first line: typed here, it renames the card, the
   sidebar row and the breadcrumb as you go. */
function DocTitle({ doc, onEnter }) {
  const [init] = React.useState(doc ? doc.title || "" : "");
  return (
    <span contentEditable suppressContentEditableWarning spellCheck={false} className="nx-ed ph-always docs-doc-title-1" data-ph="Untitled" data-doc-title="" lang="de"
      onInput={(e) => { const el = e.currentTarget; if (!el.textContent) el.innerHTML = ""; if (doc) window.docs.patch(doc.id, { title: el.textContent, updated: "Just now" }); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter && onEnter(); } }}>{init}</span>
  );
}

function DocumentScreen({ onBack }) {
  const doc = window.useOpenDoc();
  const docId = doc ? doc.id : null;
  const [tab, setTab] = React.useState("insert");
  // The document's style (backdrop, page, text, cover, separator, font, wide)
  // lives on the doc itself, so the card, the thumb and this page agree.
  const s = dcStyleOf(doc);
  const font = dcFontOf(s.font);
  const bdOn = s.backdrop !== "none";
  const [rail, setRail] = React.useState(false);
  /* The right panel follows the shell's docPanel switch (window.__app.docPanel,
     announced by "needt-docpanel"); open unless it says otherwise. */
  const readPanel = () => { try { return !(window.__app && window.__app.docPanel === false); } catch (e) { return true; } };
  const [panelOpen, setPanelOpen] = React.useState(readPanel);
  React.useEffect(() => {
    const on = (e) => setPanelOpen(e && typeof e.detail === "boolean" ? e.detail : e && e.detail && typeof e.detail.open === "boolean" ? e.detail.open : readPanel());
    window.addEventListener("needt-docpanel", on);
    setPanelOpen(readPanel());
    return () => window.removeEventListener("needt-docpanel", on);
  }, []);
  /* Tablet (07.10.26): under 900 the inspector starts hidden (the top bar's
     panel toggle brings it back) and floats over the page instead of taking
     272px from it. The hiding itself is the shell's (App: transient, never
     saved); wide again, the saved preference applies. */
  const [narrowDoc, setNarrowDoc] = React.useState(() => window.innerWidth < 900);
  React.useEffect(() => {
    const fit = () => setNarrowDoc(window.innerWidth < 900);
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  /* The floating "Ask Needt" pill sits bottom-right; while the full right
     panel is shown it moves left of it instead of covering its foot. */
  React.useEffect(() => {
    const w = rail || !panelOpen || narrowDoc ? 0 : 252;
    window.__chatInset = w;
    window.dispatchEvent(new CustomEvent("needt:chat-inset", { detail: w }));
    return () => { window.__chatInset = 0; window.dispatchEvent(new CustomEvent("needt:chat-inset", { detail: 0 })); };
  }, [rail, panelOpen, narrowDoc]);
  React.useEffect(() => { dcLoadFonts(); }, []);
  // Backdrops cross-fade: the last one stays underneath while the new one fades in.
  const [bdLayers, setBdLayers] = React.useState([s.backdrop, s.backdrop]);
  if (bdLayers[1] !== s.backdrop) setBdLayers([bdLayers[1], s.backdrop]);
  const amb = dcAmbientFor(s);
  React.useEffect(() => { dtAmbient(amb); return () => dtAmbient(null); }, [amb ? amb.id : null]);
  const [sel, setSel] = React.useState(null);
  const selRef = React.useRef(null); selRef.current = sel;
  const pageRef = React.useRef(null);
  const [blocks, setBlocks] = React.useState(() => blocksForDoc(doc));
  const [loaded, setLoaded] = React.useState(docId);
  const saveT = React.useRef(null);
  const saveFor = React.useRef(null);
  const blocksRef = React.useRef(blocks);
  blocksRef.current = blocks;
  const dirty = React.useRef(false);
  // Edits reach the store a beat after the last keystroke; leaving the page
  // or switching to another one flushes what is pending first.
  const flush = React.useCallback(() => {
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
    if (!dirty.current || saveFor.current == null) return;
    dirty.current = false;
    window.docs.patch(saveFor.current, { body: blocksToBody(blocksRef.current), updated: "Just now" });
  }, []);
  const changed = () => { dirty.current = true; saveFor.current = docId; if (saveT.current) clearTimeout(saveT.current); saveT.current = setTimeout(flush, 400); };
  if (loaded !== docId) {
    // Another page was opened: save the last one (after this render), then load this one.
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
    if (dirty.current && saveFor.current != null) {
      dirty.current = false;
      const id = saveFor.current, body = blocksToBody(blocksRef.current);
      setTimeout(() => window.docs.patch(id, { body: body, updated: "Just now" }), 0);
    }
    setLoaded(docId);
    setBlocks(blocksForDoc(doc));
  }
  React.useEffect(() => () => flush(), [flush]);
  const edited = React.useRef(false);
  React.useEffect(() => { if (edited.current) { edited.current = false; changed(); } }, [blocks]);
  const setBlocksEdit = (f) => { edited.current = true; setBlocks(f); };
  const [slash, setSlash] = React.useState(null);
  const lastSlash = React.useRef(null);
  if (slash) lastSlash.current = slash;
  const [slashShown, slashLeaving] = window.useExit(!!slash, 130);
  const focusNext = React.useRef(null);
  React.useEffect(() => {
    const id = focusNext.current; focusNext.current = null;
    const el = id && pageRef.current && pageRef.current.querySelector('[data-bid="' + id + '"]');
    if (el) docFocusEnd(el);
  }, [blocks]);
  React.useEffect(() => {
    if (!slash) return undefined;
    const off = (e) => { if (!e.target.closest('[data-slash]') && !(e.target.closest('[data-bid]') && e.target.closest('[data-bid]').dataset.bid === slash.id)) setSlash(null); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [slash]);
  // The page always ends on an empty line you can type into.
  const withTail = (list) => { const l = list[list.length - 1]; return l && l.kind === "p" && docEmpty(l.text) ? list : list.concat(newDocBlock("p", "")); };
  /* ── marks over the selected words ── */
  const blockById = (id) => blocksRef.current.find((x) => x.id === id) || null;
  const edOf = (id) => (pageRef.current ? pageRef.current.querySelector('.nx-ed[data-bid="' + id + '"]') : null);
  /* the live selection, as the parts of each block it covers */
  const readSel = () => {
    const s = window.getSelection(), page = pageRef.current;
    if (!s || !s.rangeCount || s.isCollapsed || !page) return null;
    const r = s.getRangeAt(0), parts = [];
    page.querySelectorAll(".nx-ed[data-bid]").forEach((el) => {
      const o = dxRangeIn(el, r);
      if (o && o.end > o.start && blockById(el.getAttribute("data-bid"))) parts.push({ id: el.getAttribute("data-bid"), start: o.start, end: o.end });
    });
    if (!parts.length) return null;
    const rr = r.getBoundingClientRect(), box = page.getBoundingClientRect();
    return { x: rr.left + rr.width / 2 - box.left + page.scrollLeft, y: rr.top - box.top + page.scrollTop - 8, parts: parts };
  };
  const marksOfParts = (parts) => {
    let res = null;
    parts.forEach((p) => { const b = blockById(p.id); const m = b ? marksIn(b.text, p.start, p.end) : {}; if (!res) res = m; else Object.keys(res).forEach((k) => { if (res[k] !== m[k]) delete res[k]; }); });
    return res || {};
  };
  const reselect = (v) => {
    const first = v.parts[0], last = v.parts[v.parts.length - 1];
    const a = edOf(first.id), z = edOf(last.id);
    if (!a) return;
    try { a.focus({ preventScroll: true }); } catch (e) { a.focus(); }
    dxSelect(a, first.start, last.end, z || a);
  };
  /* mark: b | i | s | code | href | color | hl; value undefined = toggle */
  const markSel = (mark, value, given) => {
    const v = given || selRef.current || readSel();
    if (!v) return;
    const on = value !== undefined ? value : !marksOfParts(v.parts)[mark];
    v.parts.forEach((p) => {
      const b = blockById(p.id); if (!b) return;
      b.text = applyMark(b.text, p.start, p.end, mark, on);
      const el = edOf(p.id); if (el) el.innerHTML = spansToHtml(b.text);
    });
    reselect(v);
    changed();
    setSel(Object.assign({}, v, { marks: marksOfParts(v.parts), mode: null }));
  };
  const selMode = (mode, refocus) => {
    const v = selRef.current; if (!v) return;
    if (refocus) reselect(v);
    setSel(Object.assign({}, v, { mode: mode }));
  };
  /* ── Mention · Comment · Make a task (the bar's last three) ── */
  const selText = (v) => v.parts.map((p) => { const b = blockById(p.id); return b ? spansToText(sliceSpans(b.text, p.start, p.end)) : ""; }).join(" ").replace(/\s+/g, " ").trim();
  const setFmt = (b, patch) => {
    const f = Object.assign({}, b.fmt || {}, patch);
    Object.keys(f).forEach((k) => { if (f[k] == null) delete f[k]; });
    b.fmt = Object.keys(f).length ? f : undefined;
    setBlocksEdit((l) => l.slice());
  };
  const endSel = () => { setSel(null); try { window.getSelection().removeAllRanges(); } catch (e) { /* none */ } };
  /* The words become "@Name" — a mention span (mark at = the email) and a plain space after it. */
  const mentionSel = (p) => {
    const v = selRef.current; if (!v || !p) return;
    const part = v.parts[0], b = blockById(part.id); if (!b) return;
    const label = "@" + String(p.name || p.email).split(/\s+/)[0];
    b.text = applyMark(spliceText(b.text, part.start, part.end, label + " "), part.start, part.start + label.length, "at", p.email);
    b.text = applyMark(b.text, part.start + label.length, part.start + label.length + 1, "at", null);
    const el = edOf(part.id);
    if (el) { el.innerHTML = spansToHtml(b.text); try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } dxSelect(el, part.start + label.length + 1); }
    changed();
    setSel(null);
  };
  /* A comment on the block the selection starts in: { id, text, quote, by, at }. */
  const commentSel = (text) => {
    const v = selRef.current; if (!v || !text) return;
    const b = blockById(v.parts[0].id); if (!b) return;
    const before = (b.fmt && b.fmt.comments) || [];
    const c = { id: "cm" + Date.now().toString(36), text: text, quote: selText(v), by: "Maks", at: new Date().toISOString() };
    setFmt(b, { comments: before.concat([c]) });
    endSel();
    window.toast("Comment added", { undo: () => { const nb = blockById(b.id); if (nb) setFmt(nb, { comments: before.length ? before : null }); } });
  };
  /* The selected words become a task (the inbox; this page's project) linked
     both ways: task.source = { kind: "doc", docId, quote }, block fmt.task = { id, title }. */
  const taskSel = () => {
    const v = selRef.current || readSel(), A = window.__app, N = window.NEEDT;
    if (!v || !doc || !A || !A.setTasksRaw) return;
    const words = selText(v); if (!words) return;
    const title = words.length > 80 ? words.slice(0, 79) + "…" : words;
    const id = Date.now();
    A.setTasksRaw((l) => l.concat([N.sync({ id: id, title: title, projectId: doc.projectId || null, estimatedMinutes: 30, done: false, dueDate: null,
      source: { kind: "doc", docId: doc.id, quote: words } })]));
    const b = blockById(v.parts[0].id);
    if (b) setFmt(b, { task: { id: id, title: title } });
    endSel();
    window.toast("Task made · " + title, { undo: () => { A.setTasksRaw((l) => l.filter((t) => t.id !== id)); const nb = b && blockById(b.id); if (nb) setFmt(nb, { task: null }); } });
  };
  const people = React.useMemo(() => dcPeople(doc), [doc && doc.id, !!sel]);
  const api = {
    isTail: (b) => blocks[blocks.length - 1] === b,
    changed,
    mark: (m) => { const v = readSel(); if (v) markSel(m, undefined, v); },
    linkKey: () => { const v = readSel(); if (!v) return false; setSlash(null); setSel(Object.assign(v, { marks: marksOfParts(v.parts), mode: "link" })); return true; },
    title: () => doc && doc.title,
    sep: s.separator,
    toggle(b) { b.done = !b.done; setBlocksEdit((l) => l.slice()); },
    open(b, el) {
      const page = pageRef.current; if (!page) return;
      const s = window.getSelection();
      let r = s && s.rangeCount ? s.getRangeAt(0).getBoundingClientRect() : null;
      if (!r || (!r.width && !r.height)) r = el.getBoundingClientRect();
      const box = page.getBoundingClientRect();
      const x = Math.min(r.left - box.left + page.scrollLeft, page.clientWidth - 316);
      setSel(null);
      // Under the line when it fits, otherwise above it, like Craft.
      const up = box.bottom - r.bottom < 420 && r.top - box.top > box.bottom - r.bottom;
      setSlash({ id: b.id, x: Math.max(8, x), up, y: up ? r.top - box.top + page.scrollTop - 6 : r.bottom - box.top + page.scrollTop + 6 });
    },
    lineAfter(b) {
      const fresh = newDocBlock(b.kind === "li" || b.kind === "todo" ? b.kind : "p", "", { fresh: true });
      focusNext.current = fresh.id;
      setBlocksEdit((list) => { const n = list.indexOf(b); const out = list.slice(); out.splice(n + 1, 0, fresh); return withTail(out); });
    }
  };
  function closeSlash(refocus) {
    const id = slash && slash.id;
    setSlash(null);
    if (refocus && id) setTimeout(() => { const el = pageRef.current && pageRef.current.querySelector('[data-bid="' + id + '"]'); if (el) docFocusEnd(el); }, 0);
  }
  function pick(kind, text) {
    const id = slash && slash.id;
    setSlash(null);
    const made = newDocBlock(kind, text || "", { fresh: true });
    const tail = newDocBlock("p", "");
    focusNext.current = DOC_PH[kind] ? made.id : tail.id;
    setBlocksEdit((list) => {
      const n = list.findIndex((x) => x.id === id);
      const src = list[n];
      const out = list.slice();
      if (src && src.kind === "p" && docEmpty(src.text)) out.splice(n, 1, made); else out.splice(n < 0 ? out.length : n + 1, 0, made);
      const l = out[out.length - 1];
      return l && l.kind === "p" && docEmpty(l.text) ? out : out.concat(tail);
    });
  }
  /* Ask Needt's "Add to page" (Chat.jsx, cancelable "needt:doc-insert"):
     when this page is the one open, the blocks go into the live editor —
     not behind its back into the store — and the toast's undo puts the
     editor back the way it was. */
  const liveDoc = React.useRef(docId); liveDoc.current = docId;
  React.useEffect(() => {
    const on = (e) => {
      const d = e && e.detail;
      if (!d || d.docId == null || String(d.docId) !== String(liveDoc.current)) return;
      e.preventDefault();
      const before = blocksRef.current, id = liveDoc.current;
      const add = bodyToBlocks(d.body || []);
      setBlocksEdit((list) => {
        const out = list.slice();
        while (out.length && out[out.length - 1].kind === "p" && docEmpty(out[out.length - 1].text)) out.pop();
        return withTail(out.concat(add));
      });
      d.undo = () => { if (String(liveDoc.current) === String(id)) setBlocksEdit(() => before); else window.docs.patch(id, { body: blocksToBody(before) }); };
    };
    window.addEventListener("needt:doc-insert", on);
    return () => { liveDoc.current = null; window.removeEventListener("needt:doc-insert", on); };
  }, []);
  React.useEffect(() => {
    const t = () => setRail((r) => !r);
    window.addEventListener("needt-inspector", t);
    return () => window.removeEventListener("needt-inspector", t);
  }, []);
  // The tab is announced so the top bar's Insert button can show its state.
  React.useEffect(() => { window.__docInspectorTab = tab; window.dispatchEvent(new Event("needt-doc-tab")); }, [tab]);
  const insertState = React.useRef({}); insertState.current = { panelOpen, tab, rail };
  React.useEffect(() => {
    const on = (e) => {
      const app = window.__app, st = insertState.current;
      if (!app || !app.setDocPanel) return;
      if (e && e.detail && e.detail.toggle && st.panelOpen && st.tab === "insert" && !st.rail) { app.setDocPanel(false); return; }
      setTab("insert"); setRail(false);
      if (!st.panelOpen) app.setDocPanel(true);
    };
    window.addEventListener("needt-doc-insert", on);
    return () => window.removeEventListener("needt-doc-insert", on);
  }, []);
  function onUp() {
    const v = readSel();
    setSel(v ? Object.assign(v, { marks: marksOfParts(v.parts), mode: null }) : null);
  }
  const cardVars = Object.assign({}, dcVars(s), s.font !== "sans" ? { "--font-sans": font.css } : null);
  const panelW = rail ? 60 : 272;
  const tabs = [["insert", "Insert"], ["format", "Format"], ["style", "Style"], ["info", "Info"]];
  return (
    <div className="docs-document-screen-1">
      {/* The editor area: the backdrop fills it edge to edge (fixed while the
          page scrolls), the page is a card floating on it. */}
      <div className="docs-document-screen-2" data-dc-area="">
        {bdLayers[1] === "none"
          ? (bdLayers[0] !== "none" ? <div key={"out:" + bdLayers[0]} aria-hidden="true" className="dc-bd dc-bd-out docs-bd-layer" style={dcBdVars(bdLayers[0])} /> : null)
          : bdLayers.map((id, i) => id === "none" ? null : <div key={i + ":" + id} aria-hidden="true" className={"dc-bd docs-bd-layer" + (i ? " dc-bd-in" : "") + (s.bdBlur ? " is-blur" : "")} style={dcBdVars(id)} />)}
        {/* the phone's backdrop look (Page Style): Faded lays the page colour
            over the picture, Blur image softens it — style.bdLook / bdBlur */}
        {bdOn && s.bdLook === "faded" ? <div aria-hidden="true" className="docs-bd-fade" data-dc-faded="" style={dcVars(s)} /> : null}
      <div ref={pageRef} data-doc-page="" data-dc-backdrop={s.backdrop} data-dc-look={bdOn ? (s.bdLook === "faded" ? "faded" : "immersive") + (s.bdBlur ? " blur" : "") : undefined} onMouseUp={onUp} onMouseDown={() => setSel(null)} onKeyUp={(e) => { if (e.shiftKey || e.key === "Shift" || (sel && /^Arrow/.test(e.key))) onUp(); }} className={"scroll-inner docs-document-screen-3" + (bdOn ? " is-bd" : "") + (narrowDoc ? " is-narrow" : "")}>
        <article key={docId || "none"} data-doc-sheet="" data-dc-font={s.font} className={"dt-themed dc-card docs-sheet" + (bdOn ? " on-backdrop" : "") + (bdOn && s.bdLook === "faded" ? " is-faded" : "") + (s.wide ? " is-wide" : "")} style={Object.assign({ fontFamily: font.css }, cardVars)}>
          {s.cover ? <div data-doc-cover="" className="dc-cover-wrap docs-document-screen-4">
            <DcCover cover={s.cover} />
            <span className="dc-cover-tools docs-document-screen-5">
              <button type="button" className="nx-btn nx-btn-secondary nx-btn-sm" onClick={() => { const before = s.cover; dcSetStyle(doc, { cover: null }); window.toast("Cover removed", { undo: () => dcSetStyle(window.docs.find(doc.id) || doc, { cover: before }) }); }}>Remove</button>
            </span>
          </div> : null}
          <h1 className={"docs-document-screen-6" + (s.font === "serif" ? " is-serif" : "")} style={{ fontFamily: font.css }}><DocTitle doc={doc} onEnter={() => { const el = pageRef.current && pageRef.current.querySelector("[data-bid]"); if (el) docFocusEnd(el); }} /></h1>
          <DcSep kind={s.separator} className={"docs-sep-title" + (s.separator === "line" ? " is-line" : "")} />
          {blocks.map((b) => {
            const m = DOC_BLOCK_GAP[b.kind] || (b.mb ? "0 0 " + b.mb + "px" : "0 0 4px");
            const plain = b.kind === "h" || b.kind === "suggest" || b.kind === "rule";
            const remind = b.fmt && b.fmt.remind ? <span className="docs-pb-remind" data-doc-remind=""><Icon name="bell" size={12} />{b.fmt.remind.label}</span> : null;
            const tk = b.fmt && b.fmt.task ? <button type="button" className="docs-pb-remind is-task" data-doc-task={b.fmt.task.id} onClick={() => window.__app && window.__app.openTask && window.__app.openTask(b.fmt.task.id)}><Icon name="circle-check" size={12} />{b.fmt.task.title}</button> : null;
            const badges = remind || tk ? <span className="docs-pb-badges">{remind}{tk}</span> : null;
            const inner = badges ? <><DocPageBlock b={b} api={api} />{badges}</> : <DocPageBlock b={b} api={api} />;
            const cm = b.fmt && b.fmt.comments && b.fmt.comments.length ? <DocComments b={b} onChange={(list) => setFmt(b, { comments: list.length ? list : null })} /> : null;
            return <div key={b.id} className={(b.fresh ? "nx-swap " : "") + "docs-pb-row"} style={{ margin: m }}>{plain ? inner : <Block>{inner}</Block>}{cm}</div>;
          })}
        </article>
        <SelectionBar at={sel} onMark={(m, v) => markSel(m, v)} onMode={selMode} people={people} onMention={mentionSel} onComment={commentSel} onTask={taskSel} />
        {slashShown && lastSlash.current ? <DocSlashMenu key={lastSlash.current.id + ":" + lastSlash.current.x + ":" + lastSlash.current.y} at={lastSlash.current} leaving={slashLeaving} onPick={pick} onClose={closeSlash} onPanel={() => { closeSlash(false); dcOpenInsert(false); }} /> : null}
        <style>{ED_CSS}</style>
      </div>
      </div>

      <div data-dc-panel="" data-dc-panel-float={narrowDoc ? "" : undefined} aria-hidden={!panelOpen} className={"docs-inspector" + (panelOpen ? " is-open" : "")} style={{ width: panelOpen ? panelW : 0 }}>
      {rail ? (
        <aside className="docs-document-screen-7">
          {[["insert", "plus", "Insert"], ["format", "type", "Format"], ["style", "palette", "Style"], ["info", "alert-circle", "Info"]].map(([id, icon, l]) => (
            <IconButton key={id} label={l} variant="ghost" onClick={() => { setTab(id); setRail(false); }}><Icon name={icon} size={16} /></IconButton>
          ))}
        </aside>
      ) : <aside className="docs-document-screen-8">
        <div className="docs-dc-seg-1" role="tablist">
          {tabs.map(([id, l]) => {
            const on = tab === id;
            return <button className={"docs-document-screen-9 docs-document-screen-s1" + (on ? " is-on" : "")} key={id} type="button" role="tab" aria-selected={on} onClick={() => setTab(id)}>{l}</button>;
          })}
        </div>
        <div key={tab} className="scroll-inner nx-swap docs-document-screen-10">
          {tab === "insert" ? <InsertPanel /> : tab === "format" ? <FormatPanel /> : tab === "style" ? <DcStylePanel /> : <InfoPanel />}
        </div>
      </aside>}
      </div>
    </div>
  );
}

Object.assign(window, { DcDropMenu: DropMenu, DcSortMenuItems: SortMenuItems, DocsScreen, DocumentScreen, DocCard, DocPanel, DocTopRight });
