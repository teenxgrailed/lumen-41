# needt.app — deploying the landing

The public marketing page. Separate service, separate domain, deliberately
**not** part of the Next.js application.

- Site source: `landing-site/` (static, no build)
- References it was built from: `design-refs/dia-tokens.md`,
  `design-refs/marketing-site-references.md`, `design-refs/micro-so-teardown.md`

## Why nginx and not Node

The 2026-08-23 outage was caused by three parallel `npm ci` + `next build` runs
on a 4-core box. This image contains no build step at all — it copies one HTML
file into nginx. It cannot take part in that failure mode, which is the reason
the landing is allowed to live on the same server at all.

Cold build is a few seconds and the image is ~50 MB.

## Coolify service

Create a new **Application** in project `needt`, environment `production`,
pointing at this repository.

| Field | Value | Why |
|---|---|---|
| Build pack | Dockerfile | no framework detection |
| Dockerfile location | `/docker/landing/Dockerfile` | |
| Base directory | `/` | the Dockerfile copies from the repo root |
| Ports exposes | **80** | must equal `EXPOSE` in the Dockerfile |
| Domains | `https://needt.app` | |
| Auto deploy | **Manual deployments only** | same rule as the other three services |
| Healthcheck path | `/healthz` | plain 200, no filesystem work |

**The one field that has already cost eleven days:** `Ports exposes` must match
the port the process listens on. `needt-collaboration` was down from 2026-08-13
to 2026-08-24 because Coolify published 3000 while Hocuspocus listened on 1234.
Here it is 80 in both the Dockerfile and the table above. Do not "fix" one
without the other.

## DNS

`needt.app` already resolves to `95.216.213.174` (A record, DNS-only). Nothing
to change.

`www.needt.app` does **not** resolve. Add it only when this service is live,
otherwise the record turns "does not resolve" into a 503:

```
Type  CNAME
Name  www
Value needt.app
Proxy DNS only
```

Do not delete the `TXT` record on `needt.app` holding
`google-site-verification=…` — Search Console ownership depends on it, and that
ownership is what lets the OAuth consent screen accept `needt.app` as an
authorized domain.

## Verifying a deploy

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://needt.app/healthz   # 200
curl -sSI https://needt.app | grep -i content-security-policy         # present
curl -sS https://needt.app | grep -c "Something always moves"         # 1
```

If the CSP header is missing on `/` but present on `/index.html`, the
`security-headers.conf` include was dropped from a `location` block. nginx does
not merge `add_header` across levels — a single `add_header` inside a location
silently discards every inherited one. That defect existed in the first version
of this config and is the reason the headers live in their own file.

## Editing the page

Edit `design-refs/landing/index.html` and redeploy. There is no build, no
bundler and no cache to bust: the HTML is served with
`Cache-Control: no-cache, must-revalidate`, so a redeploy is visible on the next
request.
