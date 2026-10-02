#!/usr/bin/env bash
set -euo pipefail
umask 077
# Run from the authorized demo deployment root.
sales_backup_dir="backups/sales-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$sales_backup_dir"
docker compose exec -T postgres pg_dump -U postgres -Fc sales_workspace > "$sales_backup_dir/sales_workspace.dump"
docker compose exec -T postgres pg_restore --list < "$sales_backup_dir/sales_workspace.dump" > "$sales_backup_dir/database-contents.txt"
tar -czf "$sales_backup_dir/config-private.tar.gz" compose.sales.yaml private/sales-config.json private/sales-core.env private/sales-web.env private/reception-config.json deploy/reception.py deploy/reception.schema.json deploy/Caddyfile
python3 - "$sales_backup_dir" <<'PY'
import pathlib, sqlite3, sys
out=pathlib.Path(sys.argv[1])
with sqlite3.connect('file:private/reception.sqlite?mode=ro',uri=True) as source, sqlite3.connect(out/'reception.sqlite') as target:
    source.backup(target)
    assert target.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
PY
(cd "$sales_backup_dir" && sha256sum sales_workspace.dump config-private.tar.gz reception.sqlite > SHA256SUMS && sha256sum -c SHA256SUMS)
printf 'Sales backup verified: %s\n' "$sales_backup_dir"
