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
    var v = m ? decodeURIComponent(m[1]) : "";
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

  function loadAnalytics() {
    if (!umamiId || umamiId.indexOf("__") === 0) return; /* ID not set at deploy yet */
    if (document.querySelector("script[data-needt-umami]")) return;
    var s = document.createElement("script");
    s.defer = true;
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

  window.NeedtConsent = {
    get: read,
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
    if (v === "accepted") loadAnalytics();
    else if (!v) open(false);
  }
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
