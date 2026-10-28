/* sub.js — motion for the "More from Needt" pages: the live chat ↔ app stage, live windows,
   reveals and the self-scrolling Budget screens. Everything waits for the element to be on screen
   and stops when it leaves. Reduced motion: final states, no loops. */
(() => {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const io = (el, on, off, th = 0.35) => {
    if (!("IntersectionObserver" in window)) { on(); return; }
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? on() : off && off())), { threshold: th }).observe(el);
  };
  // reveals
  document.querySelectorAll(".sx-rv").forEach((el) => io(el, () => el.classList.add("in"), null, 0.15));
  document.querySelectorAll(".lw").forEach((el) => io(el, () => el.classList.add("on"), null, 0.3));

  // live stage
  const lv = document.querySelector(".lv[data-scenes]");
  if (lv) {
    const S = JSON.parse(lv.dataset.scenes);
    const u = lv.querySelector(".lv-u"), tool = lv.querySelector(".lv-tool"), tl = tool.querySelector("span:last-child"), a = lv.querySelector(".lv-a");
    const imgs = [...lv.querySelectorAll(".lv-scr img")], tabs = [...lv.querySelectorAll(".lv-tabs button")];
    const byName = (n) => imgs.find((i) => i.dataset.s === n);
    let k = 0, timers = [], running = false, visible = false;
    const T = (fn, ms) => timers.push(setTimeout(fn, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const show = (n) => imgs.forEach((i) => i.classList.toggle("on", i.dataset.s === n));
    function play(i, auto) {
      clear(); k = (i + S.length) % S.length; const s = S[k];
      tabs.forEach((b, j) => { b.classList.toggle("on", j === k); b.style.setProperty("--dur", (s.dur || 6.5) + "s"); });
      tool.classList.remove("on", "ok"); a.classList.remove("on"); tl.textContent = s.tool; a.innerHTML = s.reply;
      show(s.before || s.after);
      if (RM) { u.textContent = s.say; tool.classList.add("on", "ok"); a.classList.add("on"); show(s.after); return; }
      u.innerHTML = '<span class="car"></span>'; let n = 0;
      const typeStep = () => { n++; u.innerHTML = s.say.slice(0, n).replace(/&/g, "&amp;").replace(/</g, "&lt;") + (n < s.say.length ? '<span class="car"></span>' : ""); if (n < s.say.length) T(typeStep, 26 + Math.random() * 30); else T(after, 380); };
      const after = () => { tool.classList.add("on"); T(() => { tool.classList.add("ok"); show(s.after); }, 900); T(() => a.classList.add("on"), 1500); if (auto !== false) T(() => visible && play(k + 1), (s.dur || 6.5) * 1000); };
      T(typeStep, 350);
    }
    tabs.forEach((b, j) => b.addEventListener("click", () => play(j)));
    lv.addEventListener("mouseenter", () => lv.classList.add("paused"));
    lv.addEventListener("mouseleave", () => lv.classList.remove("paused"));
    io(lv, () => { visible = true; if (!running) { running = true; play(k); } }, () => { visible = false; running = false; clear(); }, 0.35);
  }

  // Budget: each long screen scrolls to its own bottom
  document.querySelectorAll(".bx-stage").forEach((st) => {
    const fit = () => st.querySelectorAll(".bx-ph").forEach((ph) => {
      const scr = ph.querySelector(".lv-scr"), img = scr.querySelector("img");
      if (!img.naturalWidth) return;
      const h = (scr.clientWidth / img.naturalWidth) * img.naturalHeight, d = Math.max(0, h - scr.clientHeight);
      img.style.setProperty("--y", -d + "px"); img.style.setProperty("--t", Math.max(12, d / 38) + "s");
    });
    st.querySelectorAll("img").forEach((i) => i.complete ? fit() : i.addEventListener("load", fit));
    addEventListener("resize", fit);
    if (!RM) io(st, () => st.classList.add("play"), () => st.classList.remove("play"), 0.25);
  });
})();
