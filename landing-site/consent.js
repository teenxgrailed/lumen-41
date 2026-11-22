/* Needt cookie consent (landing). One choice for needt.app and use.needt.app:
   the first-party cookie needt_consent=accepted|declined, scoped to .needt.app, 180 days.
   Nothing non-essential loads before "accepted". Today that is only the self-hosted,
   cookieless Umami script. The app (use.needt.app) reads the same cookie. */
(function () {
  "use strict";
  var COOKIE = "needt_consent";
  var MAX_AGE = 15552000; /* 180 days */
  var UMAMI_SRC = "https://stats.needt.app/script.js";
  var PRIVACY = "https://use.needt.app/privacy";
  var me = document.currentScript;
  var umamiId = (me && me.getAttribute("data-umami-id")) || "";
  var root = document.documentElement;
  var banner = null;
  var reopened = false;

  function read() {
    var m = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
    var v = "";
    try {
      v = m ? decodeURIComponent(m[1]) : "";
    } catch (e) {
      v = ""; /* malformed cookie value: treat as no choice */
    }
    return v === "accepted" || v === "declined" ? v : null;
  }

  function write(value) {
    var host = location.hostname;
    var c = COOKIE + "=" + value + "; Max-Age=" + MAX_AGE + "; Path=/; SameSite=Lax";
    if (host === "needt.app" || /\.needt\.app$/.test(host)) c += "; Domain=.needt.app; Secure";
    else if (location.protocol === "https:") c += "; Secure";
    document.cookie = c;
  }

  function setUmamiDisabled(off) {
    try {
      if (off) localStorage.setItem("umami.disabled", "1");
      else localStorage.removeItem("umami.disabled");
    } catch (e) {}
  }

  /* Events wait here until Umami is loaded and the visitor accepted. A first-time
     visitor answers the banner after the page load, so a bare umami.track() at
     "load" lost that visit; a queued event is sent the moment both are true.
     A declined visitor drops everything. */
  var queue = [];

  function flush() {
    if (read() === "declined") {
      queue = [];
      return;
    }
    if (read() !== "accepted") return;
    if (!(window.umami && typeof window.umami.track === "function")) return;
    while (queue.length) {
      var e = queue.shift();
      try {
        window.umami.track(e[0], e[1]);
      } catch (err) {}
    }
  }

  function track(name, data) {
    if (read() === "declined") return;
    if (queue.length < 20) queue.push([name, data]);
    flush();
  }

  function loadAnalytics() {
    if (!umamiId || umamiId.indexOf("__") === 0) return; /* ID not set at deploy yet */
    if (document.querySelector("script[data-needt-umami]")) {
      flush();
      return;
    }
    var s = document.createElement("script");
    s.defer = true;
    s.onload = flush;
    s.src = UMAMI_SRC;
    s.setAttribute("data-website-id", umamiId);
    s.setAttribute("data-do-not-track", "true");
    s.setAttribute("data-needt-umami", "");
    document.head.appendChild(s);
  }

  function close() {
    if (!banner) return;
    if (banner.parentNode) banner.parentNode.removeChild(banner);
    banner = null;
    root.classList.remove("cc-open");
    root.style.removeProperty("--cc-h");
  }

  function choose(value) {
    write(value);
    if (value === "accepted") {
      setUmamiDisabled(false);
      loadAnalytics();
    } else {
      setUmamiDisabled(true);
      queue = [];
    }
    close();
  }

  function open(focus) {
    if (banner) {
      if (focus) banner.focus();
      return;
    }
    reopened = !!read();
    var el = document.createElement("section");
    el.className = "cc";
    el.setAttribute("aria-label", "Cookie consent");
    el.tabIndex = -1;
    el.innerHTML =
      "<p>We use privacy-friendly analytics to see which pages help. It stays off until you accept. " +
      "If you decline, we only use what the site needs to work. " +
      '<a href="' + PRIVACY + '">Privacy</a></p>' +
      '<div class="cc-actions">' +
      '<button type="button" class="btn btn-raised btn-sm" data-cc="declined">Decline</button>' +
      '<button type="button" class="btn btn-raised btn-sm" data-cc="accepted">Accept</button>' +
      "</div>";
    el.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-cc]");
      if (b) choose(b.getAttribute("data-cc"));
    });
    /* Esc never changes the choice. With a saved choice it just closes the banner. */
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && reopened) close();
    });
    document.body.insertBefore(el, document.body.firstChild);
    banner = el;
    root.classList.add("cc-open");
    root.style.setProperty("--cc-h", el.offsetHeight + "px");
    el.classList.add("cc-in");
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.classList.remove("cc-in");
      });
    });
    if (focus) el.focus();
  }

  /* Sign-up links into the app. The app opens on the create-account form
     (?mode=signup) and keeps the campaign tags of this visit (utm_*), so
     the server can attach them to signup_completed. A "Log in" link keeps its
     plain address. Rewritten when the page is ready and again at click time,
     because other scripts set some hrefs late. */
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];
  var SIGNIN = /^https:\/\/use\.needt\.app\/auth\/signin(?:[?#]|$)/;
  var LOGIN_TEXT = /^\s*(log\s?in|sign\s?in)\b/i;

  /* The tags of this visit: the address first, else what the first page of the
     visit kept (the hero "Try it free" goes to /pricing/ before sign-up, and
     the tags must survive that hop). Kept per tab, never when declined. */
  var STORE_KEY = "needt_utm";

  function utmTags() {
    var here = new URLSearchParams(location.search);
    var tags = {};
    var found = false;
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var v = here.get(UTM_KEYS[i]);
      if (v) {
        tags[UTM_KEYS[i]] = v;
        found = true;
      }
    }
    if (found) {
      if (read() !== "declined") {
        try {
          sessionStorage.setItem(STORE_KEY, JSON.stringify(tags));
        } catch (e) {}
      }
      return tags;
    }
    try {
      var kept = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
      return kept && typeof kept === "object" ? kept : {};
    } catch (e) {
      return {};
    }
  }

  function signupUrl(href, asLogin) {
    if (!SIGNIN.test(href || "")) return href;
    var u;
    try {
      u = new URL(href);
    } catch (e) {
      return href;
    }
    if (!asLogin && !u.searchParams.has("mode")) u.searchParams.set("mode", "signup");
    var here = utmTags();
    for (var i = 0; i < UTM_KEYS.length; i++) {
      var v = here[UTM_KEYS[i]];
      if (v && !u.searchParams.has(UTM_KEYS[i])) u.searchParams.set(UTM_KEYS[i], v);
    }
    return u.toString();
  }

  function decorate(a) {
    var h = a && a.getAttribute && a.getAttribute("href");
    if (!h || !SIGNIN.test(h)) return;
    /* An explicit data-cta wins over the label: the sign-up CTAs read "Log in" since 22.11.2026. */
    var cta = a.getAttribute("data-cta");
    var next = signupUrl(h, cta === "signup" ? false : cta === "login" ? true : LOGIN_TEXT.test(a.textContent || ""));
    if (next !== h) a.setAttribute("href", next);
  }

  function decorateAll() {
    var list = document.querySelectorAll('a[href^="https://use.needt.app/auth/signin"]');
    for (var i = 0; i < list.length; i++) decorate(list[i]);
  }

  ["click", "auxclick", "contextmenu", "touchstart", "focusin"].forEach(function (type) {
    document.addEventListener(
      type,
      function (e) {
        decorate(e.target && e.target.closest && e.target.closest("a"));
      },
      true
    );
  });
  utmTags(); /* keep this visit's tags before any link is followed */
  document.addEventListener("DOMContentLoaded", decorateAll);
  window.addEventListener("load", decorateAll);

  window.NeedtConsent = {
    get: read,
    track: track,
    signupUrl: function (href) {
      return signupUrl(href, false);
    },
    allowed: function () {
      return read() === "accepted";
    },
    open: function () {
      open(true);
    },
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-cookie-settings]");
    if (a) {
      e.preventDefault();
      open(true);
    }
  });

  function init() {
    var v = read();
    /* umami.disabled lives in per-origin localStorage, the choice in the shared cookie: re-sync */
    if (v === "accepted") {
      setUmamiDisabled(false);
      loadAnalytics();
    } else if (v === "declined") setUmamiDisabled(true);
    else open(false);
  }
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
