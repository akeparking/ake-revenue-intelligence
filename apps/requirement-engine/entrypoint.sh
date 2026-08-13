#!/bin/sh
set -eu

test -f /knowledge/.qmd/index.sqlite
test -f /knowledge/.qmd/index.yml
test -f /opt/qmd/bin/qmd
test -f /opt/ake-followup/SKILL.md

rm -f /runtime-qmd/index.sqlite /runtime-qmd/index.sqlite-wal /runtime-qmd/index.sqlite-shm /runtime-qmd/index.yml
cp /knowledge/.qmd/index.sqlite /runtime-qmd/index.sqlite
cp /knowledge/.qmd/index.yml /runtime-qmd/index.yml
sed -E -i 's#^([[:space:]]+path: ).*/[^/]+/#\1/knowledge/#' /runtime-qmd/index.yml

exec node /app/apps/requirement-engine/server.mjs
