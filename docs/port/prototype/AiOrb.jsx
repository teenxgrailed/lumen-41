/* AI ORB — the mark for Needt's AI (Ask Needt, the brief's Needt author, the
   phone's Ask sheet). Drawn in the family of the sidebar place glyphs: a
   dimensional coloured picture on a soft tinted round tile.

   Motif: a small glowing sphere in the sky's colours — a fixed blue → lilac →
   pink iridescence taken from the sky moods (tokens --orb-*, themes.css). It
   does NOT follow the accent: the AI is the one thing that keeps the sky's
   colour wherever it appears.

   Motion (08.10.26, owner: "animations only on enter / hover / action; at
   rest a still frame"): the orb is a still frame at rest — no CSS loop runs
   (styles/chat.css switches base.css's infinite turn/breathe off). It moves
   only (1) once on mount: the film settles in from −60° while the halo
   swells and returns; (2) for one cycle (one 9 s turn, one 7 s breath) when
   its button (or the orb) is hovered or focused; (3) while `active` (Needt
   thinking / streaming): the film turns once every 9 s and the halo breathes
   on a 7 s cycle, as before. When that ends (or the pointer leaves early), the film finishes its turn to the nearest rest angle and the halo
   eases home, then every animation is cancelled. Under
   prefers-reduced-motion nothing plays.

   API  <AiOrb size={20} tile={true} label active />   window.AiOrb
     size   rendered px (16–40; the drawing is a 40-unit box)
     tile   false drops the tinted round tile (on a coloured ground)
     label  aria-label; without it the orb is decorative (aria-hidden)
     active true while the AI is working (thinking / streaming) */
let aiOrbSeq = 0;
const aiOrbCalm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
const AI_ORB_TURN = 9000, AI_ORB_BREATHE = 7000;
const AI_ORB_EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
/* Starts and ends on the rest frame (opacity 1, scale 1) so the loop can be
   entered and left without a jump; the swing is base.css's 0.7/0.96 → 1/1.04. */
const AI_ORB_GLOW_LOOP = [
  { opacity: 1, transform: "scale(1)" },
  { opacity: 0.7, transform: "scale(0.96)", offset: 0.3 },
  { opacity: 1, transform: "scale(1.04)", offset: 0.75 },
  { opacity: 1, transform: "scale(1)" }
];
function aiOrbMotion(film, glow) {
  let loop = null, glowLoop = null, settle = [];
  const clear = () => { settle.forEach((a) => a.cancel()); settle = []; };
  const angle = () => {
    if (!loop) return 0;
    const t = Number(loop.currentTime) || 0;
    return (t % AI_ORB_TURN) / AI_ORB_TURN * 360;
  };
  return {
    enter() {
      if (aiOrbCalm() || !film.animate) return;
      clear();
      const a = film.animate([{ transform: "rotate(-60deg)" }, { transform: "rotate(0deg)" }], { duration: 1400, easing: AI_ORB_EASE });
      const b = glow.animate([{ opacity: 0.7, transform: "scale(0.96)" }, { opacity: 1, transform: "scale(1.04)", offset: 0.55 }, { opacity: 1, transform: "scale(1)" }], { duration: 1400, easing: "ease-in-out" });
      settle = [a, b];
      a.onfinish = () => a.cancel(); b.onfinish = () => b.cancel();
    },
    /* forever: true while the AI works; false plays one cycle (hover). */
    start(forever) {
      if (aiOrbCalm() || !film.animate) return;
      if (loop) {
        if (forever) { loop.effect.updateTiming({ iterations: Infinity }); glowLoop.effect.updateTiming({ iterations: Infinity }); loop.onfinish = null; }
        return;
      }
      clear();
      const n = forever ? Infinity : 1;
      loop = film.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], { duration: AI_ORB_TURN, iterations: n });
      glowLoop = glow.animate(AI_ORB_GLOW_LOOP, { duration: AI_ORB_BREATHE, iterations: n, easing: "ease-in-out" });
      if (!forever) {
        const l = loop, g = glowLoop;
        l.onfinish = () => { l.cancel(); g.cancel(); if (loop === l) { loop = null; glowLoop = null; } };
      }
    },
    looping() { return !!loop && loop.effect.getTiming().iterations === Infinity; },
    stop() {
      if (!loop) return;
      /* Finish the turn (to 360° = the rest angle) and ease the halo home,
         then nothing is left running. */
      const from = angle();
      const cs = getComputedStyle(glow);
      const gFrom = { opacity: cs.opacity, transform: cs.transform === "none" ? "scale(1)" : cs.transform };
      loop.cancel(); glowLoop.cancel(); loop = null; glowLoop = null;
      const left = 360 - from;
      const a = film.animate([{ transform: "rotate(" + from + "deg)" }, { transform: "rotate(360deg)" }], { duration: Math.max(240, Math.min(900, left * 5)), easing: "cubic-bezier(0.3, 0.6, 0.3, 1)" });
      const b = glow.animate([gFrom, { opacity: 1, transform: "scale(1)" }], { duration: 420, easing: "ease-out" });
      settle = [a, b];
      a.onfinish = () => a.cancel(); b.onfinish = () => b.cancel();
    },
    dispose() { clear(); if (loop) loop.cancel(); if (glowLoop) glowLoop.cancel(); loop = null; glowLoop = null; }
  };
}
function AiOrb({ size, tile, label, className, active }) {
  const z = size || 20;
  /* Gradient ids must be unique per instance; useId's colons are dropped so
     url(#…) never needs escaping. */
  const rid = React.useId ? React.useId() : null;
  const ref = React.useRef(null);
  if (!ref.current) ref.current = "aio" + (rid ? rid.replace(/[^a-zA-Z0-9]/g, "") : String(++aiOrbSeq));
  const id = ref.current;
  const u = (k) => "url(#" + id + k + ")";
  const svg = React.useRef(null), film = React.useRef(null), glow = React.useRef(null);
  const motion = React.useRef(null);
  const hot = React.useRef({ hover: false, active: false });
  const sync = () => {
    const m = motion.current; if (!m) return;
    if (hot.current.active) m.start(true);
    else if (hot.current.hover && !m.looping()) m.start(false);
    else m.stop();
  };
  React.useEffect(() => {
    const m = motion.current = aiOrbMotion(film.current, glow.current);
    m.enter();
    /* Hover / focus on the control the orb sits in (the Ask pill), or on the
       orb itself when it stands alone. */
    const el = svg.current;
    const host = (el.parentElement && el.parentElement.closest("button, a, [role=button]")) || el;
    const on = () => { hot.current.hover = true; sync(); };
    const off = () => { hot.current.hover = false; sync(); };
    host.addEventListener("pointerenter", on); host.addEventListener("pointerleave", off);
    host.addEventListener("focusin", on); host.addEventListener("focusout", off);
    return () => {
      host.removeEventListener("pointerenter", on); host.removeEventListener("pointerleave", off);
      host.removeEventListener("focusin", on); host.removeEventListener("focusout", off);
      m.dispose(); motion.current = null;
    };
  }, []);
  React.useEffect(() => { hot.current.active = !!active; sync(); }, [!!active]);
  return (
    <svg ref={svg} className={"ai-orb" + (className ? " " + className : "")} width={z} height={z} viewBox="0 0 40 40"
      role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : "true"} focusable="false">
      <defs>
        {/* the body: lit top-left, deep sky blue at the far side */}
        <radialGradient id={id + "b"} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" className="ai-orb-s-hi" />
          <stop offset="0.42" className="ai-orb-s-blue" />
          <stop offset="1" className="ai-orb-s-deep" />
        </radialGradient>
        {/* iridescent film: pink, lilac and a pale blue that turn inside */}
        <radialGradient id={id + "p"}><stop offset="0" className="ai-orb-s-pink" /><stop offset="1" className="ai-orb-s-pink ai-orb-s-0" /></radialGradient>
        <radialGradient id={id + "l"}><stop offset="0" className="ai-orb-s-lilac" /><stop offset="1" className="ai-orb-s-lilac ai-orb-s-0" /></radialGradient>
        <radialGradient id={id + "c"}><stop offset="0" className="ai-orb-s-pale" /><stop offset="1" className="ai-orb-s-pale ai-orb-s-0" /></radialGradient>
        {/* specular highlight and the rim of reflected light */}
        <radialGradient id={id + "h"} cx="0.5" cy="0.5" r="0.5"><stop offset="0" className="ai-orb-s-spec" /><stop offset="1" className="ai-orb-s-spec ai-orb-s-0" /></radialGradient>
        <radialGradient id={id + "r"} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.78" className="ai-orb-s-rim ai-orb-s-0" />
          <stop offset="0.97" className="ai-orb-s-rim" />
          <stop offset="1" className="ai-orb-s-rim ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={id + "g"} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.45" className="ai-orb-s-glow" />
          <stop offset="1" className="ai-orb-s-glow ai-orb-s-0" />
        </radialGradient>
        <clipPath id={id + "k"}><circle cx="20" cy="20" r="12.6" /></clipPath>
      </defs>
      {tile === false ? null : <circle className="ai-orb-tile" cx="20" cy="20" r="20" />}
      <circle ref={glow} className="ai-orb-glow" cx="20" cy="20" r="18" fill={u("g")} />
      <circle cx="20" cy="20" r="12.6" fill={u("b")} />
      <g clipPath={u("k")}>
        <g ref={film} className="ai-orb-film">
          <ellipse cx="27" cy="25.5" rx="10" ry="7.5" fill={u("p")} />
          <ellipse cx="12.5" cy="26" rx="8" ry="7" fill={u("l")} />
          <ellipse cx="24" cy="11" rx="8" ry="5.5" fill={u("c")} />
        </g>
        <circle cx="20" cy="20" r="12.6" fill={u("r")} />
      </g>
      <ellipse cx="15.2" cy="13.6" rx="5.4" ry="3.4" transform="rotate(-32 15.2 13.6)" fill={u("h")} />
      <circle className="ai-orb-spark" cx="13.4" cy="12.6" r="1.25" />
    </svg>
  );
}

Object.assign(window, { AiOrb });
