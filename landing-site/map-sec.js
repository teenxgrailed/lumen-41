/* v52 — Agents Map film: sources added only near the viewport, plays only while on screen,
   poster only under reduced motion or Save-Data. Plays as soon as it can if it is already in view. */
(function () {
  var v = document.querySelector(".am-vid"); if (!v) return;
  var fr = v.closest(".am-frame");
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  v.poster = v.dataset.poster;
  if (calm) return;
  var loaded = false, inView = false;
  function load() {
    if (loaded) return; loaded = true;
    [["webm", "video/webm"], ["mp4", "video/mp4"]].forEach(function (p) { var s = document.createElement("source"); s.src = v.dataset[p[0]]; s.type = p[1]; v.appendChild(s); });
    v.preload = "auto"; v.load();
  }
  function tryPlay() { if (!inView || !loaded) return; var p = v.play(); if (p && p.then) p.then(function () { fr.classList.add("playing"); }).catch(function () {}); }
  v.addEventListener("canplay", tryPlay);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (es) { if (es[0].isIntersecting) load(); }, { rootMargin: "600px 0px" }).observe(v);
    new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) { load(); tryPlay(); } else v.pause(); }, { threshold: .25 }).observe(v);
  } else { inView = true; load(); }
})();
