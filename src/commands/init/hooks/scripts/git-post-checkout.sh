#!/bin/sh
# Auto-update TypeScript path aliases after checkout
# Installed by: chef init hooks

# Only run for branch checkouts, not file checkouts
if [ "$3" != "1" ]; then
  exit 0
fi

mkdir -p .chef
echo $$ > .chef/merge.lock
trap 'rm -f .chef/merge.lock' EXIT

prev_head=$1
new_head=$2

added=$(git diff --name-only --diff-filter=A "$prev_head" "$new_head" | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)
removed=$(git diff --name-only --diff-filter=D "$prev_head" "$new_head" | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)

if [ -z "$added" ] && [ -z "$removed" ]; then
  exit 0
fi

args=""
if [ -n "$added" ]; then
  args="$args --added $added"
fi
if [ -n "$removed" ]; then
  args="$args --removed $removed"
fi

chef aliases --quiet $args
