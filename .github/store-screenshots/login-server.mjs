// CI-only. The iOS shell built for the store screenshots (apps/ios/ci/
// capacitor.config.ci.json) opens http://127.0.0.1:3001/. This server:
//   - answers "/" with the session cookie CI got from the web app's credentials
//     endpoint and a redirect to the screen named in a file, so the WebView is
//     signed in without the system sign-in sheet (a runner cannot click it);
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
window.addEventListener("unhandledrejection",function(e){s("rejection",(e.reason&&e.reason.stack)||e.reason);});
var ce=console.error;console.error=function(){try{s("console.error",Array.prototype.map.call(arguments,function(a){return (a&&a.stack)||String(a);}).join(" "));}catch(_){}ce.apply(console,arguments);};})();</script>`;

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
          body = body.replace(/<head[^>]*>/i, (m) => m + REPORTER);
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
