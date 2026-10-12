/* RICH POPOVERS — Craft's "New Doc / New Folder / From Template" menu, rebuilt
   for Needt (06.10.26). A row is a 40px illustration, a title at 15 and one
   line of why at 13; rows split by a hairline. Used wherever a choice starts
   something (new, import, make a task), never for plain commands — those stay
   in the compact Menu.

   The illustrations are drawn here, flat, in the token hues (one extra hue,
   VIOLET, for the template wand). No SF Symbols, no images, no gradients:
   depth comes from a second, darker tone of the same hue. */

const VIOLET = "oklch(0.62 0.19 300)";
const mix = (c, n, base) => "color-mix(in oklch, " + c + " " + n + "%, " + (base || "var(--surface-raised)") + ")";

function Art({ name, size }) {
  const z = size || 40;
  const A = "var(--accent)", I = "var(--info)", S = "var(--success)", D = "var(--destructive)", W = "var(--surface-raised)", R = "var(--border)";
  const g = {
    doc: (<g>
      <path d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill={W} stroke={R} strokeWidth="1" />
      <path d="M24 5v6a2 2 0 0 0 2 2h6z" fill="color-mix(in oklab, var(--text-primary) 6%, transparent)" />
      <rect x="13" y="19" width="5" height="2.4" rx="1.2" fill="color-mix(in oklab, var(--text-primary) 16%, transparent)" /><rect x="20" y="19" width="5" height="2.4" rx="1.2" fill="color-mix(in oklab, var(--text-primary) 16%, transparent)" />
      <rect x="13" y="24" width="12" height="2.4" rx="1.2" fill="color-mix(in oklab, var(--text-primary) 12%, transparent)" />
    </g>),
    folder: (<g>
      <path d="M5 11a3 3 0 0 1 3-3h7l3 3h14a3 3 0 0 1 3 3v15H5z" fill={mix(A, 70, "black")} />
      <rect x="5" y="15" width="30" height="19" rx="3.5" fill={mix(A, 45)} />
      <rect x="5" y="15" width="30" height="5" rx="2.5" fill={mix(A, 60)} />
    </g>),
    template: (<g>
      <path d="M9 33 24 15" stroke={mix(VIOLET, 70, "black")} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27 6.5l1.9 4.3 4.6.5-3.5 3.1 1 4.6-4-2.4-4 2.4 1-4.6-3.5-3.1 4.6-.5z" fill={mix(VIOLET, 75)} stroke={VIOLET} strokeWidth="1" strokeLinejoin="round" />
      <path d="M9 9l.9 2.1 2.1.9-2.1.9L9 15l-.9-2.1L6 12l2.1-.9z" fill={mix("oklch(0.76 0.15 70)", 80)} />
      <path d="M32 26l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" fill={mix("oklch(0.76 0.15 70)", 80)} />
    </g>),
    tune: (<g>
      <rect x="5" y="7" width="30" height="26" rx="6" fill={mix("var(--text-primary)", 8)} />
      {[[13, 15, 23], [20, 25, 14], [27, 15, 19]].map(([y, w, k], i) => (<g key={i}><rect x="10" y={y - 1.2} width="20" height="2.4" rx="1.2" fill={mix("var(--text-primary)", 22)} /><circle cx={k} cy={y} r="3.2" fill={W} stroke="var(--text-secondary)" strokeWidth="1.6" /></g>))}
    </g>),
    task: (<g>
      <rect x="6" y="6" width="28" height="28" rx="8" fill={mix(A, 30)} />
      <rect x="9" y="9" width="22" height="22" rx="6" fill={A} />
      <path d="M14.5 20.5l4 4 7.5-8.5" fill="none" stroke={W} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    event: (<g>
      <rect x="6" y="7" width="28" height="27" rx="5" fill={W} stroke={R} strokeWidth="1" />
      <path d="M11 7h18a5 5 0 0 1 5 5v2H6v-2a5 5 0 0 1 5-5z" fill={D} />
      <rect x="11" y="19" width="18" height="8" rx="2.5" fill={mix(A, 25)} /><rect x="11" y="19" width="2.5" height="8" rx="1.2" fill={A} />
    </g>),
    habit: (<g>
      <circle cx="20" cy="20" r="14" fill={mix(S, 22)} />
      <path d="M27.5 15A9 9 0 1 0 29 22" fill="none" stroke={S} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M24 13.6l4.4 1.5L29.6 10" fill="none" stroke={S} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    import: (<g>
      <path d="M6 22h7l2 4h10l2-4h7v8a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4z" fill={I} />
      <path d="M6 22l4-11a3 3 0 0 1 2.8-2h14.4a3 3 0 0 1 2.8 2l4 11h-7l-2 4H15l-2-4z" fill={mix(I, 40)} />
      <path d="M20 8v11m-4.5-4.5L20 19l4.5-4.5" fill="none" stroke={mix(I, 60, "black")} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    markdown: (<g>
      <rect x="4" y="9" width="32" height="22" rx="5" fill={W} stroke={R} strokeWidth="1" />
      <path d="M10 25v-10l4 5 4-5v10" fill="none" stroke="var(--text-secondary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 15v9m-3.5-3.5L27 24l3.5-3.5" fill="none" stroke={A} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    calendarfile: (<g>
      <path d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill={W} stroke={R} strokeWidth="1" />
      <rect x="12" y="17" width="16" height="13" rx="3" fill={mix(D, 18)} /><rect x="12" y="17" width="16" height="4" rx="2" fill={D} />
      <text x="20" y="28.4" textAnchor="middle" fontSize="6.5" fontWeight="700" fontFamily="Inter, system-ui, sans-serif" fill="var(--text-primary)">ICS</text>
    </g>),
    sheet: (<g>
      <rect x="7" y="6" width="26" height="28" rx="5" fill={W} stroke={R} strokeWidth="1" />
      <rect x="7" y="6" width="26" height="7" rx="3" fill={mix(I, 75)} />
      {[17, 22, 27].map((y) => <rect key={y} x="11" y={y} width="18" height="2.4" rx="1.2" fill="color-mix(in oklab, var(--text-primary) 12%, transparent)" />)}
      <rect x="18.5" y="15" width="1.4" height="16" fill="color-mix(in oklab, var(--text-primary) 10%, transparent)" />
    </g>),
    later: (<g>
      <rect x="5" y="9" width="30" height="23" rx="5" fill={mix(I, 30)} />
      <rect x="5" y="9" width="30" height="8" rx="4" fill={I} />
      <rect x="10" y="21" width="20" height="3" rx="1.5" fill={W} /><rect x="10" y="26" width="13" height="3" rx="1.5" fill={W} opacity=".7" />
    </g>),
    page: (<g>
      <rect x="8" y="5" width="24" height="30" rx="4" fill={W} stroke={R} strokeWidth="1" />
      <rect x="12" y="11" width="11" height="3" rx="1.5" fill="var(--text-secondary)" />
      {[17, 21, 25].map((y, i) => <rect key={y} x="12" y={y} width={[16, 13, 15][i]} height="2.2" rx="1.1" fill={[A, S, I][i]} />)}
    </g>),
    stack: (<g>
      <rect x="11" y="5" width="22" height="26" rx="4" fill={mix("var(--text-primary)", 10)} />
      <rect x="7" y="9" width="22" height="26" rx="4" fill={W} stroke={R} strokeWidth="1" />
      <rect x="11" y="15" width="10" height="3" rx="1.5" fill="var(--text-secondary)" />
      <rect x="11" y="21" width="14" height="2.2" rx="1.1" fill="color-mix(in oklab, var(--text-primary) 14%, transparent)" /><rect x="11" y="26" width="11" height="2.2" rx="1.1" fill="color-mix(in oklab, var(--text-primary) 14%, transparent)" />
    </g>),
    gdoc: (<g>
      <path d="M11 5h13l8 8v20a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z" fill={mix(A, 80)} />
      <path d="M24 5v6a2 2 0 0 0 2 2h6z" fill={mix(A, 50)} />
      {[19, 23, 27].map((y, i) => <rect key={y} x="13" y={y} width={[14, 14, 9][i]} height="2.4" rx="1.2" fill={W} />)}
    </g>),
    home: (<g>
      <path d="M8 18.5 20 8.5l12 10V31a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z" fill={mix(A, 30)} />
      <path d="M5.5 19.5 20 7l14.5 12.5" fill="none" stroke={A} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="16" y="22" width="8" height="12" rx="2" fill={A} />
    </g>),
    work: (<g>
      <rect x="11" y="6" width="24" height="18" rx="4" fill={mix(VIOLET, 35)} />
      <rect x="5" y="13" width="25" height="21" rx="4.5" fill={VIOLET} />
      <rect x="10" y="20" width="11" height="3" rx="1.5" fill={W} /><rect x="10" y="26" width="15" height="3" rx="1.5" fill={W} opacity=".7" />
    </g>),
    mail: (<g>
      <rect x="4" y="9" width="32" height="23" rx="4.5" fill={I} />
      <path d="M6 11.5 20 22l14-10.5" fill="none" stroke={W} strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </g>),
    trash: (<g>
      <rect x="9" y="12" width="22" height="23" rx="4" fill={mix("var(--text-primary)", 14)} />
      <rect x="6" y="8" width="28" height="5" rx="2.5" fill={mix("var(--text-primary)", 35)} />
      <rect x="16" y="5" width="8" height="4" rx="2" fill={mix("var(--text-primary)", 35)} />
      {[15, 20, 25].map((x) => <rect key={x} x={x - 1} y="17" width="2.4" height="13" rx="1.2" fill={mix("var(--text-primary)", 40)} />)}
    </g>),
    focus: (<g>
      <circle cx="20" cy="20" r="14" fill={mix(D, 22)} /><circle cx="20" cy="20" r="9.5" fill={W} /><circle cx="20" cy="20" r="5" fill={D} />
    </g>)
  }[name];
  return <svg className="shell-place-glyph-svg" width={z} height={z} viewBox="0 0 40 40" aria-hidden="true">{g}</svg>;
}

function RichRow({ it, onDone, last, i }) {
  const [hot, setHot] = React.useState(false);
  return (
    <div className="nx-swap shell-rich-row-row" onClick={() => { it.onClick && it.onClick(); onDone(); }} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ animationDelay: (40 + (i || 0) * 30) + "ms", background: hot ? "var(--fill-3)" : "transparent" }}>
      <span className="nx-art shell-sidebar-toggle-row-2" style={{ transform: hot ? "translateY(-1px) scale(1.04)" : "none" }}><Art name={it.art} /></span>
      <span className="base-stack shell-rich-row-stack">
        <span className="shell-whats-new-text-2">{it.title}</span>
        {it.sub ? <span className="shell-rich-row-text">{it.sub}</span> : null}
      </span>
      {it.kbd ? <span className="base-meta shell-rich-row-text-2">{it.kbd}</span> : null}
      {!last ? <span className="shell-rich-row-layer" aria-hidden="true" /> : null}
    </div>
  );
}

/* trigger: the element that opens it. items: [{ art, title, sub, kbd, onClick }].
   up: opens above (sidebar foot). block: the trigger fills its grid cell. */
/* Two sizes, by Craft's logic (checked 06.10.26):
   - big: only for the main "create" buttons (Docs "+", the New tile). 40px
     picture, title and one line of why, hairlines between rows.
   - small (`small`): everything else — import, convert, pick one of a few.
     Craft's compact list: an optional grey question on top (`prompt`), 32px
     rows at 13, but with our 20px pictures instead of bare text.
   Plain commands (sort, export, delete) stay in the compact text Menu. */
function SmallRow({ it, onDone, i }) {
  const [hot, setHot] = React.useState(false);
  return (
    <div className="nx-swap shell-small-row-menuitem" role="menuitem" onClick={() => { it.onClick && it.onClick(); onDone(); }} onMouseEnter={() => setHot(true)} onMouseLeave={() => setHot(false)}
      style={{ background: hot ? "var(--fill-3)" : "transparent", animationDuration: "220ms", animationDelay: (30 + i * 22) + "ms" }}>
      <span className="shell-small-row-row" style={{ transform: hot ? "scale(1.08)" : "none" }}><Art name={it.art} size={22} /></span>
      <span className="shell-small-row-span">{it.title}</span>
      {it.kbd ? <span className="base-meta shell-rich-row-text-2">{it.kbd}</span> : null}
    </div>
  );
}

function RichMenu({ trigger, items, width, align, up, block, small, prompt }) {
  const [open, setOpen] = React.useState(false);
  const [shown, leaving] = window.useExit(open, 130);
  const [at, setAt] = React.useState(null);
  const wrap = React.useRef(null);
  const panel = React.useRef(null);
  const w = width || (small ? 248 : 300);
  /* The panel is portalled to <body> and placed from the trigger's rect, so a
     sidebar's overflow can never clip it. */
  function place() {
    const r = wrap.current.getBoundingClientRect();
    let left = align === "right" ? r.right - w : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    setAt(up ? { left: left, bottom: window.innerHeight - r.top + 8 } : { left: left, top: r.bottom + 8 });
  }
  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (wrap.current && !wrap.current.contains(e.target) && !(panel.current && panel.current.contains(e.target))) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    const move = () => place();
    document.addEventListener("mousedown", away); document.addEventListener("keydown", esc); window.addEventListener("resize", move);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); window.removeEventListener("resize", move); };
  }, [open]);
  const body = shown && at ? ReactDOM.createPortal(
    <div ref={panel} role="menu" className={(up ? "nx-up" : "nx-pop") + (align === "right" ? " is-right" : "") + (leaving ? " is-leaving" : "")}
      style={Object.assign({ position: "fixed", zIndex: 1100, width: w, padding: 6, boxSizing: "border-box",
        borderRadius: small ? 14 : 18, background: "var(--surface-raised)", boxShadow: "var(--shadow-floating)", display: "flex", flexDirection: "column", gap: small ? 0 : 1,
        transformOrigin: (up ? "bottom " : "top ") + (align === "right" ? "right" : "left") }, at)}>
      {prompt ? <div className="shell-rich-menu-text">{prompt}</div> : null}
      {items.map((it, i) => it.sep ? <span className="shell-rich-menu-bar" key={"sep" + i} aria-hidden="true" />
        : small ? <SmallRow key={it.title} i={i} it={it} onDone={() => setOpen(false)} />
        : <RichRow key={it.title} i={i} it={it} last={i === items.length - 1} onDone={() => setOpen(false)} />)}
    </div>, document.body) : null;
  return (
    <span className="shell-mini-month-div" ref={wrap} style={{ display: block ? "block" : "inline-flex" }}>
      <span onClick={() => { if (!open) place(); setOpen(!open); }} style={{ display: block ? "block" : "inline-flex" }}>{typeof trigger === "function" ? trigger(open) : trigger}</span>
      {body}
    </span>
  );
}

Object.assign(window, { Art, RichMenu, VIOLET });
