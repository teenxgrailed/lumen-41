#!/usr/bin/env bash
# Regenerate the Linux visual baselines for a branch, end to end.
#
# The baselines can only be written on Linux, by the workflow_dispatch job in
# ci.yml. That job fails late on three rules, each of which used to cost a CI
# round: the dispatch ref must already contain origin/main, the target branch
# must start with codex/, and the target must not exist yet. This script
# satisfies all three, waits for the run, and brings back only the PNGs.
#
# Usage: scripts/regen-baselines.sh [--no-push] [--dry-run] [<branch>]
#   <branch>   the branch that needs baselines; defaults to the current one.
#              It must be the branch checked out here: the script never
#              switches branches in someone's working tree.
#   --no-push  commit the PNGs locally and stop (the merge of main is still
#              pushed, because the dispatch runs on the remote ref).
#   --dry-run  print what would happen and change nothing.
#
# Steps:
#   1. refuse a dirty tree (it commits, and must not sweep up other work);
#   2. merge origin/main when the branch lacks it, push the branch;
#   3. dispatch ci.yml with target_branch=codex/<branch>-<MMDDHHMM>;
#   4. watch that run to the end (the visual suite takes ~20 minutes);
#   5. check out only tests/visual/**/*-linux.png that the run changed, commit
#      them, push.
# The codex/* branch is left on the remote; delete it once the PR merges.
set -euo pipefail

push=1
dry=0
branch=""
for arg in "$@"; do
  case "$arg" in
    --no-push) push=0 ;;
    --dry-run) dry=1 ;;
    -h | --help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
    *)
      [ -z "$branch" ] || {
        echo "Only one branch, please." >&2
        exit 2
      }
      branch="$arg"
      ;;
  esac
done

say() { printf '› %s\n' "$*"; }
run() {
  if [ "$dry" = 1 ]; then
    printf '  (dry run) %s\n' "$*"
  else
    "$@"
  fi
}

command -v gh >/dev/null || {
  echo "gh is required." >&2
  exit 1
}
cd "$(git rev-parse --show-toplevel)"

current="$(git branch --show-current)"
[ -n "$branch" ] || branch="$current"
case "$branch" in
  "" | main | master)
    echo "Run it on a feature branch, not '${branch:-a detached HEAD}'." >&2
    exit 1
    ;;
esac
if [ "$branch" != "$current" ]; then
  echo "'$branch' is not checked out here (this tree is on '$current'). Switch first." >&2
  exit 1
fi
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "The working tree has uncommitted changes; commit or set them aside first." >&2
  exit 1
fi

# 1–2. Main in, branch pushed: the job checks out the remote ref.
say "Fetching origin"
git fetch -q origin main
if git merge-base --is-ancestor origin/main HEAD; then
  say "$branch already contains origin/main"
else
  say "Merging origin/main into $branch"
  if [ "$dry" = 0 ] && ! git merge --no-edit -q origin/main; then
    git merge --abort || true
    echo "Merging main conflicts; resolve it by hand, then run this again." >&2
    exit 1
  fi
fi
say "Pushing $branch"
run git push -q origin "HEAD:refs/heads/$branch"

# 3. A fresh codex/* target every time.
slug="$(printf '%s' "$branch" | tr '/' '-' | tr -cd 'A-Za-z0-9._-' | cut -c1-48)"
target="codex/${slug}-$(date -u +%m%d%H%M)"
if git ls-remote --exit-code --heads origin "refs/heads/$target" >/dev/null 2>&1; then
  echo "$target already exists on origin; wait a minute and run again." >&2
  exit 1
fi
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "Dispatching ci.yml on $branch → $target"
run gh workflow run ci.yml --ref "$branch" -f "target_branch=$target"
if [ "$dry" = 1 ]; then
  say "Dry run: would watch the run, then take the changed PNGs from origin/$target"
  exit 0
fi

# 4. Find the run this dispatch started and watch it.
run_id=""
for _ in $(seq 1 30); do
  run_id="$(gh run list --workflow ci.yml --branch "$branch" --event workflow_dispatch \
    --limit 5 --json databaseId,createdAt \
    --jq "[.[] | select(.createdAt >= \"$since\")] | last | .databaseId // empty")"
  [ -n "$run_id" ] && break
  sleep 4
done
[ -n "$run_id" ] || {
  echo "The dispatched run did not show up; look under Actions → CI." >&2
  exit 1
}
say "Watching run $run_id ($(gh run view "$run_id" --json url --jq .url))"
if ! gh run watch "$run_id" --exit-status --interval 30 >/dev/null; then
  echo "Run $run_id failed. A failing visual assertion is a real failure, not drift:" >&2
  echo "  gh run view $run_id --log-failed" >&2
  exit 1
fi

# 5. Only the PNGs the run wrote.
if ! git fetch -q origin "refs/heads/$target:refs/remotes/origin/$target" 2>/dev/null; then
  say "The run committed nothing: the baselines already match."
  exit 0
fi
pngs=()
while IFS= read -r path; do
  [ -n "$path" ] && pngs+=("$path")
done < <(git diff --name-only --diff-filter=AM "origin/$target~1" "origin/$target" -- ':(glob)tests/visual/**/*-linux.png')
if [ "${#pngs[@]}" -eq 0 ]; then
  say "origin/$target carries no baseline changes."
  exit 0
fi
git checkout "origin/$target" -- "${pngs[@]}"
if git diff --cached --quiet; then
  say "This branch already has these baselines."
  exit 0
fi
git commit -q -m "test(visual): Linux baselines from $target" -- "${pngs[@]}"
say "Committed ${#pngs[@]} baseline(s):"
printf '    %s\n' "${pngs[@]}"
if [ "$push" = 1 ]; then
  git push -q origin "HEAD:refs/heads/$branch"
  say "Pushed $branch"
fi
