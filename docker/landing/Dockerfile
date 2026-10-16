# needt.app — the public marketing landing.
#
# Deliberately not a Node build. The page is one self-contained HTML file with
# no framework and no bundler, so this image has no `npm ci` and no `next build`
# in it. That is the whole point: the 2026-08-23 outage was caused by parallel
# builds on a 4-core box, and this service can never take part in one.
#
# Build context is the repository root:
#   docker build -f docker/landing/Dockerfile -t needt-landing .

FROM nginx:1.27-alpine

# Drop the stock page and config so nothing of theirs survives.
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/default.conf

COPY docker/landing/nginx.conf /etc/nginx/conf.d/landing.conf
COPY docker/landing/security-headers.conf /etc/nginx/landing/security-headers.conf
COPY landing-site/ /usr/share/nginx/html/

# Umami website ID, injected at build time and never committed.
# Coolify: add UMAMI_SITE_ID in the application's Environment Variables and tick
# "Build Variable" (otherwise it is not passed to `docker build` as a build arg).
# The pages ship the Umami tag inside an HTML comment with the placeholder
# __UMAMI_SITE_ID__. With a non-empty ID this step uncomments the tag, fills in
# the ID and fails the build if any placeholder is left. With an empty ID the
# page stays as is (no analytics) and a warning is printed.
ARG UMAMI_SITE_ID=
RUN set -eu; \
    if [ -n "$UMAMI_SITE_ID" ]; then \
      case "$UMAMI_SITE_ID" in *[!A-Za-z0-9-]*) echo "UMAMI_SITE_ID must be [A-Za-z0-9-] only" >&2; exit 1;; esac; \
      find /usr/share/nginx/html -name '*.html' -exec sed -i \
        -e '/<!-- Analytics (Umami/s/$/ -->/' \
        -e "/<script defer src=\"https:\\/\\/stats.needt.app/{s/__UMAMI_SITE_ID__/$UMAMI_SITE_ID/;n;/^-->$/d;}" {} +; \
      LEFT=$(find /usr/share/nginx/html -name '*.html' -exec grep -l '__UMAMI_SITE_ID__' {} + || true); \
      if [ -n "$LEFT" ]; then echo "ERROR: UMAMI_SITE_ID placeholder left in: $LEFT" >&2; exit 1; fi; \
      N=$(find /usr/share/nginx/html -name '*.html' -exec grep -l "data-website-id=\"$UMAMI_SITE_ID\"" {} + 2>/dev/null | wc -l); \
      if [ "$N" -eq 0 ]; then echo "ERROR: Umami tag not found in any page" >&2; exit 1; fi; \
      echo "Umami enabled in $N pages"; \
    else \
      echo "WARNING: UMAMI_SITE_ID is empty, analytics stay disabled (placeholder left in place)"; \
    fi

# Traefik in Coolify routes to this port; keep it aligned with the service's
# "Ports exposes" field. The collaboration service was down for eleven days
# because those two disagreed.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1/healthz || exit 1

STOPSIGNAL SIGQUIT
# nginx needs root to bind port 80, and the port is pinned to Coolify's
# "Ports exposes" field. Moving to nginxinc/nginx-unprivileged means changing
# both together; that is its own change.
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD ["nginx", "-g", "daemon off;"]
