/* needt-lazy.js — script groups that load on demand (08.10.26).

   The built pages (index.html, mobile.html — written by build.js) carry a
   manifest, window.__NEEDT_LAZY, before this file:

     { v, groups: { settings: { src, deps: [...], names: { comp: [...], fn: [...] }, hold: [...] }, … } }

   For every group this installs, before any app script runs:
   - a stand-in component for each component the core renders by name
     (window.SettingsScreen, window.DocsScreen, PwHost…). It loads its group
     and draws a skeleton (StSkeleton) for a screen, nothing for a sheet;
     when the group lands the real component replaces it (the group's own
     declarations overwrite the global), and "needt:lazy" re-renders the app;
   - a stand-in function for each function the core calls (needtImport…),
     which loads the group and then calls the real one;
   - a holder for each window event the group listens to at load
     ("needt-mail"…): fired before the group is in, the event is replayed once
     it is.
   After first paint every group is fetched and run in idle time, in order,
   so later navigation never waits.

   Without a manifest (index-dev.html / mobile-dev.html, which load every
   script eagerly through Babel) nothing is installed: load() resolves at once
   and ready() is true. API: window.needtLazy.{ load, ready, prefetch, groups }. */
(function () {
  "use strict";
  var M = window.__NEEDT_LAZY || null;
  var G = (M && M.groups) || {};
  var pending = {}, done = {};
  var SCREEN_KIND = { DocsScreen: "grid", DocumentScreen: "page", MoodboardsScreen: "grid", TemplatesScreen: "grid", SharedScreen: "grid",
    TrashScreen: "list", HabitsScreen: "list", MailScreen: "list", ConnectionsScreen: "cards" };

  function ready(g) { return !G[g] || !!done[g]; }
  function emit(g) { try { window.dispatchEvent(new CustomEvent("needt:lazy", { detail: g })); } catch (e) {} }
  function inject(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { s.remove(); rej(new Error("needt-lazy: could not load " + src)); };
      document.head.appendChild(s);
    });
  }
  function load(g) {
    var def = G[g];
    if (!def || done[g]) return Promise.resolve();
    if (pending[g]) return pending[g];
    pending[g] = Promise.all((def.deps || []).map(load))
      .then(function () { return inject(def.src); })
      .then(function () { done[g] = true; emit(g); }, function (err) { delete pending[g]; console.error(err); throw err; });
    return pending[g];
  }

  function stubComponent(g, name) {
    function LazyStub(props) {
      var R = window.React, tick = R.useState(0)[1];
      /* A sheet mounted closed (open={false}) waits for the idle prefetch
         or for its first open; anything else asks for its group at once. */
      var wait = props && props.open === false;
      R.useEffect(function () {
        if (wait) return undefined;
        var live = true;
        load(g).then(function () { if (live) tick(1); }, function () {});
        return function () { live = false; };
      }, [wait]);
      var C = window[name];
      if (done[g] && C && C !== LazyStub) return R.createElement(C, props);
      var kind = SCREEN_KIND[name];
      return kind && window.StSkeleton ? R.createElement("div", { "data-lazy-loading": g }, window.StSkeleton(kind)) : null;
    }
    LazyStub.displayName = "Lazy(" + name + ")";
    return LazyStub;
  }
  function stubFunction(g, name) {
    var stub = function () {
      var args = arguments, self = this;
      return load(g).then(function () {
        var f = window[name];
        if (typeof f === "function" && f !== stub) return f.apply(self, args);
      });
    };
    return stub;
  }
  function holdEvent(type, g) {
    window.addEventListener(type, function (e) {
      if (done[g] || (e.detail && e.detail.__lazyReplay)) return;
      var detail = e.detail;
      load(g).then(function () {
        window.dispatchEvent(new CustomEvent(type, { detail: detail }));
      }, function () {});
    });
  }

  Object.keys(G).forEach(function (g) {
    var n = G[g].names || {};
    /* Always replaced: build.js only lists names no core script declares,
       and a same-named global from elsewhere (the DS bundle has a demo
       DocsScreen) is what the group itself would overwrite in the dev page. */
    (n.comp || []).forEach(function (name) { window[name] = stubComponent(g, name); });
    (n.fn || []).forEach(function (name) { window[name] = stubFunction(g, name); });
    (G[g].hold || []).forEach(function (type) { holdEvent(type, g); });
  });

  /* Idle prefetch: after the first paint, one group per idle slot, in the
     manifest's order (deps first). */
  var prefetched = false;
  function prefetch() {
    if (prefetched || !M) return; prefetched = true;
    var list = Object.keys(G), i = 0;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 60); };
    (function next() {
      if (i >= list.length) return;
      idle(function () { load(list[i++]).then(next, next); }, { timeout: 2000 });
    })();
  }
  /* window.__NEEDT_NO_PREFETCH (set before the page loads) turns the idle
     prefetch off, to test every group arriving on demand. */
  if (M && !window.__NEEDT_NO_PREFETCH) {
    var start = function () { setTimeout(prefetch, M.prefetchDelay == null ? 600 : M.prefetchDelay); };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start);
  }

  window.needtLazy = { load: load, ready: ready, prefetch: prefetch, groups: G, built: !!M };
})();
