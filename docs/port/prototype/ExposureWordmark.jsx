/* EXPOSURE WORDMARK — the name on a single exposure axis.
 *
 * "Needt" in Exposure VAR, one inline-block span per letter, animating ONLY
 * font-variation-settings on EXPO (−100 → +100, resting 0). The font is
 * duplexed — every axis position has the same advance width — so nothing in
 * the layout can move and there is no width lock.
 *
 * FIVE MOTIONS, and the axis has two directions, which is the whole idea:
 * negative is ink flooding the counters, positive is light burning the strokes
 * away.
 *
 *   1 DEVELOP-IN  once on mount. −100 → 0 (−40 → 0 at rail size), 620ms
 *                 easeOutCubic, 85ms per letter. A print coming up in the
 *                 tray. A CSS animation, because nothing interrupts it and a
 *                 CSS animation outranks the inline value while it runs.
 *   2 BUSY        a prop. → 55 over 300ms easeOut and hold; ← 0 over 400ms.
 *                 Capped at 55: past ~60 the strokes fragment and it reads
 *                 broken rather than lit. Busy OVERRIDES everything.
 *   3 TORCH       pointer-driven. Distance to the cursor through a smoothstep
 *                 falloff over 180px, each letter on a SPRING (220/26/1). The
 *                 lag is the point — with a direct write it reads as a slider.
 *   4 BREATHE     ONE wave after the develop-in (08.10.26: no permanent
 *                 loop — at rest the word is a still frame): 0 → −100 → 0 over 5200ms, easeInOut, phase offset
 *                 260ms per letter. The 1040ms spread over a 5200ms cycle
 *                 (20%) is what makes it a travelling wave; synchronised
 *                 letters throb.
 *   5 PULSE       a burst on top of breathe, in the OPPOSITE direction:
 *                 → +70 at 35% of 1300ms, easeOutExpo, 80ms per letter, every
 *                 6000ms. Not a deeper breathe — the other way down the axis.
 *
 * COMPOSITION — one resolved value per letter per frame, in this order:
 *
 *     base  = breathe(t) · amp + pulse(t)      // both 0 in 'still'
 *     torch = lerp(0, 55, tCursor)             // the spring's current value
 *     value = clamp(base + torch, floor, roof)   // the axis range, not 55
 *     if (busy)       value = 55                // overrides everything
 *     if (developing) value = the CSS animation // hands over on completion
 *
 * The breathe amplitude falls to 0 over 250ms on pointerenter and returns over
 * 400ms on leave: two motions at full amplitude on one property looks like a
 * bug, not like two features.
 *
 * CLAMPS  Full range at 64 and above. At 28 (the rail) the axis is clamped to
 *         −40…0, which disables pulse there — it is positive — while breathe
 *         fits inside the clamp untouched. Below 28: static.
 *
 * PERF    A permanent loop re-rasterises glyphs every frame forever, so the
 *         loop stops outright when the element is offscreen or the tab is
 *         hidden, and resumes at the phase it stopped at rather than from
 *         zero: the clock only advances while the loop runs.
 *
 * A slow lean rides on top of the loops — 1.5° every 19s, on the word rather
 * than per letter, so it reads as an occasional event and never competes with
 * the wave. Skew is the part of a lean a browser can interpolate, and the
 * display face ships upright.
 *
 * REDUCED MOTION: all five off, static at 0. */
const EW_RADIUS = 180;
const EW_MAX = 55;
const EW_MIN_SIZE = 28;
const EW_SPRING = { stiffness: 220, damping: 26, mass: 1 };
const EW_BREATHE = { cycle: 5200, depth: -100, offset: 260 };
const EW_PULSE = { dur: 1300, peak: 70, at: 0.35, stagger: 80, every: 6000 };

function ewSmoothstep(x) { return x * x * (3 - 2 * x); }
function ewClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function ewEaseOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function ewEaseOutExpo(t) { return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t); }

function ewBreatheAt(ms, index) {
  const u = ((ms - index * EW_BREATHE.offset) % EW_BREATHE.cycle + EW_BREATHE.cycle) % EW_BREATHE.cycle / EW_BREATHE.cycle;
  /* Half-cosine: 0 at the ends, full depth at the middle, easeInOut by shape
     rather than by a named curve. */
  const v = EW_BREATHE.depth * (1 - Math.cos(u * Math.PI * 2)) / 2;
  return Math.round(v * 10) / 10;
}

function ewPulseAt(ms, index) {
  const t = ms - index * EW_PULSE.stagger;
  if (t <= 0 || t >= EW_PULSE.dur) return 0;
  const peakAt = EW_PULSE.dur * EW_PULSE.at;
  const v = t < peakAt
    ? EW_PULSE.peak * ewEaseOutExpo(t / peakAt)
    : EW_PULSE.peak * (1 - ewEaseOutExpo((t - peakAt) / (EW_PULSE.dur - peakAt)));
  return Math.round(v * 10) / 10;
}

function ExposureWordmark({ size, word, busy, mode, style, className }) {
  const px = size || 28;
  const text = word || "Needt";
  const letters = text.split("");
  const form = mode || "still";
  const host = React.useRef(null);
  const spans = React.useRef([]);
  const torch = React.useRef([]);
  const clock = React.useRef({ t: 0, pulseAt: -1e9, amp: 1, ampTo: 1, ampAt: 0, ampFrom: 1, ampDur: 250, busy: 0, busyFrom: 0, busyAt: 0, busyDur: 300 });
  const frame = React.useRef(0);
  const last = React.useRef(0);

  const [onScreen, setOnScreen] = React.useState(true);
  const [awake, setAwake] = React.useState(typeof document === "undefined" || !document.hidden);
  /* Read synchronously: starting false let one breathe frame be written
     before the reduced-motion check landed, freezing the word mid-wave. */
  const [calm, setCalm] = React.useState(() => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [developing, setDeveloping] = React.useState(false);

  /* The clamp, both ends. Positive room is what pulse and torch need, so at
     rail size both are off by arithmetic rather than by a special case. */
  const full = px >= 44;
  const ceiling = full ? EW_MAX : 0;
  const floor = full ? -100 : -40;
  const roof = full ? 100 : 0;
  const live = onScreen && awake && !calm && px >= EW_MIN_SIZE;
  const looping = live && (form === "breathe" || form === "breathe+pulse");
  const pulsing = live && form === "breathe+pulse" && ceiling > 0;
  /* REST (08.10.26, owner: "animations only on enter / hover / action; at
     rest a still frame"). Breathe and pulse are no longer a permanent loop:
     they play for one full wave after the develop-in, then the amplitude
     eases to 0 and the rAF loop stops itself. Hover (torch) and busy wake it
     again; leaving the word lets the torch spring home and stops. */
  const waveOn = React.useRef(true);

  React.useEffect(() => {
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    function read() { setCalm(q.matches); }
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);

  React.useEffect(() => {
    function read() { setAwake(!document.hidden && document.visibilityState !== "hidden"); }
    read();
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);
    return () => {
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", read);
    };
  }, []);

  /* Visibility is measured from the node's own rect and only ever PARKS the
     component on a confirmed offscreen reading — IntersectionObserver is one
     more signal, never the source of truth, because a gate that starts closed
     is one failed measurement away from a dead wordmark. */
  React.useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let alive = true;
    let queued = 0;
    function shown() {
      const r = el.getBoundingClientRect();
      if (!r.height) return null;
      const h = window.innerHeight || document.documentElement.clientHeight;
      const w = window.innerWidth || document.documentElement.clientWidth;
      if (!h || !w) return null;
      const vis = Math.min(r.bottom, h) - Math.max(r.top, 0);
      return r.right > 0 && r.left < w && vis / r.height >= 0.25;
    }
    function measure() {
      if (!alive) return;
      const v = shown();
      if (v === null) { window.requestAnimationFrame(measure); return; }
      setOnScreen(v);
    }
    function onScroll() {
      if (queued) return;
      queued = window.requestAnimationFrame(() => { queued = 0; measure(); });
    }
    measure();
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    let io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(() => measure(), { threshold: 0.25 });
      io.observe(el);
    }
    return () => {
      alive = false;
      if (queued) window.cancelAnimationFrame(queued);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      if (io) io.disconnect();
    };
  }, []);

  const developed = React.useRef(false);
  React.useEffect(() => {
    if (!live || developed.current) return undefined;
    developed.current = true;
    setDeveloping(true);
    const id = window.setTimeout(() => setDeveloping(false), 620 + letters.length * 85 + 40);
    return () => window.clearTimeout(id);
  }, [live, letters.length]);

  function write(i, v) {
    const el = spans.current[i];
    if (!el) return;
    el.style.fontVariationSettings = '"EXPO" ' + (Math.round(v * 10) / 10);
    /* −100 → 1.35, 0 → 1, +55 → 0.62. One multiplier, applied to a fixed
       light: the source never moves, only the height of the letter does. */
    el.style.setProperty("--ew-lift", (1 - v / 285).toFixed(3));
  }

  function ensure() {
    for (let i = 0; i < letters.length; i++) {
      if (!torch.current[i]) torch.current[i] = { v: 0, vel: 0, target: 0 };
    }
  }

  /* ONE loop, one resolved value per letter per frame. It runs while anything
     is unresolved and stops itself otherwise, so a still wordmark costs
     nothing and a looping one costs exactly one rAF. */
  function run() {
    if (frame.current) return;
    last.current = performance.now();
    function step(now) {
      const dt = Math.min(now - last.current, 1000 / 30);
      last.current = now;
      if (document.hidden) { frame.current = 0; return; }
      const c = clock.current;
      c.t += dt;

      /* The breathe amplitude, and busy, are tweens on the same clock. */
      if (c.amp !== c.ampTo) {
        const t = ewClamp((c.t - c.ampAt) / c.ampDur, 0, 1);
        c.amp = c.ampFrom + (c.ampTo - c.ampFrom) * ewEaseOutCubic(t);
        if (t >= 1) c.amp = c.ampTo;
      }
      const busyTo = busy ? Math.min(EW_MAX, ceiling) : 0;
      if (c.busy !== busyTo) {
        const t = ewClamp((c.t - c.busyAt) / c.busyDur, 0, 1);
        c.busy = c.busyFrom + (busyTo - c.busyFrom) * ewEaseOutCubic(t);
        if (t >= 1) c.busy = busyTo;
      }

      /* One wave across every letter (on the loop's own clock, so a pause
         offscreen does not cut it short), then ease to the still frame. */
      if (waveOn.current && c.t >= 620 + letters.length * 85 + EW_BREATHE.cycle + (letters.length - 1) * EW_BREATHE.offset) {
        waveOn.current = false;
        c.ampFrom = c.amp; c.ampTo = 0; c.ampAt = c.t; c.ampDur = 600;
      }
      if (pulsing && waveOn.current && c.t - c.pulseAt >= EW_PULSE.every) c.pulseAt = c.t;
      const pulseLive = pulsing && c.t - c.pulseAt < EW_PULSE.dur + letters.length * EW_PULSE.stagger;

      /* Still once the wave has eased out: amplitude at 0, no pulse in
         flight, busy resolved, every spring home. */
      let moving = (looping && (c.amp > 0.001 || c.ampTo > 0)) || pulseLive || c.amp !== c.ampTo || c.busy !== busyTo;
      for (let i = 0; i < letters.length; i++) {
        const s = torch.current[i];
        if (!s) continue;
        /* The spring: F = −k·x − c·v. */
        const f = (-EW_SPRING.stiffness * (s.v - s.target)) - (EW_SPRING.damping * s.vel);
        s.vel += (f / EW_SPRING.mass) * (dt / 1000);
        s.v += s.vel * (dt / 1000);
        if (Math.abs(s.v - s.target) > 0.05 || Math.abs(s.vel) > 0.05) moving = true;
        else { s.v = s.target; s.vel = 0; }

        const base = looping
          ? ewBreatheAt(c.t, i) * c.amp + (pulseLive ? ewPulseAt(c.t - c.pulseAt, i) : 0)
          : 0;
        let v = ewClamp(base + s.v, floor, roof);
        /* Busy outranks everything that is not the develop-in. */
        if (c.busy > 0.05) v = c.busy;
        write(i, v);
      }

      if (moving) frame.current = window.requestAnimationFrame(step);
      else frame.current = 0;
    }
    frame.current = window.requestAnimationFrame(step);
  }

  function stop() {
    if (frame.current) { window.cancelAnimationFrame(frame.current); frame.current = 0; }
  }

  /* Mount: attach the engine and prove it by writing the resting value. */
  React.useEffect(() => {
    ensure();
    for (let i = 0; i < letters.length; i++) write(i, 0);
    return stop;
  }, [letters.length]);

  /* The loop is bound to the conditions, not to a trigger: offscreen or hidden
     stops it dead, and the clock stops with it, so it resumes in phase. */
  React.useEffect(() => {
    ensure();
    if (!live) { stop(); return undefined; }
    if (looping || busy) run();
    return undefined;
  }, [live, looping, pulsing, busy, form, ceiling, floor]);

  React.useEffect(() => {
    const c = clock.current;
    c.busyFrom = c.busy;
    c.busyAt = c.t;
    c.busyDur = busy ? 300 : 400;
    if (live) run();
  }, [busy, live]);

  function amplitudeTo(v, dur) {
    const c = clock.current;
    c.ampFrom = c.amp;
    c.ampTo = v;
    c.ampAt = c.t;
    c.ampDur = dur;
  }

  function onMove(e) {
    if (!live || developing || busy || ceiling <= 0) return;
    ensure();
    for (let i = 0; i < letters.length; i++) {
      const el = spans.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2)) / EW_RADIUS;
      torch.current[i].target = ceiling * (1 - ewSmoothstep(ewClamp(d, 0, 1)));
    }
    run();
  }

  function onEnter() {
    if (!live || ceiling <= 0) return;
    /* The breathe steps aside so the torch reads clean. */
    amplitudeTo(0, 250);
    run();
  }

  function onLeave() {
    if (!live) return;
    ensure();
    for (let i = 0; i < letters.length; i++) torch.current[i].target = 0;
    /* Back to the still frame — the breathe does not resume on its own. */
    amplitudeTo(waveOn.current ? 1 : 0, 400);
    run();
  }

  return (
    <h1 ref={host} className={"font-display" + (px >= 22 ? " ew-sculpt" : "") + (looping ? " ew-leans" : "") + (className ? " " + className : "")}
      onPointerEnter={onEnter} onPointerMove={onMove} onPointerLeave={onLeave}
      /* .ew-leans keeps its inline-block box, but its 19 s infinite lean is
         an at-rest motion and is switched off (08.10.26). */
      style={Object.assign({ margin: 0, fontSize: px, lineHeight: 1.1, color: "var(--text-primary)", cursor: "default" }, looping ? { animation: "none" } : null, style)}>
      {letters.map((ch, i) => (
        <span key={i} aria-hidden="true" ref={(el) => { spans.current[i] = el; }}
          className={"ew-letter" + (developing ? " is-developing" : "")}
          style={{ animationDelay: developing ? (i * 85) + "ms" : undefined, "--ew-from": floor }}>{ch}</span>
      ))}
      <span className="sr-only">{text}</span>
    </h1>
  );
}

Object.assign(window, { ExposureWordmark, ewBreatheAt, ewPulseAt,
  EW_MAX, EW_RADIUS, EW_MIN_SIZE, EW_SPRING, EW_BREATHE, EW_PULSE });
