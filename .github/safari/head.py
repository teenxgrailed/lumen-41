#!/usr/bin/env python3
"""The tags iOS reads on Add to Home Screen must be in <head> of the HTML
the server sends, on every route, for a phone Safari user agent (Next 15
streams `metadata` into <body> for browsers and blocks only for bots).

  head.py http://127.0.0.1:3000 / /today /auth/signin /tasks

Follows redirects and fails when a redirect leaves the request's origin (an
installed app that is sent to another host shows Safari's chrome)."""
import re, sys, urllib.error, urllib.parse, urllib.request

UA = ("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 "
      "(KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1")
WANT = [
    ("manifest", r'<link[^>]*rel="manifest"[^>]*href="/manifest\.webmanifest"'),
    ("apple-mobile-web-app-capable", r'<meta[^>]*name="apple-mobile-web-app-capable"[^>]*content="yes"'),
    ("mobile-web-app-capable", r'<meta[^>]*name="mobile-web-app-capable"[^>]*content="yes"'),
    ("apple-mobile-web-app-title", r'<meta[^>]*name="apple-mobile-web-app-title"[^>]*content="Needt"'),
    ("apple-mobile-web-app-status-bar-style", r'<meta[^>]*name="apple-mobile-web-app-status-bar-style"'),
    ("apple-touch-icon", r'<link[^>]*rel="apple-touch-icon"[^>]*href="/icons/apple-touch-icon\.png"'),
]


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def fetch(url):
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html"})
    try:
        r = opener.open(req, timeout=60)
        return r.status, dict(r.headers), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read().decode("utf-8", "replace")


def check(base, path):
    problems = []
    origin = urllib.parse.urlsplit(base)
    url = base + path
    for _ in range(6):
        status, headers, body = fetch(url)
        loc = headers.get("Location") or headers.get("location")
        if status in (301, 302, 303, 307, 308) and loc:
            nxt = urllib.parse.urljoin(url, loc)
            to = urllib.parse.urlsplit(nxt)
            print(f"  {path}: {status} -> {nxt}")
            if (to.scheme, to.netloc) != (origin.scheme, origin.netloc):
                problems.append(f"{path}: redirect leaves {origin.netloc} for {to.netloc} ({nxt})")
                return problems
            url = nxt
            continue
        break
    end = body.find("</head>")
    if end < 0:
        return problems + [f"{path}: no </head> in the {status} response from {url}"]
    head, rest = body[:end], body[end:]
    title = re.search(r"<title>([^<]*)</title>", head)
    print(f"  {path}: {status} {url} title in head={title.group(1) if title else None!r}")
    for name, rx in WANT:
        if not re.search(rx, head):
            where = "only in <body>" if re.search(rx, rest) else "missing"
            problems.append(f"{path}: {name} not in <head> ({where})")
        elif re.search(rx, rest):
            problems.append(f"{path}: {name} also in <body> (a second, streamed copy)")
    return problems


def main():
    base, paths = sys.argv[1].rstrip("/"), sys.argv[2:]
    problems = []
    for p in paths:
        problems += check(base, p)
    for p in problems:
        print(f"::error title=Install tags::{p}")
    if not problems:
        print("install tags in <head> on " + ", ".join(paths))
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
