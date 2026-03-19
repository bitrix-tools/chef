#!/bin/sh
# Auto-update TypeScript path aliases after merge/pull
# Installed by: chef init hooks

mkdir -p .chef
echo $$ > .chef/merge.lock
trap 'rm -f .chef/merge.lock' EXIT

added=$(git diff --name-only --diff-filter=A HEAD@{1} HEAD | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)
removed=$(git diff --name-only --diff-filter=D HEAD@{1} HEAD | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)

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
