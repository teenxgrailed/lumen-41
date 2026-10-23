#!/usr/bin/env python3
"""Read a page in the iOS Simulator through Web Inspector, for the Safari phone
probe. Usage:
  wi.py serve                       keep one inspector connection, answer evals
  wi.py pages                       every inspectable page, as JSON (own connection)
  wi.py eval [--webapp|--safari] [--url SUBSTR] JS
                                    evaluate JS in one page, print the JSON value

It speaks the simulator's remote-inspector socket (binary plists framed by a
4-byte length; the page protocol is the WebKit inspector JSON, wrapped in the
Target domain). Only reads and taps happen through it in the probe: the
screens are still driven by idb touches like a person would.
"""
import json, os, plistlib, socket, struct, subprocess, sys, time, uuid

UDID = os.environ.get("UDID", "booted")
SAFARI = "com.apple.mobilesafari"


def trace(*a):
    if os.environ.get("WI_TRACE"):
        print("wi", *a, file=sys.stderr, flush=True)


def sock_path():
    p = os.environ.get("RWI_SOCKET")
    if p:
        return p
    out = subprocess.run(["xcrun", "simctl", "getenv", UDID, "RWI_LISTEN_SOCKET"],
                         capture_output=True, text=True, timeout=30).stdout.strip()
    if out:
        return out
    out = subprocess.run(["lsof", "-aUc", "launchd_sim"], capture_output=True, text=True, timeout=30).stdout
    for line in out.splitlines():
        if "webinspectord_sim.socket" in line:
            return line.split()[-1]
    raise SystemExit("no Web Inspector socket for the simulator")


class WI:
    def __init__(self):
        self.s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.s.connect(sock_path())
        self.s.settimeout(0.5)
        self.conn = str(uuid.uuid4()).upper()
        self.sender = str(uuid.uuid4()).upper()
        self.buf = b""
        self.apps, self.listings, self.data = {}, {}, []
        self.target = None
        self.n = 0
        self.send("_rpc_reportIdentifier:", {"WIRConnectionIdentifierKey": self.conn})
        self.send("_rpc_getConnectedApplications:", {"WIRConnectionIdentifierKey": self.conn})
        self.pump(lambda: self.apps, 5)

    def send(self, sel, arg):
        trace(">", sel, {k: v for k, v in arg.items() if k != "WIRSocketDataKey"}, arg.get("WIRSocketDataKey", b"")[:300])
        body = plistlib.dumps({"__selector": sel, "__argument": arg}, fmt=plistlib.FMT_BINARY)
        self.s.sendall(struct.pack(">I", len(body)) + body)

    def handle(self, msg):
        sel, arg = msg.get("__selector"), msg.get("__argument") or {}
        trace("<", sel, str({k: v for k, v in arg.items() if k not in ("WIRApplicationIconKey",)})[:400])
        if sel == "_rpc_reportConnectedApplicationList:":
            self.apps.update(arg.get("WIRApplicationDictionaryKey") or {})
        elif sel in ("_rpc_applicationConnected:", "_rpc_applicationUpdated:"):
            self.apps[arg["WIRApplicationIdentifierKey"]] = arg
        elif sel == "_rpc_applicationDisconnected:":
            self.apps.pop(arg.get("WIRApplicationIdentifierKey"), None)
        elif sel == "_rpc_applicationSentListing:":
            self.listings[arg["WIRApplicationIdentifierKey"]] = arg.get("WIRListingKey") or {}
        elif sel == "_rpc_applicationSentData:":
            try:
                self.data.append(json.loads(arg["WIRMessageDataKey"]))
            except Exception:
                pass

    def pump(self, until, secs):
        end = time.time() + secs
        while time.time() < end:
            if until():
                return True
            try:
                chunk = self.s.recv(1 << 20)
            except socket.timeout:
                continue
            if not chunk:
                raise SystemExit("Web Inspector socket closed")
            self.buf += chunk
            while len(self.buf) >= 4:
                n = struct.unpack(">I", self.buf[:4])[0]
                if len(self.buf) < 4 + n:
                    break
                body, self.buf = self.buf[4:4 + n], self.buf[4 + n:]
                try:
                    self.handle(plistlib.loads(body))
                except Exception as e:
                    print("bad message:", e, file=sys.stderr)
        return until()

    def host_bundle(self, app_id):
        a = self.apps.get(app_id) or {}
        host = a.get("WIRHostApplicationIdentifierKey")
        if host and host in self.apps:
            return self.apps[host].get("WIRApplicationBundleIdentifierKey", "")
        return a.get("WIRApplicationBundleIdentifierKey", "")

    def pages(self):
        if not self.apps:
            self.send("_rpc_getConnectedApplications:", {"WIRConnectionIdentifierKey": self.conn})
            if not self.pump(lambda: self.apps, 4):
                raise SystemExit("the inspector reports no applications on this connection")
        ready = [a for a, v in self.apps.items()
                 if not str(v.get("WIRApplicationBundleIdentifierKey", "")).startswith("process-")]
        for app_id in ready:
            self.send("_rpc_forwardGetListing:", {"WIRConnectionIdentifierKey": self.conn,
                                                   "WIRApplicationIdentifierKey": app_id})
        self.pump(lambda: len(self.listings) >= len(ready), 4)
        out = []
        for app_id, listing in self.listings.items():
            a = self.apps.get(app_id) or {}
            for key, p in listing.items():
                out.append({
                    "app": app_id,
                    "appName": a.get("WIRApplicationNameKey"),
                    "bundle": a.get("WIRApplicationBundleIdentifierKey"),
                    "host": self.host_bundle(app_id),
                    "proxy": bool(a.get("WIRIsApplicationProxyKey")),
                    "active": a.get("WIRIsApplicationActiveKey"),
                    "page": p.get("WIRPageIdentifierKey", key),
                    "type": p.get("WIRTypeKey"),
                    "url": p.get("WIRURLKey"),
                    "title": p.get("WIRTitleKey"),
                })
        return out

    def _base(self):
        return {"WIRConnectionIdentifierKey": self.conn, "WIRApplicationIdentifierKey": self.app,
                "WIRPageIdentifierKey": int(self.page), "WIRSenderKey": self.sender}

    def attach(self, app, page):
        self.app, self.page = app, page
        self.send("_rpc_forwardSocketSetup:", {**self._base(), "WIRAutomaticallyPause": False})

        def created():
            for m in self.data:
                if m.get("method") == "Target.targetCreated":
                    info = m["params"]["targetInfo"]
                    if info.get("type", "page") == "page":
                        self.target = info["targetId"]
                if m.get("method") == "Target.didCommitProvisionalTarget":
                    self.target = m["params"]["newTargetId"]
            return self.target is not None
        self.pump(created, 4)

    def command(self, method, params=None, secs=15):
        self.n += 1
        inner = {"id": self.n, "method": method, "params": params or {}}
        msg = inner
        if self.target:
            self.n += 1
            msg = {"id": self.n, "method": "Target.sendMessageToTarget",
                   "params": {"targetId": self.target, "message": json.dumps(inner)}}
        self.send("_rpc_forwardSocketData:", {**self._base(), "WIRSocketDataKey": json.dumps(msg).encode()})
        want = inner["id"]
        found = {}

        def got():
            for m in self.data:
                if m.get("method") == "Target.dispatchMessageFromTarget":
                    try:
                        m = json.loads(m["params"]["message"])
                    except Exception:
                        continue
                if m.get("id") == want:
                    found["m"] = m
                    return True
            return False
        if not self.pump(got, secs):
            raise SystemExit(f"no reply to {method}")
        return found["m"]

    def close(self):
        if not hasattr(self, "app"):
            self.s.close()
            return
        try:
            self.send("_rpc_forwardDidClose:", self._base())
        except Exception:
            pass
        self.s.close()


def pick(pages, want, url):
    ok = [p for p in pages if (p.get("url") or "").startswith("http") and (not url or url in p["url"])]
    if want == "safari":
        ok = [p for p in ok if p["host"] == SAFARI or p["bundle"] == SAFARI]
    elif want == "webapp":
        ok = [p for p in ok if SAFARI not in (p["host"], p["bundle"])]
    return ok[-1] if ok else None


def eval_on(wi, js, want, url):
    """One evaluation on an open connection: list, pick, attach, run, detach."""
    wi.listings = {}
    pages = wi.pages()
    p = pick(pages, want, url)
    if not p:
        return None, "no matching page in " + json.dumps([(q["appName"], q["url"]) for q in pages])
    wi.sender, wi.target, wi.data = str(uuid.uuid4()).upper(), None, []
    wi.attach(p["app"], p["page"])
    try:
        r = wi.command("Runtime.evaluate", {"expression": f"JSON.stringify((()=>{{{js}}})())",
                                            "returnByValue": True})
    finally:
        try:
            wi.send("_rpc_forwardDidClose:", wi._base())
        except Exception:
            pass
    res = r.get("result") or {}
    if r.get("error") or res.get("wasThrown"):
        return None, json.dumps(r)[:600]
    val = (res.get("result") or {}).get("value")
    return {"page": p, "value": json.loads(val) if isinstance(val, str) else val}, None


# The simulator's inspector refuses a new client for a few seconds after one
# leaves, so one long-lived connection (`wi.py serve`) answers every call.
PORT = int(os.environ.get("WI_PORT", "9333"))


def serve():
    from http.server import BaseHTTPRequestHandler, HTTPServer
    os.environ["WI_TRACE"] = "1"
    state = {"wi": None}

    def conn():
        if state["wi"] is None:
            for _ in range(6):
                try:
                    state["wi"] = WI()
                    break
                except (SystemExit, OSError) as e:
                    print("connect failed:", e, flush=True)
                    time.sleep(8)
        return state["wi"]

    class H(BaseHTTPRequestHandler):
        def do_POST(self):
            q = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            out, err = None, None
            for _ in range(2):
                try:
                    wi = conn()
                    if wi is None:
                        err = "no inspector connection"
                        break
                    out, err = eval_on(wi, q["js"], q.get("want"), q.get("url"))
                    if out:
                        break
                    print("eval:", err, flush=True)
                    time.sleep(2)
                except (SystemExit, OSError) as e:
                    err = f"connection lost: {e}"
                    print(err, "- reconnecting", flush=True)
                    try:
                        state["wi"].s.close()
                    except Exception:
                        pass
                    state["wi"] = None
                    time.sleep(8)
            body = json.dumps({"ok": out, "error": err}).encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, fmt, *a):
            print("wi serve:", fmt % a, flush=True)

    HTTPServer(("127.0.0.1", PORT), H).serve_forever()


def evaluate(js, want=None, url=None, tries=2):
    """Evaluate through the `serve` process (started on first use)."""
    import urllib.request
    body = json.dumps({"js": js, "want": want, "url": url}).encode()
    last = None
    for i in range(tries + 2):
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{PORT}/", data=body, method="POST")
            r = json.loads(urllib.request.urlopen(req, timeout=180).read())
        except OSError as e:
            last = f"no wi serve: {e}"
            if i == 0:
                os.makedirs("debug", exist_ok=True)
                subprocess.Popen([sys.executable, os.path.abspath(__file__), "serve"],
                                 stdout=open("debug/wi-serve.log", "a"), stderr=subprocess.STDOUT,
                                 stdin=subprocess.DEVNULL, start_new_session=True)
            time.sleep(3)
            continue
        if r.get("ok"):
            return r["ok"]
        last = r.get("error")
        time.sleep(3)
    raise SystemExit(f"eval failed: {last}")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        raise SystemExit(__doc__)
    if args[0] == "serve":
        serve()
    elif args[0] == "pages":
        wi = WI()
        print(json.dumps({"apps": wi.apps, "pages": wi.pages()}, indent=1, default=str))
        wi.close()
    elif args[0] == "eval":
        want, url, rest = None, None, args[1:]
        while rest and rest[0].startswith("--"):
            flag = rest.pop(0)
            if flag in ("--webapp", "--safari"):
                want = flag[2:]
            elif flag == "--url":
                url = rest.pop(0)
        print(json.dumps(evaluate(rest[0], want, url)))
