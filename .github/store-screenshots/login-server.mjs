// CI-only. The iOS shell built for the store screenshots (apps/ios/ci/
// capacitor.config.ci.json) opens http://127.0.0.1:3001/. This server:
//   - answers "/" with the session cookie CI got from the web app's credentials
//     endpoint and a redirect to the screen named in a file, so the WebView is
//     signed in without the system sign-in sheet (a runner cannot click it);
//   - answers GET /__state with what the page itself last reported about itself
//     (route, loading skeletons, requests in flight): ios-shots.sh waits on
//     that before every screenshot. GET /__state?reset=1 clears it;
//   - proxies everything else to the web app on :3000, so the WebView stays on
//     one origin, and injects a small error reporter into HTML pages. Whatever
//     the page throws is POSTed to /__err and written to the log, because a
//     simulator gives no other way to read the WebView's JavaScript errors.
//
//   node login-server.mjs <cookie file (name=value)> <target file> <port>
import fs from "node:fs";
import http from "node:http";

const [cookieFile, targetFile, port] = process.argv.slice(2);
if (!cookieFile || !targetFile || !port) {
  console.error("usage: login-server.mjs <cookie file> <target file> <port>");
  process.exit(2);
}

const UPSTREAM = { host: "127.0.0.1", port: 3000 };
const REPORTER = `<script>(function(){function s(k,m){try{var x=new XMLHttpRequest();x.open("POST","/__err",true);x.send(k+": "+String(m).slice(0,3000));}catch(e){}}
s("load",navigator.userAgent+" "+location.href+" cap="+(window.Capacitor?window.Capacitor.getPlatform():"none"));
window.addEventListener("error",function(e){s("error",(e.message||"")+" @"+(e.filename||"")+":"+(e.lineno||"")+(e.error&&e.error.stack?"\\n"+e.error.stack:""));});
window.addEventListener("unhandledrejection",function(e){s("rejection",(e.reason&&e.reason.stack?e.reason.message+"\\n"+e.reason.stack:e.reason));});
var ce=console.error;console.error=function(){try{s("console.error",Array.prototype.map.call(arguments,function(a){return a&&a.stack?(a.name+": "+a.message+"\\n"+a.stack):String(a);}).join(" "));}catch(_){}ce.apply(console,arguments);};})();</script>`;

// Runs in the WebView before the app's own scripts (so it sees every request).
// Reports the page's own state to /__state twice a second.
function pageProbe() {
  var inflight = 0;
  var last = Date.now();
  var SKELETONS =
    '.st-sk,.st-skeleton,.mb-skel,.glass-skeleton,.nt-skeleton,' +
    '.st-route-loading,[data-route-loading],[data-p5-state="loading"],[aria-busy="true"]';
  function skip(u) {
    return /\/__(err|state)/.test(String(u));
  }
  function begin() {
    inflight++;
  }
  function end() {
    inflight = Math.max(0, inflight - 1);
    last = Date.now();
  }
  var f = window.fetch;
  if (f) {
    window.fetch = function (input) {
      var u = typeof input === "string" ? input : input && (input.url || input.href);
      if (skip(u)) return f.apply(this, arguments);
      begin();
      var p = f.apply(this, arguments);
      p.then(end, end);
      return p;
    };
  }
  var open = XMLHttpRequest.prototype.open;
  var send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) {
    this.__skip = skip(u);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (!this.__skip) {
      begin();
      this.addEventListener("loadend", end);
    }
    return send.apply(this, arguments);
  };
  function visible(el) {
    return el.getClientRects().length > 0;
  }
  function state() {
    var scope = document.querySelector(".needt-v3");
    return {
      path: location.pathname,
      readyState: document.readyState,
      skeletons: Array.prototype.filter.call(document.querySelectorAll(SKELETONS), visible).length,
      inflight: inflight,
      idleMs: Date.now() - last,
      scope: !!scope,
      text: scope ? (scope.innerText || "").trim().length : 0,
      imgsPending: Array.prototype.filter.call(document.images, function (i) {
        return !i.complete && visible(i);
      }).length,
    };
  }
  setInterval(function () {
    try {
      var x = new XMLHttpRequest();
      x.open("POST", "/__state", true);
      x.send(JSON.stringify(state()));
    } catch {
      // the report is best-effort
    }
  }, 500);
}
const PROBE = `<script>(${pageProbe.toString()})();</script>`;

let pageState = null;

function log(line) {
  console.log(`${new Date().toISOString()} ${line}`);
}

http
  .createServer((req, res) => {
    const url = req.url || "/";

    if (url === "/__err") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        log(
          `PAGE ${Buffer.concat(chunks).toString("utf8").replace(/\n/g, "\n    ")}`
        );
        res.writeHead(204).end();
      });
      return;
    }

    if (url === "/__state" && req.method === "POST") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          pageState = {
            ...JSON.parse(Buffer.concat(chunks).toString("utf8")),
            receivedAt: Date.now(),
          };
        } catch {
          // a malformed report is ignored
        }
        res.writeHead(204).end();
      });
      return;
    }

    if (url.startsWith("/__state")) {
      if (url.includes("reset=1")) pageState = null;
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          pageState ? { ...pageState, ageMs: Date.now() - pageState.receivedAt } : {}
        )
      );
      return;
    }

    if (url === "/" || url.startsWith("/?")) {
      const cookie = fs.readFileSync(cookieFile, "utf8").trim();
      let target = "/today";
      try {
        target = fs.readFileSync(targetFile, "utf8").trim() || target;
      } catch {
        // no target yet: Today
      }
      log(`${req.method} ${url} -> ${target}`);
      res.writeHead(302, {
        Location: target,
        "Set-Cookie": `${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
        "Cache-Control": "no-store",
      });
      res.end();
      return;
    }

    const headers = { ...req.headers, host: "127.0.0.1:3000" };
    delete headers["accept-encoding"];
    const up = http.request(
      { ...UPSTREAM, method: req.method, path: url, headers },
      (ur) => {
        const out = { ...ur.headers };
        if (typeof out.location === "string") {
          out.location = out.location.replace("http://127.0.0.1:3000", "");
        }
        const isHtml = String(out["content-type"] || "").includes("text/html");
        if (!isHtml) {
          res.writeHead(ur.statusCode || 502, out);
          ur.pipe(res);
          return;
        }
        const chunks = [];
        ur.on("data", (c) => chunks.push(c));
        ur.on("end", () => {
          let body = Buffer.concat(chunks).toString("utf8");
          body = body.replace(/<head[^>]*>/i, (m) => m + REPORTER + PROBE);
          delete out["transfer-encoding"];
          out["content-length"] = String(Buffer.byteLength(body));
          log(
            `${req.method} ${url} ${ur.statusCode} html ${Buffer.byteLength(body)}b`
          );
          res.writeHead(ur.statusCode || 502, out);
          res.end(body);
        });
      }
    );
    up.on("error", (e) => {
      log(`proxy error ${url} ${e.message}`);
      res.writeHead(502).end();
    });
    req.pipe(up);
  })
  .listen(Number(port), "127.0.0.1", () => {
    log(`login + proxy on 127.0.0.1:${port}`);
  });
