# Low-resource webhook deployment

This profile is for the existing 1 vCPU / 1 GB Ubuntu VPS. It deliberately deploys only PostgreSQL, Revenue Core and the outbox worker. It binds the API to `127.0.0.1:4100`, leaves Xray/RustDesk untouched, and does not claim production readiness for Chatwoot or the Workspace Web UI.

The public HTTPS route must be added through the existing 443 owner after a domain is available. Do not expose port 4100 directly to the internet.
