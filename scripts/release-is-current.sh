#!/usr/bin/env bash
# Is the commit this release run built still the head of main?
#
# Coolify deploys the head of main and pulls the image CI pushed for that
# commit. A release run for an older commit that asks Coolify to deploy
# after a newer merge would request an image the newer run may not have
# pushed yet, and the pull fails. Such a run stands down: the newer run
# deploys its own commit.
#
# Prints current=true|false to $GITHUB_OUTPUT when set, and exits 1 when
# the release is superseded so callers can test it directly.
# Needs DEPLOY_SHA and a checkout whose `origin` can be read.
set -euo pipefail

: "${DEPLOY_SHA:?DEPLOY_SHA is required}"

head=$(git ls-remote origin refs/heads/main | cut -f1)
if [ -z "$head" ]; then
  echo "Could not read the head of main; deploying $DEPLOY_SHA as planned." >&2
  current=true
elif [ "$head" = "$DEPLOY_SHA" ]; then
  current=true
else
  echo "::notice::main is now at $head; the release for $DEPLOY_SHA stands down and the newer run deploys."
  current=false
fi

if [ -n "${GITHUB_OUTPUT:-}" ]; then
  echo "current=$current" >> "$GITHUB_OUTPUT"
fi
[ "$current" = true ]
