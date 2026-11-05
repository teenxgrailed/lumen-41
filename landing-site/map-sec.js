/* v52 — Agents Map film: sources added only near the viewport, plays only while on screen,
   poster only under reduced motion or Save-Data. */
(function () {
  var v = document.querySelector(".am-vid"); if (!v) return;
  var fr = v.closest(".am-frame");
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.connection && navigator.connection.saveData);
  v.poster = v.dataset.poster;
  if (calm) return;
  var loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    [["webm", "video/webm"], ["mp4", "video/mp4"]].forEach(function (p) { var s = document.createElement("source"); s.src = v.dataset[p[0]]; s.type = p[1]; v.appendChild(s); });
    v.preload = "auto"; v.load();
  }
  new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) load(); }); }, { rootMargin: "600px 0px" }).observe(v);
  new IntersectionObserver(function (es) { es.forEach(function (e) {
    if (e.isIntersecting) { var p = v.play(); if (p && p.then) p.then(function () { fr.classList.add("playing"); }).catch(function () {}); }
    else v.pause();
  }); }, { threshold: .35 }).observe(v);
})();
