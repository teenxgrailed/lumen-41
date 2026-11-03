// CI-only. The iOS shell built for the store screenshots (apps/ios/ci/
// capacitor.config.ci.json) opens http://127.0.0.1:3001/. This answers every
// request with the session cookie CI got from the web app's credentials
// endpoint and a redirect to the screen named in a file, so the WebView is
// signed in without the system sign-in sheet (which a runner cannot click
// through). Cookies are not port-scoped, so the cookie set here is the one
// the web app on :3000 sees.
//
//   node login-server.mjs <cookie file (name=value)> <target file> <port>
import fs from "node:fs";
import http from "node:http";

const [cookieFile, targetFile, port] = process.argv.slice(2);
if (!cookieFile || !targetFile || !port) {
  console.error("usage: login-server.mjs <cookie file> <target file> <port>");
  process.exit(2);
}

http
  .createServer((req, res) => {
    const cookie = fs.readFileSync(cookieFile, "utf8").trim();
    let target = "/today";
    try {
      target = fs.readFileSync(targetFile, "utf8").trim() || target;
    } catch {
      // no target yet: Today
    }
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} -> ${target}`);
    res.writeHead(302, {
      Location: `http://127.0.0.1:3000${target}`,
      "Set-Cookie": `${cookie}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
      "Cache-Control": "no-store",
    });
    res.end();
  })
  .listen(Number(port), "127.0.0.1", () => {
    console.log(`login redirect on 127.0.0.1:${port}`);
  });
