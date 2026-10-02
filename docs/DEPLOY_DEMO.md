# Deploy the small demo

The demo overlay adds a PostgreSQL-backed Revenue Core and Next.js workspace to an existing Chatwoot stack. It uses a dedicated database and role in the existing PostgreSQL service. It does not deploy the optional knowledge engine or ERP.

## Build outside the server

Use Node.js 24+ in WSL/Linux. The configured public origin must match the operator login origin.

```bash
npm ci
NEXT_PUBLIC_BASE_PATH=/sales \
NEXT_PUBLIC_CHATWOOT_APP_URL=https://inbox.example.com/app \
npm run build
node scripts/build-demo-bundle.mjs /tmp/sales-runtime
```

Archive the runtime directory, calculate its SHA-256, transfer it through your existing authorized SSH connection, and verify the same hash before extracting it into a dated release directory. Keep secrets and archives outside the public repository. Runtime dependency trees belong on the Linux filesystem.

## Host setup

1. Back up the existing website, Chatwoot database, reception queue, service config and Caddy config.
2. Extract the bundle into `releases/<release>` beneath the existing deployment root. Point `releases/current` to the prepared release. Keep the previous release for rollback.
3. Copy `deploy/compose.sales.yaml` from the bundle to `compose.sales.yaml` at the deployment root.
4. Run `deploy/configure-demo.py` with `SALES_PUBLIC_ORIGIN` and the existing `RECEPTION_MODEL_WORKDIR`. It creates a dedicated database, generates private service keys and an operator password, and extends the reception config without printing secrets.
5. Start only the two new services with the overlay:

```bash
docker compose -f compose.yaml -f compose.sales.yaml up -d sales-core sales-workspace
```

6. Confirm internal HTTP 200 and healthy API before adding the `/sales` and `/sales/*` routes to Caddy. Route these paths to `sales-workspace:3000`, preserve existing website routes and ports, validate the Caddy config, then reload it.
7. Preserve a copy of the old reception source/schema. Install the bundle's new `reception.py` and `reception.schema.json` at the existing service paths, restart only that service, and verify a new fictional website message through to a saved Lead.

Both new services have memory limits, read-only code mounts and private networks. The API host port binds only to loopback. The public operator workspace requires a password; `private/sales-config.json` contains the generated password and is mode 0600. Do not publish this file.

## Backup, restart and rollback

Add `sales_workspace` to the existing database backup procedure and include the private service config, field key and reception queue. Back up with PostgreSQL's `pg_dump`, not a copy of active database files. The field-encryption key is needed to read encrypted inquiry content after recovery.

Run `bash releases/current/deploy/backup-sales.sh` from the deployment root. The script writes a timestamped private backup, checks the PostgreSQL dump manifest, takes a consistent SQLite reception backup, checks SQLite integrity and verifies archive checksums. Copy this private backup to your controlled backup storage; it is never a portfolio artifact. A restore drill is separate from a successful backup check.

The video files are release assets: publish `demo.mp4` and `demo.vtt` into `web/apps/workspace-web/public/showcase` in the runtime bundle, then restart the web service and verify HTTP byte ranges and browser playback. They are intentionally excluded from the source repository. Preserve or copy these assets when switching release directories.

A normal service restart preserves PostgreSQL records. Verify the same inquiry ID, Lead ID, opportunity stage and conversion event ID after restarting the two new services and the reception bridge.

For rollback, stop only `sales-core` and `sales-workspace`, restore the saved Caddy/reception source and schema, and restart/reload those components. Do not remove volumes, revert the website, or alter other service ports. Keep the new database intact for diagnosis. Roll back an application release by repointing `releases/current` to the prior compatible bundle and recreating the two services.

This 2 GB deployment is a low-concurrency demonstration. Runtime acceptance and measured resource use are recorded in `V01_ACCEPTANCE.md`; they are not a production capacity claim.
