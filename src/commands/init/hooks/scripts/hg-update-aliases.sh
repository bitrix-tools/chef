#!/bin/sh
# Auto-update TypeScript path aliases after update/pull
# Installed by: chef init hooks

mkdir -p .chef
echo $$ > .chef/merge.lock
trap 'rm -f .chef/merge.lock' EXIT

added=$(hg log -r "$HG_NODE:tip" --template "{file_adds % '{file}\n'}" 2>/dev/null | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)
removed=$(hg log -r "$HG_NODE:tip" --template "{file_dels % '{file}\n'}" 2>/dev/null | grep -E '/bundle\.config\.(js|ts)$' | xargs -I{} dirname {} 2>/dev/null)

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
