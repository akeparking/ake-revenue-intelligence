#!/usr/bin/env bash
set -euo pipefail

: "${OKKI_ENV_FILE:?Set OKKI_ENV_FILE to a private OKKI credentials file}"
: "${REVENUE_PROJECT_ROOT:=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
: "${NODE_EXECUTABLE:=node}"

cd "${REVENUE_PROJECT_ROOT}"
export PORT=4100 STORE_DRIVER=memory DEMO_SEED=false ADS_MODE=mock AI_AUTO_SEND=false OKKI_SYNC_ENABLED=true
exec "${NODE_EXECUTABLE}" --env-file="${OKKI_ENV_FILE}" apps/revenue-core/dist/main.js
