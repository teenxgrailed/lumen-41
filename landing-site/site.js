/* Needt site — shared behaviour for every page except the home page (app.js).
   No framework. vendor/sky.js draws the app's own sky; vendor/lenis.min.js
   smooths the scroll when it is there. */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  /* The name inflates (v23): Exposure's EXPO axis runs to "fused" and back,
     one letter after another — once after load, again on hover. */
  $$(".brand-word").forEach((w) => {
    if (w.dataset.split) return; w.dataset.split = "1";
    w.innerHTML = [...w.textContent].map((c, i) => `<span class="bw-l" style="--i:${i}">${c}</span>`).join("");
    const go = () => { if (calm) return; w.classList.remove("inflate"); void w.offsetWidth; w.classList.add("inflate"); };
    const host = w.closest("a") || w;
    host.addEventListener("pointerenter", go);
    w.addEventListener("animationend", (e) => { if (e.target === w.lastElementChild) w.classList.remove("inflate"); });
    if (w.closest(".nav")) setTimeout(go, 500);
  });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* "Try it free" opens Pricing (v18): people see the plans, take the 14-day
     gift or buy Pro right away. The gift buttons (.js-trial) go to sign-up. */
  const ROOT = new URL(".", (document.querySelector('link[href*="styles.css"]') || {}).href || location.href);
  const onPricing = /\/pricing\/(index\.html)?$/.test(location.pathname);
  $$(".js-signup").forEach((a) => (a.href = onPricing ? "#trial" : new URL("pricing/", ROOT).href));
  $$(".js-trial").forEach((a) => (a.href = window.NEEDT_SIGNUP || "https://use.needt.app/auth/signin"));
  $$('a[aria-disabled="true"]').forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  /* Opened from disk (file://), a folder link shows a directory listing:
     point those links at the folder's index.html. On the server nothing changes. */
  if (location.protocol === "file:") $$("a[href]").forEach((a) => {
    const h = a.getAttribute("href");
    if (/^(https?:|mailto:|#)/.test(h)) return;
    const [p, hash] = h.split("#");
    if (p === "" ) return;
    if (p.endsWith("/")) a.setAttribute("href", p + "index.html" + (hash ? "#" + hash : ""));
    else if (p === "." || p === "..") a.setAttribute("href", p + "/index.html" + (hash ? "#" + hash : ""));
  });

  /* Smooth scroll */
  /* Native scrolling (v17): Lenis drove the scroll from the main thread, so
     any busy frame showed as a hitch on a fast flick; the browser's own
     scroll runs on the compositor. */
  const glide = (top) => scrollTo({ top, behavior: calm ? "auto" : "smooth" });
  $$('a[href^="#"]').forEach((a) => a.addEventListener("click", (e) => {
    const id = a.getAttribute("href"); if (id.length < 2) return;
    const t = document.getElementById(id.slice(1)); if (!t) return; e.preventDefault(); closeMenus();
    glide(t.getBoundingClientRect().top + scrollY - 96);
    history.replaceState(null, "", id);
  }));

  /* Sky */
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
  /* Skies hold still while the page scrolls and resume when it stops. */
  const skiesNow = () => $$("[data-sky]").filter((h) => h.__sky);
  let hold = 0, holding = false;
  addEventListener("scroll", () => {
    if (!holding) { holding = true; skiesNow().forEach((h) => h.__sky.park(true)); }
    clearTimeout(hold);
    hold = setTimeout(() => { holding = false; skiesNow().forEach((h) => h.__sky.park(false)); }, 160);
  }, { passive: true });

  /* Header menus */
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
  /* Phone menu */
  const burger = $(".nav-burger");
  if (burger) burger.addEventListener("click", (e) => { e.stopPropagation(); const on = document.body.classList.toggle("nav-open"); burger.setAttribute("aria-expanded", String(on)); });


  /* Phones: a sticky "Try it free" once the hero is gone, hidden again at the final call. */
  const mc = document.querySelector(".m-cta");
  if (mc) {
    let nearEnd = false;
    const upd = () => mc.classList.toggle("on", scrollY > 520 && !nearEnd);
    const fin = document.querySelector(".final");
    if (fin) new IntersectionObserver((es) => { nearEnd = es[0].isIntersecting; upd(); }).observe(fin);
    addEventListener("scroll", upd, { passive: true });
  }
  /* Reveal */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -6% 0px" });
  $$(".rv").forEach((el) => io.observe(el));

  /* Copy buttons: data-copy="#id" or data-copy-text="…" */
  $$("[data-copy], [data-copy-text]").forEach((b) => b.addEventListener("click", async () => {
    const src = b.dataset.copyText != null ? b.dataset.copyText : ($(b.dataset.copy) || {}).innerText || "";
    try { await navigator.clipboard.writeText(src.trim()); } catch (e) { /* older browsers: select instead */ }
    if (b.classList.contains("promptbox")) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1400); return; }
    const t = b.textContent; b.classList.add("done"); b.textContent = "Copied";
    setTimeout(() => { b.classList.remove("done"); b.textContent = t; }, 1400);
  }));

  /* Tabs: [data-tabs] > [role=tablist] button[aria-controls] + [role=tabpanel] */
  $$("[data-tabs]").forEach((box) => {
    const tabs = $$('[role="tab"]', box);
    const pick = (t) => tabs.forEach((x) => { const on = x === t; x.setAttribute("aria-selected", String(on)); x.tabIndex = on ? 0 : -1; $("#" + x.getAttribute("aria-controls")).hidden = !on; });
    tabs.forEach((t) => t.addEventListener("click", () => pick(t)));
  });

  /* Pricing: monthly / yearly */
  const bill = $("[data-billing]");
  if (bill) {
    const set = (v) => {
      $$("button", bill).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
      bill.dataset.billing = v;
      $$("[data-month][data-year]").forEach((el) => (el.textContent = el.dataset[v]));
      $$("[data-href-month][data-href-year]").forEach((el) => (el.href = el.dataset[v === "month" ? "hrefMonth" : "hrefYear"]));
    };
    $$("button", bill).forEach((b) => b.addEventListener("click", () => set(b.dataset.v)));
    set("year");
  }


  /* Pricing: pick a plan like in the app's paywall */
  const plans = $$(".pw-plan"), go = $(".pw-go");
  /* The main button buys the selected plan: the app signs the visitor in (or
     up), then opens checkout from /settings?section=billing&checkout=… */
  const APP = "https://use.needt.app";
  const updGo = () => {
    const pl = $(".pw-plan.on"); if (!pl || !go) return;
    const note = $(".pw-cta p"); if (note) note.textContent = pl.dataset.plan === "free"
      ? "No card. Free stays free — and your account starts with 14 days of Pro as a gift."
      : "Secure checkout. You sign in (or create your account) first, then pay. Cancel any time; refunds within 14 days.";
    if (pl.dataset.plan === "free") { go.href = window.NEEDT_SIGNUP || APP + "/auth/signin"; go.textContent = "Start free"; }
    else if (pl.dataset.plan === "lifetime") { go.href = APP + "/settings?section=billing&checkout=lifetime"; go.textContent = "Buy Lifetime — $149 once"; }
    else { const v = (bill && bill.dataset.billing) || "year"; go.href = APP + "/settings?section=billing&checkout=pro-" + v; go.textContent = v === "year" ? "Buy Pro — $59 / year" : "Buy Pro — $7 / month"; }
  };
  const pick = (pl) => { plans.forEach((x) => { const on = x === pl; x.classList.toggle("on", on); x.setAttribute("aria-checked", String(on)); }); updGo(); };
  if (bill) $$("button", bill).forEach((b) => b.addEventListener("click", updGo));
  updGo();
  plans.forEach((pl) => { pl.addEventListener("click", (e) => { if (e.target.closest("button")) { pick(pl); return; } pick(pl); });
    /* Enter/Space on the card picks it; on the Monthly/Yearly buttons inside it they stay the buttons' own. */
    pl.addEventListener("keydown", (e) => { if (e.target !== pl) return; if (e.key === " " || e.key === "Enter") { e.preventDefault(); pick(pl); } }); });

  /* Download (v22): Mac and iPhone sections each carry a small "in the works"
     bar — time from 1 Oct to 30 Nov — plus this visitor's own nudges from
     "I want the … app" (shared between the two, kept in their browser). A
     nudge also opens an optional email form and is sent to Umami when on. */
  const soons = $$("[data-dx-soon]");
  if (soons.length) {
    const S = new Date(2026, 9, 1).getTime(), E = new Date(2026, 10, 30, 23, 59).getTime();
    const base = Math.min(99, Math.max(0, (Date.now() - S) / (E - S)) * 100);
    let boost = 0; try { boost = +localStorage.getItem("needt.dl.boost") || 0; } catch (e) {}
    const show = () => soons.forEach((b) => { const t = Math.min(99, base + boost); $("[data-dx-fill]", b).style.width = base + "%"; const em = $("[data-dx-boost]", b); em.style.left = base + "%"; em.style.width = (t - base) + "%"; $("[data-dx-pct]", b).textContent = Math.round(t) + "%"; });
    requestAnimationFrame(() => requestAnimationFrame(show));
    soons.forEach((box) => {
      const btn = $("[data-dx-want]", box), form = $("[data-dx-notify]", box);
      btn.addEventListener("click", () => {
        boost = Math.min(8, boost + (boost < 3 ? 1.5 : 0.6));
        try { localStorage.setItem("needt.dl.boost", String(boost)); } catch (e) {}
        show(); box.classList.remove("bump"); void box.offsetWidth; box.classList.add("bump");
        $("[data-dx-label]", box).textContent = "You’re on the list"; form.hidden = false;
        try { window.umami && window.umami.track("want-app", { app: btn.textContent.trim() }); } catch (e) {}
      });
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const msg = $("[data-dx-msg]", form), email = form.email.value.trim(); msg.textContent = "Saving…";
        try {
          const r = await fetch(window.NEEDT_WAITLIST || "https://use.needt.app/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, source: "apps" }) });
          if (!r.ok) throw new Error(r.status);
          msg.textContent = "Done — one email, the day it’s out."; form.querySelector("button").disabled = true;
        } catch (err) { msg.textContent = "Couldn’t save that right now — try again later."; }
      });
    });
  }

  /* Docs: highlight the section in view in the side index */
  const toc = $$(".toc a[href^='#']");
  if (toc.length) {
    const map = new Map(toc.map((a) => [a.getAttribute("href").slice(1), a]));
    const seen = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      toc.forEach((a) => a.classList.remove("on"));
      const a = map.get(e.target.id); if (a) a.classList.add("on");
    }), { rootMargin: "-30% 0px -60% 0px" });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) seen.observe(s); });
  }

  /* ── The name at the floor — the old site's wordmark, as is ─────
     One axis, EXPO (−100 fused … 0 crisp Didone … +100 hairline).
     DEVELOP-IN once, the first time it comes into view (easeOutCubic).
     BREATHE a slow travelling wave of ink, each letter 200 ms behind.
     TORCH the pointer thins the letters nearest it, on a spring; the
     breath fades out while the torch is on so two motions never share
     the axis. WEIGHT: it lags the scroll downward and springs back.
     Paused off screen. */
  const fw = $("#floor-word");
  if (fw) {
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

  }
})();

/* v24 — conversion events. Provider-agnostic: pushes to dataLayer and calls plausible()/umami if present.
   Claude Code wires the real provider (see README "Analytics"). */
(() => {
  if (window.__needtTrack) return; window.__needtTrack = 1;
  const send = window.needtTrack = window.needtTrack || ((ev, props = {}) => {
    props.page = location.pathname;
    try { (window.dataLayer = window.dataLayer || []).push({ event: ev, ...props }); } catch (_) {}
    try { if (window.plausible) window.plausible(ev, { props }); } catch (_) {}
    try { if (window.umami && window.umami.track) window.umami.track(ev, props); } catch (_) {}
  });
  const plan = (h) => /checkout=lifetime/.test(h) ? "lifetime" : /checkout=pro-month/.test(h) ? "pro_month" : /checkout=pro/.test(h) ? "pro_year" : null;
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a, button"); if (!a) return;
    const h = a.getAttribute("href") || "";
    const where = a.closest(".nav, .mobile-menu, .m-cta") ? "nav" : a.closest("footer") ? "footer" : "body";
    const p = plan(h);
    if (p) return send("checkout_click", { plan: p, where });
    if (a.classList.contains("js-trial")) return send("trial_click", { where });
    if (a.classList.contains("js-signup")) return send("try_free_click", { where });
    if (a.hasAttribute("data-dx-want")) return send("want_app_click", { app: (a.closest("[data-dx-soon]") || {}).dataset?.dxSoon || "" });
    if (/^https:\/\/use\.needt\.app\/?(auth|$)/.test(h)) return send("open_web_app", { where });
    if (/budget\.needt\.app/.test(h)) return send("budget_click", { where });
  }, true);
  document.addEventListener("submit", (e) => {
    const f = e.target; if (f.matches && f.matches("[data-dx-notify]")) send("notify_submit", { app: (f.closest("[data-dx-soon]") || {}).dataset?.dxSoon || "" });
  }, true);
})();

/* v27 — Compare plans: phone plan switcher */
(() => {
  const seg = document.querySelector(".ct-seg"), wrap = document.querySelector(".ctbl-wrap");
  if (!seg || !wrap) return;
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-col]"); if (!b) return;
    wrap.dataset.show = b.dataset.col;
    seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  });
})();
