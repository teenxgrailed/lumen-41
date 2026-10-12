/* SEARCH — the ⌘K sheet, rebuilt after Craft's search (06.10.26). One field
   finds docs, tasks and mail and runs commands; results come grouped, the
   match is set bold, and the keyboard never has to leave the field.
   Overrides Dialogs.jsx's CommandPalette through the global App renders. */
(function () {
  const NS = window.NeedtDesignSystem_25d3c8 || {};
  const Icon = NS.Icon || function () { return null; };
  const MAX = 6;

  /* Match: whole query > every word > letters in order. Returns a score and
     the character indices to set bold, or null. */
  function match(text, q) {
    const t = String(text || ""), lt = t.toLowerCase(), lq = q.toLowerCase().trim();
    if (!lq) return null;
    const at = lt.indexOf(lq);
    if (at > -1) {
      const wordStart = at === 0 || /[\s\-—_/(]/.test(lt[at - 1]);
      return { score: 100 - Math.min(at, 40) + (at === 0 ? 30 : wordStart ? 15 : 0), idx: range(at, lq.length) };
    }
    const words = lq.split(/\s+/).filter(Boolean);
    if (words.length > 1) {
      let idx = [], ok = true;
      words.forEach((w) => { const i = lt.indexOf(w); if (i < 0) ok = false; else idx = idx.concat(range(i, w.length)); });
      if (ok) return { score: 50, idx };
    }
    if (lq.length < 3) return null;
    /* Letters in order, but each must start a word or follow the last hit
       closely, so "cal" never matches a stray c…a…l across a sentence. */
    let idx = [], from = 0;
    for (let k = 0; k < lq.length; k++) {
      const ch = lq[k];
      if (ch === " ") continue;
      let i = lt.indexOf(ch, from);
      while (i > -1 && idx.length && i - idx[idx.length - 1] > 1 && !(i === 0 || /[\s\-—_/]/.test(lt[i - 1]))) i = lt.indexOf(ch, i + 1);
      if (i < 0) return null;
      idx.push(i); from = i + 1;
    }
    return { score: 20 - Math.min(idx[idx.length - 1] - idx[0], 19), idx };
  }
  function range(a, n) { const r = []; for (let i = 0; i < n; i++) r.push(a + i); return r; }

  function Hl({ text, idx }) {
    const t = String(text || "");
    if (!idx || !idx.length) return t;
    const set = new Set(idx), out = [];
    let buf = "", on = false;
    const flush = (k) => { if (!buf) return; out.push(on ? <b className="shell-notes-panel-b" key={k}>{buf}</b> : <span key={k}>{buf}</span>); buf = ""; };
    for (let i = 0; i < t.length; i++) { const h = set.has(i); if (h !== on) { flush(i); on = h; } buf += t[i]; }
    flush("e");
    return out;
  }

  const app = () => window.__app || {};

  function actions(onScreen) {
    const go = (id) => () => (app().setScreen || onScreen)(id);
    return [
      { id: "a-task", title: "New task", icon: "plus", kbd: "N", run: () => app().openComposer && app().openComposer(), home: true },
      { id: "a-doc", title: "New doc", icon: "pen-line", run: () => window.docs && window.docs.newDoc ? window.docs.newDoc() : go("doc")(), home: true },
      { id: "a-cal", title: "Go to Calendar", icon: "calendar", kbd: "G C", run: go("calendar"), home: true },
      { id: "a-mail", title: "Go to Mailbox", icon: "mail", run: go("mail"), home: true },
      { id: "a-today", title: "Go to Today", icon: "sun", run: go("today") },
      { id: "a-tasks", title: "Go to Tasks", icon: "list-checks", kbd: "G T", run: go("tasks") },
      { id: "a-work", title: "Go to Projects", icon: "folder-kanban", kbd: "G W", run: go("projects") },
      { id: "a-mood", title: "Go to Moodboards", icon: "image", run: go("moodboards") },
      { id: "a-docs", title: "Go to Documents", icon: "file-text", run: go("docs") },
      { id: "a-habits", title: "Go to Habits", icon: "repeat", run: go("habits") },
      { id: "a-tpl", title: "Go to Templates", icon: "layout-template", run: go("templates") },
      { id: "a-trash", title: "Go to Trash", icon: "trash-2", run: go("trash") },
      { id: "a-side", title: "Toggle sidebar", icon: "sidebar-left", kbd: "⌘\\", run: () => app().toggleSidebar && app().toggleSidebar(), home: true },
      { id: "a-set", title: "Settings", icon: "settings", kbd: "⌘,", run: go("settings"), home: true }
    ];
  }

  function Lead({ kind, item }) {
    const box = { width: 24, height: 24, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" };
    if (kind === "doc") return <span style={box}>{window.DocThumb ? <window.DocThumb doc={item} w={18} h={23} /> : <window.Art name="doc" size={24} />}</span>;
    if (kind === "mail") return <span style={box}><window.Art name="mail" size={24} /></span>;
    if (kind === "task") return (
      <span style={box}><span className="shell-lead-row" style={{ borderRadius: 5, border: item.done ? "none" : "1.5px solid var(--text-quaternary)", background: item.done ? "var(--text-tertiary)" : "transparent" }}>{item.done ? <Icon name="check" size={10} /> : null}</span></span>
    );
    return <span style={Object.assign({}, box, { borderRadius: 7, background: "var(--fill-2)", color: "var(--text-secondary)" })}><Icon name={item.icon} size={14} /></span>;
  }

  function Kbd({ children }) {
    return <span className="shell-kbd-span">{children}</span>;
  }

  function SearchPalette({ open, onClose, onScreen, tasks }) {
    const [mounted, leaving] = window.useExit ? window.useExit(open, 170) : [open, false];
    const [q, setQ] = React.useState("");
    const [sel, setSel] = React.useState(0);
    const list = React.useRef(null);
    const docs = window.useDocs ? window.useDocs() : (window.docStore ? window.docStore.get() : []);

    React.useEffect(() => { if (open) { setQ(""); setSel(0); } }, [open]);

    const query = q.trim();
    const groups = React.useMemo(() => {
      const acts = actions(onScreen);
      const liveDocs = (docs || []).filter((d) => !d.trashedAt);
      if (!query) {
        return [
          { label: "Recent", kind: "doc", rows: liveDocs.filter((d) => d.title).slice(0, 4).map((d) => ({ kind: "doc", item: d, title: d.title, meta: d.viewed || d.updated || "" })) },
          { label: "Actions", kind: "action", rows: acts.filter((a) => a.home).map((a) => ({ kind: "action", item: a, title: a.title, kbd: a.kbd })) }
        ];
      }
      const rank = (arr, get) => arr.map((x) => { const m = match(get(x), query); return m ? { x, m } : null; }).filter(Boolean)
        .sort((a, b) => b.m.score - a.m.score).slice(0, MAX);
      const taskList = (app().tasksNow || tasks || []);
      /* MailThread rows still in the inbox (not archived, not in Trash; never
         drafts or sent — liveMail skips rows with a folder); Sent is its own group. */
      const mail = window.mailApi ? window.mailApi.live() : [];
      const sent = window.mailApi && window.mailApi.folder ? window.mailApi.folder(window.mailApi.list(), "sent") : [];
      const when = (x) => (window.NEEDT.mailDayLabel(x.receivedAt) === "Today" ? window.NEEDT.mailTime(x.receivedAt) : window.NEEDT.mailDayLabel(x.receivedAt));
      return [
        { label: "Docs", rows: rank(liveDocs, (d) => d.title || "Untitled").map(({ x, m }) => ({ kind: "doc", item: x, title: x.title || "Untitled", idx: m.idx, meta: window.NEEDT.projectName(x) || x.updated || "" })) },
        { label: "Tasks", rows: rank(taskList, (t) => t.title).map(({ x, m }) => ({ kind: "task", item: x, title: x.title, idx: m.idx, meta: [window.NEEDT.projectName(x), window.NEEDT.dueLabel(x)].filter(Boolean).join(" · ") })) },
        { label: "Mailbox", rows: rank(mail, (e) => e.subject + "  " + e.from).map(({ x, m }) => {
          const n = x.subject.length;
          return { kind: "mail", item: x, title: x.subject, idx: m.idx.filter((i) => i < n), meta: x.from + " · " + when(x) };
        }) },
        { label: "Sent", rows: rank(sent, (e) => (e.subject || "(no subject)") + "  " + (e.to || []).map((r) => r.name || r.email).join(" ")).map(({ x, m }) => {
          const t = x.subject || "(no subject)", n = t.length;
          return { kind: "mail", item: x, title: t, idx: m.idx.filter((i) => i < n), meta: "To " + window.mailApi.names(x.to || []) + " · " + when(x) };
        }) },
        { label: "Actions", rows: rank(acts, (a) => a.title).map(({ x, m }) => ({ kind: "action", item: x, title: x.title, idx: m.idx, kbd: x.kbd })) }
      ].filter((g) => g.rows.length);
    }, [query, docs, tasks, open]);

    const flat = [];
    groups.forEach((g) => g.rows.forEach((r) => flat.push(r)));
    const cur = Math.min(sel, Math.max(0, flat.length - 1));

    React.useEffect(() => { setSel(0); if (list.current) list.current.scrollTop = 0; }, [query]);
    React.useEffect(() => {
      const el = list.current && list.current.querySelector('[data-sx="' + cur + '"]');
      if (el) el.scrollIntoView({ block: "nearest" });
    }, [cur]);

    if (!mounted) return null;

    function activate(r) {
      if (!r) return;
      onClose();
      const a = app(), go = a.setScreen || onScreen;
      if (r.kind === "doc") { if (window.docs && window.docs.open) window.docs.open(r.item.id); else go("doc"); }
      else if (r.kind === "task") { if (a.openTask) a.openTask(r.item.id); }
      else if (r.kind === "mail") { window.__searchMail = r.item.id; go("mail"); }
      else if (r.item && r.item.run) r.item.run();
    }

    function onKey(e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (flat.length) setSel((cur + 1) % flat.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); if (flat.length) setSel((cur - 1 + flat.length) % flat.length); }
      else if (e.key === "Enter") { e.preventDefault(); activate(flat[cur]); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    }

    let n = -1;
    return (
      <div className={"shell-search-palette-search-scrim " + "nx-scrim" + (leaving ? " is-leaving" : "")} data-search-scrim=""
       
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className={"shell-search-palette-search " + "nx-sheet" + (leaving ? " is-leaving" : "")} role="dialog" aria-label="Search"
         >
          <div className="shell-search-palette-row">
            <span className="shell-notes-panel-row-2"><Icon name="search" size={17} /></span>
            <input className="shell-search-palette-search-2" autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} spellCheck={false}
              placeholder="Search docs, tasks, mail or type a command" aria-label="Search"
              />
            <Kbd>esc</Kbd>
          </div>

          <div className="shell-search-palette-div" ref={list}>
            {flat.length ? (
              <div key={query ? "q:" + query : "home"}>
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="shell-search-palette-text">{g.label}</div>
                    {g.rows.map((r) => {
                      n += 1;
                      const i = n, on = i === cur;
                      return (
                        <div className="nx-swap shell-search-palette-sx" key={r.kind + ":" + r.item.id} data-sx={i} role="option" aria-selected={on}
                          onMouseMove={() => { if (sel !== i) setSel(i); }} onClick={() => activate(r)}
                          style={{ background: on ? "var(--fill-3)" : "transparent", animationDelay: Math.min(i * 16, 160) + "ms" }}>
                          <Lead kind={r.kind} item={r.item} />
                          <span className="shell-search-palette-span" style={{ color: query ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: r.kind === "task" && r.item.done ? "line-through" : "none" }}>
                            <Hl text={r.title} idx={r.idx} />
                          </span>
                          {r.meta ? <span className="shell-search-palette-span-2">{r.meta}</span> : null}
                          {r.kbd ? <Kbd>{r.kbd}</Kbd> : null}
                          {on ? <span className="shell-search-palette-span-3">↵</span> : <span className="shell-search-palette-span-4" />}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div key={"none:" + query} className="nx-swap shell-search-palette-swap">
                <span className="shell-search-palette-span-5"><window.Art name="stack" size={44} /></span>
                <div className="shell-search-palette-text-2">No results for “{query}”</div>
                <div className="shell-search-palette-text-3">Try fewer letters, or a doc, task or sender name.</div>
              </div>
            )}
          </div>

          <div className="shell-search-palette-row-2">
            <span className="shell-search-palette-row-3"><Kbd>↑</Kbd><Kbd>↓</Kbd>Move</span>
            <span className="shell-search-palette-row-3"><Kbd>↵</Kbd>Open</span>
            <span className="shell-notes-panel-stack-3" />
            <span>{query ? flat.length + (flat.length === 1 ? " result" : " results") : "Docs, tasks, mail"}</span>
          </div>
        </div>
      </div>
    );
  }

  /* Dialogs.jsx loads after this file and assigns its own CommandPalette, so
     keep re-asserting ours until the app has mounted (App.jsx runs after
     Dialogs.jsx, so by then nothing will overwrite it again). */
  window.SearchPalette = SearchPalette;
  window.CommandPalette = SearchPalette;
  let tries = 0;
  const iv = setInterval(() => {
    if (window.CommandPalette !== SearchPalette) window.CommandPalette = SearchPalette;
    if ((window.__app && tries > 2) || ++tries > 300) clearInterval(iv);
    else if (window.__app) tries++;
  }, 30);
})();
