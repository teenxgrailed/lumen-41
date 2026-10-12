/* Needt landing v2 — behaviour. No framework; Lenis (optional) for smooth scroll,
   vendor/sky.js for the app's own sky. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* "Try it free" opens Pricing (v18): people see the plans, take the 14-day
     gift or buy Pro right away. The gift buttons (.js-trial) go to sign-up. */
  const ROOT = new URL(".", (document.querySelector('link[href*="styles.css"]') || {}).href || location.href);
  const onPricing = /\/pricing\/(index\.html)?$/.test(location.pathname);
  $$(".js-signup").forEach((a) => (a.href = onPricing ? "#trial" : new URL("pricing/", ROOT).href));
  $$(".js-trial").forEach((a) => (a.href = window.NEEDT_SIGNUP || "https://use.needt.app/auth/signin"));
  $$('a[aria-disabled="true"]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  /* Opened from disk (file://), folder links would show a directory listing. */
  if (location.protocol === "file:") $$("a[href]").forEach((a) => {
    const h = a.getAttribute("href"); if (/^(https?:|mailto:|#)/.test(h)) return;
    const [p, hash] = h.split("#"); if (p && p.endsWith("/")) a.setAttribute("href", p + "index.html" + (hash ? "#" + hash : ""));
  });
  const burger = document.querySelector(".nav-burger");
  if (burger) burger.addEventListener("click", (e) => { e.stopPropagation(); const on = document.body.classList.toggle("nav-open"); burger.setAttribute("aria-expanded", String(on)); });

  /* Smooth scroll */
  /* Native scrolling (v17): Lenis drove the scroll from the main thread, so
     any busy frame showed as a hitch on a fast flick; the browser's own
     scroll runs on the compositor. */
  const glide = (top) => scrollTo({ top, behavior: calm ? "auto" : "smooth" });
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) return;
    const t = $(id); if (!t) return; e.preventDefault(); closeMenus();
    glide(t.getBoundingClientRect().top + scrollY + (id === "#tour" ? 0 : -90));
  }));

  /* ── Sky: the app's PxSky engine ───────────────────── */
  /* The sky boots after first paint so it never delays the page; the host shows a CSS gradient meanwhile. */
  /* Skies are still (they move only under the pointer and behind scrolling
     text), so they cost nothing at rest. The ones on screen paint their first
     frame immediately, with the page; the rest boot in idle time. */
  const mountSkies = () => { if (window.NeedtSky) $$("[data-sky]").forEach((h) => {
    const night = h.dataset.sky === "night", r = h.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight;
    try { h.__sky = window.NeedtSky.mount(h, { variant: h.dataset.variant || "a", horizon: "cloudsea", interactive: true, still: true, sync: onScreen, fps: innerWidth < 760 ? 24 : 0, mood: night ? "night" : "lavender", dark: night }); }
    catch (e) { h.style.background = night ? "linear-gradient(#121126,#2f2c47)" : "linear-gradient(#a7b0d8,#ebe4ea)"; }
  }); };
  mountSkies();


  /* Phones: a sticky "Try it free" once the hero is gone, hidden again at the final call. */
  const mc = document.querySelector(".m-cta");
  if (mc) {
    let nearEnd = false;
    let on = null;
    const upd = () => { const v = scrollY > 520 && !nearEnd; if (v !== on) { on = v; mc.classList.toggle("on", v); } };
    const fin = document.querySelector(".final");
    if (fin) new IntersectionObserver((es) => { nearEnd = es[0].isIntersecting; upd(); }).observe(fin);
    addEventListener("scroll", upd, { passive: true });
  }
  /* ── Header menus ──────────────────────────────────── */
  const triggers = $$(".nav-trigger");
  /* The header card grows to hold the open menu (height eased in CSS). */
  const pill = $(".nav-pill");
  function sheet() {
    if (!pill) return;
    const m = $(".menu.is-open"), big = matchMedia("(min-width: 861px)").matches;
    if (m && big) { pill.style.setProperty("--sheet", (m.offsetTop + m.offsetHeight + 8) + "px"); pill.classList.add("is-open"); }
    else { pill.style.setProperty("--sheet", pill.offsetHeight + "px"); pill.classList.remove("is-open"); }
  }
  function closeMenus(except) { triggers.forEach((t) => { if (t === except) return; t.setAttribute("aria-expanded", "false"); $("#" + t.getAttribute("aria-controls")).classList.remove("is-open"); }); sheet(); }
  triggers.forEach((t) => {
    const m = $("#" + t.getAttribute("aria-controls"));
    const open = (v) => { if (v) closeMenus(t); t.setAttribute("aria-expanded", String(v)); m.classList.toggle("is-open", v); sheet(); };  /* closing one never closes the menu just opened */
    t.addEventListener("click", (e) => { e.stopPropagation(); open(t.getAttribute("aria-expanded") !== "true"); });
    if (fine) { const item = t.parentElement; let tm; item.addEventListener("pointerenter", () => { clearTimeout(tm); open(true); }); item.addEventListener("pointerleave", () => { tm = setTimeout(() => open(false), 160); }); }
  });
  sheet(); addEventListener("resize", sheet);
  document.addEventListener("click", () => closeMenus());
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });

  /* Split headlines into words */
  $$("[data-split]").forEach((el) => {
    let i = 0;
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((w) => {
          if (!w) return;
          if (/^\s+$/.test(w)) { frag.appendChild(document.createTextNode(w)); return; }
          const s = document.createElement("span"); s.className = "w"; s.style.setProperty("--i", i++); s.textContent = w; frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else walk(n);
    });
    walk(el);
  });
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px" });
  $$(".rv, .split").forEach((el) => io.observe(el));

  /* Hero headline develops from underexposed to its resting −25 */
  const h1 = $("#hero-h");
  if (!calm) { const t0 = performance.now(); const step = (now) => { const p = clamp((now - t0) / 1600, 0, 1), e = 1 - Math.pow(1 - p, 3); h1.style.fontVariationSettings = `"EXPO" ${(-100 + 95 * e).toFixed(1)}`; if (p < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); }

  /* Card spotlight + tilt */
  if (fine && !calm) $$(".card").forEach((c) => {
    c.addEventListener("pointermove", (e) => {
      const r = c.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      c.style.setProperty("--mx", px * 100 + "%"); c.style.setProperty("--my", py * 100 + "%");
      if (c.classList.contains("tilt") && !c.querySelector(".grab")) c.style.transform = `perspective(900px) rotateX(${(.5 - py) * 4}deg) rotateY(${(px - .5) * 5}deg) translateY(-2px)`;
    });
    c.addEventListener("pointerleave", () => { c.style.transform = ""; });
  });

  /* ── Hero window: real screenshot, scaled; live layers on top ─ */
  const win = $("#window"), scaleEl = $("#win-scale");
  let K = 1;
  const fit = () => { K = win.clientWidth / 1440; scaleEl.style.transform = `scale(${K})`; };
  fit(); addEventListener("resize", fit);

  // Floating cards drift with the pointer
  if (fine && !calm) {
    const hero = $(".hero"), cards = $$(".depth");
    hero.addEventListener("pointermove", (e) => { const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      cards.forEach((c) => { const d = +c.dataset.depth; c.style.transform = `translate(${-x * d}px, ${-y * d}px)`; }); });
  }

  // Tick a task: check + strike over the screenshot row
  $$(".live-ck").forEach((b) => {
    const st = document.createElement("i"); st.className = "live-strike";
    st.style.left = "372px"; st.style.top = parseFloat(b.style.top) + 9 + "px"; st.style.width = b.dataset.w + "px";
    b.after(st);
    b.addEventListener("click", () => { b.classList.toggle("on"); st.classList.toggle("on", b.classList.contains("on")); });
  });

  // The agent: overdue "Send the August report" → the free stretch after 16:20
  const agentEl = $("#agent"), say = $(".say", agentEl), load = $(".load", agentEl);
  let ax = 1300, ay = 860;
  const place = () => { agentEl.style.transform = `translate(${ax}px, ${ay}px) scale(${1 / Math.max(K, .55)})`; };
  async function go(bx, by, ms) {
    if (calm) { ax = bx; ay = by; place(); return; }
    const sx = ax, sy = ay, len = Math.hypot(bx - sx, by - sy) || 1, bow = Math.min(len * .15, 60);
    const cx = sx + (bx - sx) / 2 - (by - sy) / len * bow, cy = sy + (by - sy) / 2 + (bx - sx) / len * bow;
    const dur = ms || 420 + Math.min(600, len * .5), t0 = performance.now();
    await new Promise((res) => { const f = (now) => { const q = clamp((now - t0) / dur, 0, 1), e = 10 * q ** 3 - 15 * q ** 4 + 6 * q ** 5, u = 1 - e;
      ax = u * u * sx + 2 * u * e * cx + e * e * bx; ay = u * u * sy + 2 * u * e * cy + e * e * by; place(); q < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
  }
  let heroVis = true; new IntersectionObserver((es) => (heroVis = es[0].isIntersecting)).observe(win);
  const patch = $("#patch-rep"), shift = $("#sched-shift"), fresh = $("#sched-new"), ckRep = $("#ck-rep");
  async function heroLoop() {
    for (;;) {
      await wait(2400);
      if (!heroVis || ckRep.classList.contains("on")) { await wait(1500); continue; }
      ax = 1330; ay = 870; place(); say.textContent = ""; agentEl.classList.add("on");
      say.textContent = "Overdue · 35 min"; await go(470, 498);
      load.textContent = "Send the August report"; agentEl.classList.add("holding"); patch.classList.add("on");
      say.textContent = "Into the free stretch, 16:30"; await go(1200, 798, 1100);
      agentEl.classList.remove("holding"); say.textContent = "";
      shift.classList.add("on"); fresh.classList.add("on");
      await wait(600); agentEl.classList.remove("on");
      await wait(5200);
      fresh.classList.remove("on"); shift.classList.remove("on"); await wait(300); patch.classList.remove("on");
    }
  }
  heroLoop();

  /* ── Fold: other apps collapse into one ───────────── */
  const fold = $("#fold"), icons = $$("#fold-icons img:not(.fold-needt)"), needt = $(".fold-needt");
  const onFold = () => {
    const r = fold.getBoundingClientRect(), total = r.height - innerHeight, p = clamp(-r.top / total, 0, 1);
    const vw = Math.min(innerWidth, 1200) / 100, e = p * p * (3 - 2 * p);
    icons.forEach((im) => {
      const x = +im.dataset.x * vw * (1 - e), y = +im.dataset.y * vw * .62 * (1 - e), rot = +im.dataset.r * (1 - e), s = 1 - e * .55;
      im.style.transform = `translate(${x}px, ${y}px) rotate(${rot}deg) scale(${s})`; im.style.opacity = String(clamp(1.25 - e * 1.3, 0, 1));
    });
    const n = clamp((p - .45) / .4, 0, 1);
    needt.style.transform = `scale(${.4 + n * .6}) rotate(${(1 - n) * -12}deg)`; needt.style.opacity = String(n);
    fold.classList.toggle("done", p > .7);
  };

  /* ── Composer ──────────────────────────────────────── */
  const line = $("#cmp-line"), chips = $("#cmp-chips"), add = $("#cmp-add"), landed = $("#landed");
  const TYPES = { Task: "Add task", Event: "Add event", Doc: "Create doc" };
  let ctype = "Task";
  $$(".cmp-type").forEach((b) => b.addEventListener("click", () => { $$(".cmp-type").forEach((x) => x.classList.toggle("on", x === b)); ctype = b.dataset.type; add.textContent = TYPES[ctype] + " ↵"; }));
  async function composerRun() {
    const words = "Send the client update Friday Clients";
    chips.innerHTML = ""; add.disabled = true; landed.textContent = "One line. Needt reads the day and the project from the words.";
    let s = "";
    for (const ch of words) {
      s += ch;
      line.innerHTML = s.replace(/Friday/, '<span class="tok date">Friday</span>').replace(/Clients$/, '<span class="tok proj">Clients</span>') + '<span class="caret"></span>';
      if (s.endsWith("Friday") && !$(".chip.date-c", chips)) chips.insertAdjacentHTML("beforeend", '<span class="chip date-c" style="--c:#2e6de9">Friday, 4 Sep</span>');
      if (s.endsWith("Clients") && !$(".chip.proj-c", chips)) chips.insertAdjacentHTML("beforeend", '<span class="chip proj-c" style="--c:#f07a3a">Clients</span>');
      add.disabled = s.length < 4;
      await wait(calm ? 0 : 55 + Math.random() * 50);
    }
    await wait(900);
    add.style.transform = "scale(.95)"; await wait(140); add.style.transform = "";
    landed.textContent = `✓ ${ctype} added to Friday · Clients`;
  }
  let composerDone = false;
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !composerDone) { composerDone = true; composerRun(); } }, { threshold: .6 }).observe($("#composer"));
  add.addEventListener("click", () => { composerDone = true; composerRun(); });

  /* ── Tour ──────────────────────────────────────────── */
  const tour = $("#tour"), items = $$(".rail-item"), shots = $$(".shot", $("#frame")), frame = $("#frame"), cap = $("#cap");
  const CAPS = [
    ["Home starts with one thing.", "Next up, what’s overdue, and the day as it really is."],
    ["Calendar holds tasks and events.", "One week, one grid — drag anything to a new time."],
    ["Docs sit next to the work.", "Plans and briefs that turn into tasks."],
    ["Boards for the look of it.", "References, colours and notes on one moodboard — shared when you want."],
    ["Ask about your day.", "What’s overdue, where the free time is — and what would move."]
  ];
  let cur = -1;
  function setStage(i) {
    if (i === cur) return; cur = i;
    items.forEach((b, k) => b.classList.toggle("on", k === i));
    shots.forEach((s, k) => s.classList.toggle("on", k === i));
    frame.style.setProperty("--tone", items[i].style.getPropertyValue("--tone"));
    cap.innerHTML = `<b>${CAPS[i][0]}</b> <span>${CAPS[i][1]}</span>`;
  }
  const onTour = () => { const r = tour.getBoundingClientRect(), p = clamp(-r.top / (r.height - innerHeight), 0, .999); setStage(Math.floor(p * items.length)); };
  items.forEach((b, k) => b.addEventListener("click", () => {
    const top = tour.getBoundingClientRect().top + scrollY + (tour.offsetHeight - innerHeight) * ((k + .5) / items.length);
    glide(top);
  }));
  setStage(0);

  /* ── AI block ──────────────────────────────────────── */
  const call = $("#b-call"), ghost = $("#b-ghost"), rev = $("#b-rev"), inv = $("#b-inv"), c1 = $("#c1"), c2 = $("#c2");
  const apply = $("#ai-apply"), undo = $("#ai-undo"), status = $("#ai-status");
  const setTop = (el, k) => { el.style.top = el.dataset[k] + "px"; };
  async function aiRun() {
    await wait(600);
    ghost.style.opacity = 1; setTop(call, "b"); $("#b-call-t").textContent = "14:00–15:00"; call.classList.add("moved");
    await wait(900); c1.classList.add("on"); await wait(500); c2.classList.add("on");
  }
  apply.addEventListener("click", async () => {
    c1.classList.add("on"); c2.classList.add("on");
    setTop(rev, "b"); $("#b-rev-t").textContent = "11:00–12:00"; rev.classList.add("moved");
    await wait(250); setTop(inv, "b"); inv.classList.add("moved");
    ghost.style.opacity = 0; call.classList.remove("moved");
    apply.disabled = true; undo.disabled = false; status.textContent = "Applied · 2 moves. Undo puts all of it back.";
  });
  undo.addEventListener("click", () => {
    setTop(rev, "a"); $("#b-rev-t").textContent = "14:00–15:00"; setTop(inv, "a");
    rev.classList.remove("moved"); inv.classList.remove("moved"); ghost.style.opacity = 1;
    apply.disabled = false; undo.disabled = true; status.textContent = "Undone. The day is back as it was.";
  });
  let aiDone = false;
  new IntersectionObserver((es) => { if (es[0].isIntersecting && !aiDone) { aiDone = true; aiRun(); } }, { threshold: .35 }).observe($("#day"));

  /* ── Bento: drag with quarter-hour snap ─────────────── */
  const lane = $("#lane"), blk = $("#dblk"), tip = $("#dtip"), dtime = $("#dtime");
  const hm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60)).padStart(2, "0")}`;
  const hourH = () => lane.clientHeight / 4;
  const sizeBlk = () => { blk.style.height = hourH() * .75 + "px"; blk.style.top = hourH() * .5 + "px"; dtime.textContent = "13:30–14:15"; };
  sizeBlk(); addEventListener("resize", sizeBlk);
  let drag = null;
  blk.addEventListener("pointerdown", (e) => { blk.setPointerCapture(e.pointerId); drag = { y0: e.clientY, t0: blk.offsetTop }; blk.classList.add("grab"); });
  blk.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const H = lane.clientHeight, hh = hourH(), raw = clamp(drag.t0 + e.clientY - drag.y0, 0, H - blk.offsetHeight);
    const snap = Math.round((13 + raw / hh) * 4) / 4;
    blk.style.top = (snap - 13) * hh + "px"; tip.style.top = (snap - 13) * hh + blk.offsetHeight / 2 - 10 + "px";
    tip.textContent = hm(snap); dtime.textContent = `${hm(snap)}–${hm(snap + .75)}`;
  });
  const end = () => { drag = null; blk.classList.remove("grab"); };
  blk.addEventListener("pointerup", end); blk.addEventListener("pointercancel", end);
  const streak = $("#streak");
  $$(".hb").forEach((b) => b.addEventListener("click", () => { b.classList.toggle("on"); streak.firstChild.textContent = $$(".hb.on").length; }));

  /* ── Integrations: real logos ──────────────────────── */
  const A = [["gcal", "Google Calendar", "Calendar"], ["outlook", "Outlook Calendar", "Calendar"], ["icloud", "iCloud", "Calendar · CalDAV"], ["caldav", "CalDAV", "Any calendar server"], ["gmail", "Gmail", "Mail · read-only"]];
  const B = [["outlook", "Outlook Mail", "Mail · read-only"], ["imap", "IMAP", "Any mailbox · read-only"], ["api", "Your API token", "Read & write your data"], ["webhooks", "Webhooks", "Push changes out"], ["claude", "Your AI key", "Claude, ChatGPT, Gemini"]];
  const card = ([f, n, s]) => `<div class="int"><img src="assets/logos/${f}.svg" alt=""><span><b>${n}</b><small>${s}</small></span></div>`;
  const row = (a) => { const one = a.concat(a).map(card).join(""); return one + one; };
  $("#mq1").innerHTML = row(A); $("#mq2").innerHTML = row(B);
  /* Marquee: drifts on its own, and you can grab it and throw it either way. */
  (() => {
    const box = $(".marquee"), rows = [{ el: $("#mq1"), dir: -1, x: 0 }, { el: $("#mq2"), dir: 1, x: 0 }];
    let drag = null, vel = 0, last = 0, hover = false;
    const SPEED = 28; // px/s
    /* Widths are measured once (and on resize), not every frame: reading
       scrollWidth in the loop forced a layout on each frame. */
    const measure = () => rows.forEach((r) => { r.half = r.el.scrollWidth / 2; });
    measure(); addEventListener("resize", measure); addEventListener("load", measure);
    const wrap = (r) => { const half = r.half; if (half) r.x = ((r.x % half) + half) % half - half; };
    rows[1].x = -rows[1].half;
    /* Off screen it does not run at all. */
    let seen = true, raf = 0;
    new IntersectionObserver((es) => { seen = es[0].isIntersecting; if (seen && !raf) { last = 0; raf = requestAnimationFrame(frame); } }).observe(box);
    function frame(t) {
      raf = 0; if (!seen) return;
      const dt = last ? Math.min(.05, (t - last) / 1000) : 0; last = t;
      if (!drag) { vel *= .94; }
      rows.forEach((r) => {
        const auto = calm || drag || hover ? 0 : r.dir * SPEED * dt;
        r.x += auto + (drag ? 0 : vel * dt) * (r.dir === -1 ? 1 : 1);
        wrap(r); r.el.style.transform = `translate3d(${r.x}px,0,0)`;
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    if (fine) { box.addEventListener("pointerenter", () => (hover = true)); box.addEventListener("pointerleave", () => (hover = false)); }
    box.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, t: performance.now() }; vel = 0; box.classList.add("dragging"); box.setPointerCapture(e.pointerId); });
    box.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, now = performance.now(), dt = Math.max(1, now - drag.t) / 1000;
      rows.forEach((r) => { r.x += dx; wrap(r); });
      vel = vel * .6 + (dx / dt) * .4; drag.x = e.clientX; drag.t = now;
    });
    const up = () => { if (!drag) return; drag = null; box.classList.remove("dragging"); };
    box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  })();

  /* One rule for every sky: parked while the page scrolls, and the night sky
     also while the white veil still covers it (it used to be woken by the
     veil logic mid-scroll and drew under the scroll). */
  function setPark(sk) { const v = holding || !!sk.veil; if (sk.held !== v) { sk.held = v; sk.park(v); } }

  /* ── Night ─────────────────────────────────────────── */
  const night = $("#night"), veil = $("#dusk-veil"), nightSky = $(".night-zone .sky"), shotD = $(".duo .shot-d");
  let lastNt = "", lastVt = "";
  const onNight = () => {
    const r = night.getBoundingClientRect(), p = clamp(-r.top / (r.height - innerHeight), 0, 1), nt = clamp((p - .1) / .55, 0, 1);
    const vt = r.top < 0 ? nt : 0;
    /* --nt goes only to the two things that use it, not to the whole section
       (a custom property on #night restyled its whole subtree every frame). */
    const nts = nt.toFixed(3), vts = vt.toFixed(3);
    if (nts !== lastNt) { lastNt = nts; if (shotD) shotD.style.setProperty("--nt", nts); }
    if (vts !== lastVt) { lastVt = vts; veil.style.setProperty("--nt", vts); }
    /* Under a fully opaque veil the night sky has nothing to show: park it. */
    const ns = nightSky && nightSky.__sky; const park = vt < .02 && r.top > -10;
    if (ns && ns.veil !== park) { ns.veil = park; setPark(ns); }
    document.body.classList.toggle("is-night", (r.top < innerHeight * .1 && nt > .45) || r.bottom < innerHeight * .5);
  };

  /* ── The name at the floor — the old site's wordmark, as is ─────
     One axis, EXPO (−100 fused … 0 crisp Didone … +100 hairline).
     DEVELOP-IN once, the first time it comes into view (easeOutCubic).
     BREATHE a slow travelling wave of ink, each letter 200 ms behind.
     TORCH the pointer thins the letters nearest it, on a spring; the
     breath fades out while the torch is on so two motions never share
     the axis. WEIGHT: it lags the scroll downward and springs back.
     Paused off screen. */
  const fw = $("#floor-word");
  const word = fw.textContent.trim();
  fw.textContent = ""; fw.setAttribute("aria-label", word);
  const letters = word.split("").map((ch) => { const s = document.createElement("span"); s.className = "ew-letter"; s.textContent = ch; fw.appendChild(s); return s; });
  const lastV = letters.map(() => NaN);
  const write = (i, v) => { if (Math.abs(v - lastV[i]) < .08) return; lastV[i] = v; letters[i].style.fontVariationSettings = `"EXPO" ${v.toFixed(1)}`; };
  /* Floor crop: pull the word up by the measured air above the caps. */
  const probe = document.createElement("canvas").getContext("2d");
  const pull = () => { const cs = getComputedStyle(fw), size = parseFloat(cs.fontSize); if (!size) return;
    probe.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; const m = probe.measureText(word);
    const air = m.fontBoundingBoxAscent - m.actualBoundingBoxAscent; if (air > 0) fw.style.setProperty("--floor-pull", `-${Math.max(0, air - 1).toFixed(1)}px`); };
  pull(); document.fonts && document.fonts.ready.then(pull); addEventListener("resize", pull);
  if (calm) letters.forEach((_, i) => write(i, 0));
  else {
    const DEV = 620, LAG = 85, CYCLE = 5200, PHASE = 200, DEPTH = -30, TORCH = 55, REACH = 190;
    const live = letters.map(() => -100), vel = letters.map(() => 0);
    let pointer = null, amp = 1, running = false, start = 0, devT0 = 0, developed = false;
    letters.forEach((_, i) => write(i, -100));
    fw.addEventListener("pointermove", (e) => { pointer = e.clientX; amp = 0; }, { passive: true });
    fw.addEventListener("pointerleave", () => { pointer = null; amp = 1; }, { passive: true });
    function develop(now) {
      if (!devT0) devT0 = now; let done = 0;
      letters.forEach((_, i) => { const p = clamp((now - devT0 - i * LAG) / DEV, 0, 1), e = 1 - Math.pow(1 - p, 3); live[i] = -100 + 100 * e; write(i, live[i]); if (p >= 1) done++; });
      if (done < letters.length) return requestAnimationFrame(develop);
      developed = true; loop();
    }
    function tick(now) {
      if (!running) return;
      if (!start) start = now; const t = now - start;
      for (let i = 0; i < letters.length; i++) {
        const ph = ((t + i * PHASE) % CYCLE) / CYCLE;
        let target = DEPTH * (.5 - .5 * Math.cos(ph * Math.PI * 2)) * amp;
        if (pointer !== null) { const r = letters[i].getBoundingClientRect(); const d = Math.min(Math.abs(pointer - (r.left + r.width / 2)) / REACH, 1); target += TORCH * (1 - d * d * (3 - 2 * d)); }
        const a = (target - live[i]) * .055 - vel[i] * .26; vel[i] += a; live[i] += vel[i];
        write(i, clamp(live[i], -100, 100));
      }
      requestAnimationFrame(tick);
    }
    function loop() { if (running) return; running = true; start = 0; requestAnimationFrame(tick); }
    let seenOnce = false;
    new IntersectionObserver((es) => { es.forEach((e) => {
      if (e.isIntersecting && !document.hidden) { if (!seenOnce) { seenOnce = true; (document.fonts ? document.fonts.load('1em "Exposure"') : Promise.resolve()).then(() => requestAnimationFrame(develop), () => requestAnimationFrame(develop)); } else if (developed) loop(); }
      else running = false; }); }, { threshold: .05 }).observe(fw);
    document.addEventListener("visibilitychange", () => { if (document.hidden) running = false; else if (developed) loop(); });
    /* Weight: lags the scroll downward by velocity, springs back. */
    let lag = 0, sv = 0, prevY = scrollY, inView = false, wh = 0;
    const heavy = () => { const y = scrollY; sv = sv * .72 + (y - prevY) * .28; prevY = y;
      const tg = clamp(sv * 2.4, 0, 96); lag += (tg - lag) * .14;
      if (!inView || (Math.abs(lag) < .15 && Math.abs(sv) < .15)) { fw.style.transform = "none"; lag = sv = 0; wh = 0; return; }
      fw.style.transform = `translate3d(0,${lag.toFixed(2)}px,0)`; wh = requestAnimationFrame(heavy); };
    addEventListener("scroll", () => { if (!inView || wh) return; prevY = scrollY; wh = requestAnimationFrame(heavy); }, { passive: true });
    new IntersectionObserver((es) => { inView = es[0].isIntersecting; }).observe(fw.parentElement);
  }

  /* While the page scrolls the skies hold still (they are sticky, so nothing
     visibly stops) and give the frame budget to the scroll; they resume 160 ms
     after the last scroll event. */
  const skiesNow = () => $$("[data-sky]").filter((h) => h.__sky);
  let scrollHold = 0, holding = false;
  const holdSkies = () => {
    if (!holding) { holding = true; skiesNow().forEach((h) => setPark(h.__sky)); }
    clearTimeout(scrollHold);
    scrollHold = setTimeout(() => { holding = false; skiesNow().forEach((h) => setPark(h.__sky)); }, 160);
  };
  const onScroll = () => { onFold(); onTour(); onNight(); holdSkies(); };
  addEventListener("scroll", onScroll, { passive: true }); addEventListener("resize", onScroll); onScroll();
})();
