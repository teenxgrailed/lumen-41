/* THE AGENT'S CURSOR — the app's own hand, visible.
 *
 * When something in the product moves by itself, the person is left with a
 * changed screen and no account of who changed it. A visible cursor answers
 * that in the only way that cannot be misread: it goes to the thing and does
 * the thing, in the open, at human speed.
 *
 * MOTION. A hand, not a spring.
 *
 * A damped spring was the obvious model and it is the wrong one: given a
 * sideways push it returns to line by oscillating, so the cursor swayed on
 * every trip. People do not sway. A human reach has a measured shape — a fast
 * ballistic launch that covers most of the distance, then a short corrective
 * approach that lands without overshoot — and its velocity profile is the
 * minimum-jerk curve, 10t³ − 15t⁴ + 6t⁵. That is what is used here, over a
 * duration set by distance the way Fitts's law sets it: far targets take
 * longer, but far from proportionally longer.
 *
 * The path bows by a fixed perpendicular control point, decided once at
 * departure. A constant curve cannot argue with the easing, which is the
 * other half of why the old version wobbled as it arrived.
 *
 * Three things make it smooth rather than jittery, and all three were wrong in
 * the first version:
 *
 * It is driven by REAL TIME, so the trip takes the same 540ms on a 60Hz screen
 * and a 144Hz one and a dropped frame costs nothing. And the position is
 * written STRAIGHT TO THE ELEMENT as a transform: through React state it
 * re-rendered the cursor tree 120 times a second, and through left/top it made
 * the browser redo layout on every one of those frames.
 *
 * IT FINISHES WHAT IT STARTED. A half-done action is a worse state than either
 * end of it — a task neither placed nor left alone — so the run completes and
 * then the cursor leaves. What it does is small and undoable; that is what
 * makes finishing safe.
 *
 * The cursor is white and unnamed: it is the app acting, and the app does not
 * need a face. Which agent asked for the action is already said in the brief,
 * in that agent's own ink.
 */

/* How long a reach takes, by distance. Fitts's law in the shape that matters
   here: a fixed cost to start moving, plus a term that grows with distance but
   far slower than distance does — so crossing the whole screen is not five
   times the trip of crossing a fifth of it. Faster than a person, because
   watching an app be slow on purpose is its own insult. */
function acDuration(dist) {
  return Math.max(300, Math.min(760, 210 + 190 * Math.log2(dist / 90 + 1)));
}
/* The minimum-jerk profile: the measured velocity curve of a human reach —
   nothing at the ends, everything in the middle, no overshoot to correct. */
function acEase(t) { return t * t * t * (10 + t * (-15 + 6 * t)); }
const acCalm = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
/* How far the path bows off the straight line, as a share of its length. */
const AC_ARC = 0.11;

function acCenter(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r };
}

function AgentCursor() {
  const [run, setRun] = React.useState(null);
  const [held, setHeld] = React.useState(null);
  const [say, setSay] = React.useState(null);
  const [press, setPress] = React.useState(false);
  const [phase, setPhase] = React.useState("in");
  const state = React.useRef({ x: 0, y: 0, vx: 0, vy: 0, t0: 0, from: null });
  /* The three things that move together: the arrow, what it carries, what it
     says. One write per frame, no render. */
  const arrow = React.useRef(null);
  const load = React.useRef(null);
  const bubble = React.useRef(null);

  function place(x, y) {
    if (arrow.current) arrow.current.style.transform = "translate3d(" + x + "px," + y + "px,0)";
    if (load.current) load.current.style.transform = "translate3d(" + (x + 15) + "px," + (y + 19) + "px,0) rotate(-1.5deg)";
    if (bubble.current) bubble.current.style.transform = "translate3d(" + (x + 22) + "px," + (y - 9) + "px,0)";
  }

  /* One entry point: a script of steps, each naming a target and an act. */
  React.useEffect(() => {
    window.__agent = {
      run(steps, opts) { setRun({ steps: steps.slice(), i: 0, opts: opts || {} }); },
      busy() { return !!run; }
    };
  });

  React.useEffect(() => {
    if (!run) return undefined;
    let alive = true;
    let frame = 0;

    /* The cursor starts where the chat button is — the app's hand comes out of
       the place you would have asked from. */
    const shell = document.querySelector("[data-agent-anchor]");
    const box = shell ? shell.getBoundingClientRect() : null;
    const home = box
      ? { x: box.right - 58, y: box.bottom - 20 }
      : { x: window.innerWidth - 78, y: window.innerHeight - 40 };
    if (!state.current.t0) {
      state.current.x = home.x; state.current.y = home.y;
      state.current.vx = 0; state.current.vy = 0; state.current.t0 = 1;
    }
    place(state.current.x, state.current.y);
    setPhase("in");

    function reach(target, then) {
      const s = state.current;
      const ax = s.x, ay = s.y;
      const dx = target.x - ax, dy = target.y - ay;
      const len = Math.hypot(dx, dy);
      /* Reduced motion: the hand is placed, not flown. */
      if (len < 2 || acCalm()) { s.x = target.x; s.y = target.y; place(s.x, s.y); return then(); }

      /* The control point: half way along, pushed perpendicular. Which side it
         bows to alternates, so a sequence of steps does not trace the same
         hook over and over — a person's hand does not repeat itself exactly. */
      const bow = Math.min(len * AC_ARC, 52) * (s.side = -(s.side || -1));
      const cx = ax + dx / 2 + (-dy / len) * bow;
      const cy = ay + dy / 2 + (dx / len) * bow;

      const ms = acDuration(len);
      let t0 = 0;
      function step(now) {
        if (!alive) return;
        if (!t0) t0 = now;
        const p = Math.min((now - t0) / ms, 1);
        const e = acEase(p);
        /* One quadratic bezier, evaluated at the eased time. The shape is
           fixed before the first frame, so nothing can wobble at the end. */
        const u = 1 - e;
        s.x = u * u * ax + 2 * u * e * cx + e * e * target.x;
        s.y = u * u * ay + 2 * u * e * cy + e * e * target.y;
        place(s.x, s.y);
        if (p >= 1) { s.x = target.x; s.y = target.y; place(s.x, s.y); return then(); }
        frame = window.requestAnimationFrame(step);
      }
      frame = window.requestAnimationFrame(step);
    }

    function type(el, text, done) {
      let n = 0;
      const native = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
      function tick() {
        if (!alive) return;
        n += 1;
        if (native && el.tagName === "INPUT") {
          native.set.call(el, text.slice(0, n));
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } else { el.textContent = text.slice(0, n); }
        if (n < text.length) window.setTimeout(tick, 34); else window.setTimeout(done, 260);
      }
      tick();
    }

    function play(i) {
      if (!alive) return;
      const steps = run.steps;
      if (i >= steps.length) {
        /* Home, then into the button — the hand does not linger on the work,
           and it does not vanish mid-air either. */
        setSay(null); setHeld(null);
        reach(home, () => {
          if (!alive) return;
          setPhase("out");
          window.setTimeout(() => { if (alive) { state.current.t0 = 0; setRun(null); } }, 260);
        });
        return;
      }
      const s = steps[i];
      const el = s.sel ? document.querySelector(s.sel) : null;
      if (!el) { play(i + 1); return; }
      const c = acCenter(el);
      setSay(s.say || null);
      reach({ x: c.x, y: c.y }, () => {
        if (!alive) return;
        if (s.act === "hold") {
          setPress(true);
          setHeld({ w: Math.min(c.r.width, 240), h: Math.min(c.r.height, 96), title: s.title || el.textContent.trim().slice(0, 40) });
          window.setTimeout(() => play(i + 1), 320);
          return;
        }
        if (s.act === "drop") {
          setPress(false);
          setHeld(null);
          window.setTimeout(() => play(i + 1), 320);
          return;
        }
        if (s.act === "type") { type(el, s.text || "", () => play(i + 1)); return; }
        /* click and tick are the same gesture; the press is what shows it. */
        setPress(true);
        window.setTimeout(() => {
          if (!alive) return;
          try { el.click(); } catch (e) { /* a decorative target has nothing to click */ }
          setPress(false);
          window.setTimeout(() => play(i + 1), s.after || 420);
        }, 140);
      });
    }

    const start = window.setTimeout(() => { if (alive) { setPhase("live"); play(0); } }, 300);
    return () => { alive = false; window.clearTimeout(start); window.cancelAnimationFrame(frame); };
  }, [run]);

  if (!run) return null;
  return (
    <div className="shell-agent-cursor-layer" aria-hidden="true">
      {/* Everything the hand carries hangs off the same transform, so the
          label and the card cannot lag a frame behind the arrow. */}
      {held ? (
        <span ref={load} className="ac-load base-strong shell-agent-cursor-load" style={{ width: held.w, height: held.h }}>{held.title}</span>
      ) : null}
      {say ? (
        <span ref={bubble} className="ac-say shell-agent-cursor-say">{say}</span>
      ) : null}
      {/* macOS proportions at macOS size: the system arrow is about 12×19pt,
          and a pointer larger than that stops reading as a pointer and starts
          reading as an illustration of one. The tip is the hot spot, so the
          press scales about it and nothing else moves. */}
      <span ref={arrow} className={"shell-agent-cursor-layer-2 " + "ac-arrow ac-" + phase + (press ? " is-press" : "")}
       >
        <svg width="20" height="24" viewBox="0 0 20 24" className="shell-cursor-svg">
          <path d="M2.6 1.6 L2.6 18.2 L7 14.1 L9.8 20.5 L12.7 19.3 L10 13.1 L15.9 12.8 Z"
            className="shell-cursor-halo" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M2.6 1.6 L2.6 18.2 L7 14.1 L9.8 20.5 L12.7 19.3 L10 13.1 L15.9 12.8 Z"
            className="shell-cursor-ink" strokeWidth="0.5" strokeLinejoin="round" />
        </svg>
      </span>
    </div>
  );
}

Object.assign(window, { AgentCursor });
