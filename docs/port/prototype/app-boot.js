/* app-boot.js — the ONE entry (09.10.26): app.html / app-dev.html.

   Picks the UI by platform (needtPlatform.ui(): phone on iOS / Android or a
   window narrower than 700 px, desktop otherwise; ?ui=phone|desktop wins),
   loads only that UI's code and styles, and mounts it full screen into
   #needt-app:
     desktop → App (App.jsx), as index.html draws it
     phone   → V2pLivePhone bare (mobile-v2-plates.jsx), as mobile.html
               draws it on a phone
   Resizing across the breakpoint (or a rotation) switches UI in place: the
   other UI's code loads once (only the files the first one did not load),
   the root re-renders, and every store keeps its data — the stores and
   needtSync live outside either UI.

   Two sources for "what to load", one loader:
   - app.html (built): window.__NEEDT_APP, written by build.js —
       { ui: { desktop|phone: { css: [href], pre: [src], full: src, only: src,
         lazy: <needt-lazy manifest> | null } } }
     `full` is the UI's whole core bundle (index / mobile order), `only` the
     same minus what the other UI's core already ran (used after a switch).
   - app-dev.html: no manifest; the lists are read from index-dev.html and
     mobile-dev.html themselves (their <link> and <script> tags, in order),
     and every text/babel file is compiled in the browser with the options
     Babel's own script loader uses. Inline scripts of those pages (the
     phone page's frame, the measure harness) are not part of the program.

   window.needtApp → { ui, switchTo(ui), ready: Promise }. */
(function () {
  "use strict";
  var P = window.needtPlatform;
  var M = window.__NEEDT_APP || null;
  var DEV = !M;
  var loadedSrc = {};   /* script src (no query) → true */
  var cssOf = { desktop: M ? M.ui.desktop.css : [], phone: M ? M.ui.phone.css : [] };
  var plan = null;      /* dev: { desktop: [{src, babel, lazy}], phone: [...] } */
  var uiLoaded = {};    /* ui → Promise */
  var current = null, root = null, el = null;

  var bare = function (u) { return String(u).split("?")[0].split("#")[0]; };
  Array.prototype.forEach.call(document.querySelectorAll("script[src]"), function (s) { loadedSrc[bare(s.getAttribute("src"))] = true; });

  /* ---- styles: one <link> per href, switched on / off with the UI ---- */
  function useCss(ui) {
    var list = cssOf[ui] || [], want = {};
    list.forEach(function (h) { want[bare(h)] = h; });
    var have = {};
    Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"][data-ui-css]'), function (l) {
      var k = l.getAttribute("data-ui-css"); have[k] = l; l.disabled = !want[k];
    });
    /* New links go in this UI's page order, each right after the one
       before it, so the cascade is the page's own. */
    var waits = [], prev = null;
    list.forEach(function (h) {
      var k = bare(h);
      if (have[k]) { prev = have[k]; return; }
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = h; l.setAttribute("data-ui-css", k);
      waits.push(new Promise(function (res) { l.onload = l.onerror = res; }));
      if (prev && prev.nextSibling) prev.parentNode.insertBefore(l, prev.nextSibling); else document.head.appendChild(l);
      have[k] = l; prev = l;
    });
    return Promise.all(waits);
  }

  /* ---- scripts ---- */
  function addScript(src) {
    var k = bare(src);
    if (loadedSrc[k]) return Promise.resolve();
    loadedSrc[k] = true;
    return new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error("app-boot: could not load " + src)); };
      document.body.appendChild(s);
    });
  }
  function runCode(code, name) {
    var s = document.createElement("script");
    s.text = code + "\n//# sourceURL=" + name;
    document.body.appendChild(s);
  }
  /* Babel exactly as babel-standalone's transformScriptTags runs a
     text/babel script (presets react + env, no targets; the three plugins). */
  function babelRun(src) {
    var k = bare(src);
    if (loadedSrc[k]) return Promise.resolve();
    loadedSrc[k] = true;
    return fetch(src).then(function (r) { if (!r.ok) throw new Error("app-boot: " + src + " " + r.status); return r.text(); }).then(function (text) {
      var out = window.Babel.transform(text, { filename: k, presets: ["react", "env"], plugins: ["transform-class-properties", "transform-object-rest-spread", "transform-flow-strip-types"], sourceMaps: "inline" });
      runCode(out.code, new URL(src, location.href).href);
    });
  }
  function readPage(name) {
    return fetch(name, { cache: "no-cache" }).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, "text/html");
      var css = Array.prototype.map.call(doc.querySelectorAll('head link[rel="stylesheet"]'), function (l) { return l.getAttribute("href"); });
      var scripts = [];
      Array.prototype.forEach.call(doc.querySelectorAll("script[src]"), function (s) {
        var src = s.getAttribute("src"), type = s.getAttribute("type");
        if (/^https?:|^\/\//.test(src)) return;            /* React, Babel: the app page has its own */
        if (type === "module") return;                       /* needt-icons.js: in the app page's head */
        scripts.push({ src: src, babel: type === "text/babel", lazy: s.getAttribute("data-lazy") || null, head: !!s.closest("head") });
      });
      return { css: css, scripts: scripts };
    });
  }
  function devPlan() {
    if (plan) return plan;
    plan = Promise.all([readPage("index-dev.html"), readPage("mobile-dev.html")]).then(function (r) {
      cssOf.desktop = r[0].css; cssOf.phone = r[1].css;
      return { desktop: r[0].scripts, phone: r[1].scripts };
    });
    return plan;
  }
  function loadUi(ui) {
    if (uiLoaded[ui]) return uiLoaded[ui];
    if (!DEV) {
      var u = M.ui[ui], other = ui === "desktop" ? "phone" : "desktop";
      var after = !!uiLoaded[other];
      var chain = Promise.resolve();
      u.pre.forEach(function (src) {
        chain = chain.then(function () {
          if (/needt-lazy\.js/.test(src) && u.lazy) window.__NEEDT_LAZY = u.lazy;
          return addScript(src);
        });
      });
      uiLoaded[ui] = chain.then(function () { return addScript(after ? u.only : u.full); });
      return uiLoaded[ui];
    }
    uiLoaded[ui] = devPlan().then(function (pl) {
      var chain = Promise.resolve();
      pl[ui].forEach(function (s) {
        chain = chain.then(function () { return s.babel ? babelRun(s.src) : addScript(s.src); });
      });
      return chain;
    });
    return uiLoaded[ui];
  }

  /* ---- the theme the phone wears: the shared setting, resolved ---- */
  function phoneLook() {
    var S = window.needtSettings, v = S ? S.get("theme") : "light";
    return typeof window.v2pResolveTheme === "function" ? window.v2pResolveTheme(v) : v === "dark" ? "dark" : "light";
  }
  function PhoneRoot() {
    var R = window.React;
    var st = R.useState(phoneLook);
    R.useEffect(function () {
      var on = function () { st[1](phoneLook()); };
      window.addEventListener("needt-settings", on);
      return function () { window.removeEventListener("needt-settings", on); };
    }, []);
    var onTheme = function (v) {
      var t = v === "dark" ? "dark" : "light", S = window.needtSettings;
      st[1](t);
      if (S && phoneLook() !== t) S.set("theme", t);
    };
    return R.createElement(window.V2pLivePhone, { bare: true, theme: st[0], onTheme: onTheme });
  }

  function mount(ui) {
    var R = window.React, RD = window.ReactDOM;
    var html = document.documentElement;
    html.setAttribute("data-ui", ui);
    /* Each UI owns <html>'s classes and inline vars while it is up (App
       writes its theme there); a switch starts from a clean element. */
    if (current && current !== ui) { html.className = ""; html.removeAttribute("style"); html.removeAttribute("data-accent"); html.removeAttribute("data-theme-choice"); }
    if (current === "desktop" && ui !== "desktop") window.__app = null;
    if (!el) { el = document.createElement("div"); el.id = "needt-app"; document.body.insertBefore(el, document.body.firstChild); }
    if (!root) root = RD.createRoot(el);
    current = ui;
    root.render(ui === "desktop" ? R.createElement(window.App) : R.createElement(PhoneRoot));
  }

  var busy = Promise.resolve();
  function switchTo(ui) {
    busy = busy.then(function () {
      if (ui === current) return null;
      return Promise.all([useCss(ui), loadUi(ui)]).then(function () { mount(ui); });
    }).catch(function (e) { console.error(e); });
    return busy;
  }

  var first = P ? P.ui() : (window.innerWidth < 700 ? "phone" : "desktop");
  var forced = (function () { try { var q = new URLSearchParams(location.search).get("ui"); return q === "phone" || q === "desktop" ? q : null; } catch (e) { return null; } })();
  document.documentElement.setAttribute("data-ui", first);
  var ready = (DEV ? devPlan() : Promise.resolve()).then(function () { return switchTo(first); });
  if (P && !forced) P.onChange(function () { var u = P.ui(); if (u !== current) switchTo(u); });

  window.needtApp = { get ui() { return current; }, switchTo: switchTo, ready: ready };
})();
