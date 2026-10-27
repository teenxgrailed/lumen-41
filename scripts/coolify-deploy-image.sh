#!/usr/bin/env bash
# Ask Coolify to redeploy one application from the image CI pushed.
#
# Images are built and pushed by CI; Coolify only pulls and restarts.
# Each Coolify resource builds `docker/runtime/<app>.Dockerfile`, a single
# `FROM ghcr.io/teenxgrailed/needt-<app>:${SOURCE_COMMIT}`: Coolify passes the
# commit it deploys, so the "build" is a pull of the image for that commit.
#
# Which commit Coolify deploys:
#   1. Preferred: pin it. PATCH /applications/<uuid> {"git_commit_sha": DEPLOY_SHA}
#      (needs the token's `write` ability), then deploy. The image for exactly
#      DEPLOY_SHA exists because this run built it, so the newest finished
#      build ships even while main keeps moving.
#   2. Fallback when the token cannot write (HTTP 401/403): Coolify keeps
#      deploying the head of main. Deploy only if the head's image for this app
#      already exists in GHCR (or head is DEPLOY_SHA); otherwise stand down and
#      let the head's own run deploy. This converges only while main is quiet
#      for about one build, so give the token `write`.
#
# Prints deployed=true|false to $GITHUB_OUTPUT. Exits 1 on a refused deploy.
#
# Usage: coolify-deploy-image.sh <application-uuid> <web|worker|collaboration>
# Needs COOLIFY_API_URL, COOLIFY_TOKEN, DEPLOY_SHA; the fallback also needs
# GITHUB_TOKEN (packages: read) and a checkout whose `origin` can be read.
set -euo pipefail

uuid="${1:?application uuid is required}"
image="${2:?image name is required}"
: "${COOLIFY_API_URL:?COOLIFY_API_URL is required}"
: "${COOLIFY_TOKEN:?COOLIFY_TOKEN is required}"
: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
api="${COOLIFY_API_URL%/}/api/v1"

out() {
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    echo "deployed=$1" >> "$GITHUB_OUTPUT"
  fi
}

# call METHOD URL [JSON]: prints the HTTP status; the body goes to stderr.
call() {
  local args=(--silent --show-error --retry 3 --max-time 60 --output /dev/stderr
    --write-out '%{http_code}' --request "$1"
    --header "Authorization: Bearer $COOLIFY_TOKEN")
  if [ -n "${3:-}" ]; then
    args+=(--header 'Content-Type: application/json' --data "$3")
  fi
  curl "${args[@]}" "$2"
}

# image_exists SHA: succeeds when ghcr.io has needt-$image:SHA.
image_exists() {
  local token accept
  token=$(curl --silent --max-time 30 --user "x-access-token:${GITHUB_TOKEN:-}" \
    "https://ghcr.io/token?service=ghcr.io&scope=repository:teenxgrailed/needt-$image:pull" |
    jq -r '.token // empty' 2>/dev/null || true)
  [ -n "$token" ] || return 1
  accept='application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json'
  [ "$(curl --silent --max-time 30 --output /dev/null --write-out '%{http_code}' --head \
    --header "Authorization: Bearer $token" --header "Accept: $accept" \
    "https://ghcr.io/v2/teenxgrailed/needt-$image/manifests/$1")" = 200 ]
}

pin=$(call PATCH "$api/applications/$uuid" "{\"git_commit_sha\":\"$DEPLOY_SHA\"}")
case "$pin" in
  2??) echo "Pinned $uuid to $DEPLOY_SHA." ;;
  401 | 403)
    echo "::warning::The Coolify token cannot write ($pin), so it cannot pin $uuid to $DEPLOY_SHA. Give COOLIFY_API_TOKEN the write ability. Falling back to the head of main."
    head=$(git ls-remote origin refs/heads/main | cut -f1)
    if [ "$head" != "$DEPLOY_SHA" ] && { [ -z "$head" ] || ! image_exists "$head"; }; then
      echo "::notice::The $image image for the head of main (${head:-unknown}) is not published yet; this run stands down and the head's run deploys."
      out false
      exit 0
    fi
    ;;
  *)
    echo "Coolify refused to pin $uuid: HTTP $pin" >&2
    exit 1
    ;;
esac

deploy="$api/deploy?uuid=$uuid&force=false"
# Coolify answers POST here; older installations answered GET, so a 405
# falls back once.
status=$(call POST "$deploy")
if [ "$status" = "405" ]; then
  echo "Coolify rejected POST; retrying with GET for an older install." >&2
  status=$(call GET "$deploy")
fi
case "$status" in
  2??)
    echo "Coolify accepted the deploy of $uuid ($status)."
    out true
    ;;
  *)
    echo "Coolify refused the deploy of $uuid: HTTP $status" >&2
    exit 1
    ;;
esac
