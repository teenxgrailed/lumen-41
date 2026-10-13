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
