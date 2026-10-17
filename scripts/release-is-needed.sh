#!/usr/bin/env bash
# Does production still need the release this run built?
#
# Releases are not serialised against merges: a publish run takes ~25
# minutes and main moves every few minutes, so by the time an image is ready
# its commit is almost never the head of main. The old rule ("stand down
# unless I am the head") therefore never let anything deploy. The rule now
# is only: deploy unless production already runs DEPLOY_SHA or a descendant
# of it, so an older run can never roll back a newer deploy and the newest
# finished build always ships.
#
# Usage: release-is-needed.sh <health-url> <json-field> [<health-url> <json-field> ...]
# Each pair names a health endpoint and the field holding its build SHA. The
# release is unneeded only when every pair already serves DEPLOY_SHA or a
# descendant. An unreadable endpoint or a SHA missing from this checkout
# counts as "needed" (a repair deploy beats a skipped one).
# Needs DEPLOY_SHA and a full-history checkout (fetch-depth: 0).
# Prints needed=true|false to $GITHUB_OUTPUT when set; always exits 0.
set -euo pipefail

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"
if (($# < 2 || $# % 2 != 0)); then
  echo "usage: $0 <url> <field> [<url> <field> ...]" >&2
  exit 2
fi

needed=false
while (($#)); do
  url="$1"
  field="$2"
  shift 2
  response=$(curl --silent --max-time 30 "$url" || true)
  served=$(printf '%s' "$response" | jq -r --arg f "$field" \
    'if .ok == true then (.[$f] // empty) else empty end' 2>/dev/null || true)
  if [[ ! "$served" =~ ^[0-9a-fA-F]{40}$ ]] || ! git cat-file -e "$served^{commit}" 2>/dev/null; then
    echo "Cannot read a known $field from $url; the release is needed."
    needed=true
  elif git merge-base --is-ancestor "$DEPLOY_SHA" "$served"; then
    echo "$field at $url is $served, which is $DEPLOY_SHA or newer."
  else
    echo "$field at $url is $served; $DEPLOY_SHA is newer."
    needed=true
  fi
done

if [ "$needed" = false ]; then
  echo "::notice::Production already runs $DEPLOY_SHA or a descendant; nothing to deploy."
fi
if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "needed=$needed" >> "$GITHUB_OUTPUT"
fi
