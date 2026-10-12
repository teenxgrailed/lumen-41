/* platform.js — window.needtPlatform: what runs the program and how to reach
   the device (09.10.26).

   Needt ships as ONE program: iOS / Android in a Capacitor shell, macOS /
   Windows in a Tauri shell, and the same pages in a browser. Nothing here is
   installed — Capacitor and Tauri are feature-detected through the globals
   their shells inject (window.Capacitor, window.__TAURI__), and every call
   has a browser fallback, so the prototype runs unchanged in a tab.

     kind      "ios" | "android" | "mac" | "windows" | "web"
     shell     "capacitor" | "tauri" | "browser"
     os        best guess of the operating system even in a browser
               ("ios" | "android" | "mac" | "windows" | "linux" | "other")
     isPhone   true on iOS / Android, or when the window is narrower than
               PHONE_MAX (700 px) — the rule app.html uses to pick a UI
     ui()      "phone" | "desktop": ?ui=phone|desktop wins, else isPhone
     haptic(kind)        "light" | "medium" | "heavy" | "selection" |
                         "success" | "warning" | "error"; Capacitor Haptics,
                         else navigator.vibrate, else nothing
     share({ title, text, url })  → Promise<{ ok, via }>: Capacitor Share,
                         navigator.share, else the clipboard (via "clipboard")
     pickFile({ accept, multiple }) → Promise<File[]> ([] when cancelled):
                         a hidden <input type="file"> (works in both shells'
                         webviews; swap for the native dialog plugins later)
     notify({ title, body, at })  → Promise<{ ok, via }>: Capacitor
                         LocalNotifications, Tauri notification, the web
                         Notification API (asks once), else window.toast
     safeArea            { top, right, bottom, left } in px from
                         env(safe-area-inset-*), kept current on resize
     openExternal(url)   Capacitor Browser, Tauri opener / shell, else a new tab
     onChange(fn)        called when isPhone / safeArea change (resize,
                         rotation); returns unsubscribe */
(function () {
  "use strict";
  if (window.needtPlatform) return;
  var PHONE_MAX = 700;
  var nav = window.navigator || {};
  var ua = String(nav.userAgent || "");
  var cap = function () { var C = window.Capacitor; return C && (typeof C.isNativePlatform !== "function" || C.isNativePlatform()) ? C : null; };
  var tauri = function () { return window.__TAURI__ || null; };
  var plugin = function (name) { var C = cap(); return C && C.Plugins && C.Plugins[name] ? C.Plugins[name] : null; };

  var os = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) ? "ios"
    : /Android/.test(ua) ? "android" : /Mac OS X|Macintosh/.test(ua) ? "mac" : /Windows/.test(ua) ? "windows" : /Linux/.test(ua) ? "linux" : "other";
  var shell = cap() ? "capacitor" : tauri() || window.__TAURI_INTERNALS__ ? "tauri" : "browser";
  var kind = "web";
  if (shell === "capacitor") { var p = cap().getPlatform ? cap().getPlatform() : os; kind = p === "android" ? "android" : "ios"; }
  else if (shell === "tauri") kind = os === "windows" ? "windows" : "mac";

  var subs = [];
  var emit = function () { subs.forEach(function (f) { try { f(api); } catch (e) { console.error(e); } }); };

  /* Safe area: a probe with padding: env(safe-area-inset-*) — the only way
     to read the insets from script in every engine. */
  var safe = { top: 0, right: 0, bottom: 0, left: 0 }, probe = null;
  function readSafe() {
    if (!document.body) return;
    if (!probe) {
      probe = document.createElement("div");
      probe.setAttribute("aria-hidden", "true");
      probe.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
        "padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)";
      document.body.appendChild(probe);
    }
    var cs = getComputedStyle(probe);
    var next = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
    var changed = ["top", "right", "bottom", "left"].some(function (k) { return next[k] !== safe[k]; });
    safe = next;
    return changed;
  }
  var phoneNow = null;
  function isPhone() { return kind === "ios" || kind === "android" || window.innerWidth < PHONE_MAX; }
  function onResize() {
    var a = readSafe(), b = isPhone();
    if (a || b !== phoneNow) { phoneNow = b; emit(); }
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { readSafe(); phoneNow = isPhone(); });
  else { readSafe(); phoneNow = isPhone(); }

  function query(name) { try { return new URLSearchParams(window.location.search).get(name); } catch (e) { return null; } }

  var HAPTIC_MS = { light: 8, selection: 6, medium: 14, heavy: 22, success: [10, 40, 14], warning: [14, 50, 14], error: [20, 40, 20, 40, 20] };
  function haptic(k) {
    k = k || "light";
    var H = plugin("Haptics");
    try {
      if (H) {
        if (k === "selection") return H.selectionChanged ? H.selectionChanged() : H.impact({ style: "LIGHT" });
        if (k === "success" || k === "warning" || k === "error") return H.notification({ type: k.toUpperCase() });
        return H.impact({ style: k === "heavy" ? "HEAVY" : k === "medium" ? "MEDIUM" : "LIGHT" });
      }
      if (typeof nav.vibrate === "function") nav.vibrate(HAPTIC_MS[k] || 8);
    } catch (e) { /* no haptics */ }
    return undefined;
  }

  function copy(text) {
    try { if (nav.clipboard && nav.clipboard.writeText) return nav.clipboard.writeText(text).then(function () { return { ok: true, via: "clipboard" }; }, function () { return { ok: false, via: "clipboard" }; }); } catch (e) { /* no clipboard */ }
    return Promise.resolve({ ok: false, via: "none" });
  }
  function share(o) {
    o = o || {};
    var S = plugin("Share");
    if (S) return S.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title }).then(function () { return { ok: true, via: "native" }; }, function () { return { ok: false, via: "native" }; });
    if (shell === "browser" && typeof nav.share === "function") {
      return nav.share({ title: o.title, text: o.text, url: o.url }).then(function () { return { ok: true, via: "native" }; }, function (e) {
        /* Dismissed is an answer, not a failure to fall back from. */
        return e && e.name === "AbortError" ? { ok: false, via: "native" } : copy(o.url || o.text || "");
      });
    }
    return copy(o.url || o.text || "");
  }

  function pickFile(o) {
    o = o || {};
    return new Promise(function (resolve) {
      var input = document.createElement("input");
      input.type = "file";
      if (o.accept) input.accept = o.accept;
      if (o.multiple) input.multiple = true;
      input.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      var done = false;
      var finish = function (files) { if (done) return; done = true; window.removeEventListener("focus", onFocus); input.remove(); resolve(files); };
      /* Cancel fires "cancel" in new engines; elsewhere focus comes back with no change. */
      var onFocus = function () { setTimeout(function () { if (!input.files || !input.files.length) finish([]); }, 400); };
      input.addEventListener("change", function () { finish(Array.prototype.slice.call(input.files || [])); });
      input.addEventListener("cancel", function () { finish([]); });
      document.body.appendChild(input);
      window.addEventListener("focus", onFocus);
      input.click();
    });
  }

  function notify(o) {
    o = o || {};
    var L = plugin("LocalNotifications");
    if (L) return L.schedule({ notifications: [{ id: Math.floor(Math.random() * 2e9), title: o.title || "Needt", body: o.body || "", schedule: o.at ? { at: new Date(o.at) } : undefined }] })
      .then(function () { return { ok: true, via: "native" }; }, function () { return { ok: false, via: "native" }; });
    var T = tauri();
    if (T && T.notification && T.notification.sendNotification) { try { T.notification.sendNotification({ title: o.title || "Needt", body: o.body || "" }); return Promise.resolve({ ok: true, via: "native" }); } catch (e) { /* fall through */ } }
    var N = window.Notification;
    var toast = function () { if (window.toast) window.toast((o.title ? o.title + " — " : "") + (o.body || "")); return { ok: true, via: "toast" }; };
    if (!o.at && typeof N === "function") {
      var show = function () { try { new N(o.title || "Needt", { body: o.body || "", icon: "app-icon/needt-icon-small.svg" }); return { ok: true, via: "web" }; } catch (e) { return toast(); } };
      if (N.permission === "granted") return Promise.resolve(show());
      if (N.permission !== "denied" && N.requestPermission) return Promise.resolve(N.requestPermission()).then(function (p) { return p === "granted" ? show() : toast(); }, toast);
    }
    return Promise.resolve(toast());
  }

  function openExternal(url) {
    var B = plugin("Browser");
    if (B) return B.open({ url: url });
    var T = tauri();
    try {
      if (T && T.opener && T.opener.openUrl) return T.opener.openUrl(url);
      if (T && T.shell && T.shell.open) return T.shell.open(url);
    } catch (e) { /* fall through */ }
    try { window.open(url, "_blank", "noopener"); } catch (e) { /* blocked */ }
    return undefined;
  }

  var api = {
    kind: kind, shell: shell, os: os, PHONE_MAX: PHONE_MAX,
    get isPhone() { return isPhone(); },
    get safeArea() { readSafe(); return Object.assign({}, safe); },
    ui: function () { var q = query("ui"); return q === "phone" || q === "desktop" ? q : isPhone() ? "phone" : "desktop"; },
    haptic: haptic, share: share, pickFile: pickFile, notify: notify, openExternal: openExternal, copy: copy,
    onChange: function (f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }
  };
  window.needtPlatform = api;
})();
