#!/bin/sh
# Auto-update TypeScript path aliases after rebase
# Installed by: chef init hooks

mkdir -p .chef
echo $$ > .chef/merge.lock
trap 'rm -f .chef/merge.lock' EXIT

chef aliases --quiet
