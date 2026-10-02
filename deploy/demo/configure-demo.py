"""Configure an already-authorized demo host without printing secrets.

Run from its deployment root after backing up. Requires the existing compose.yaml,
private/reception-config.json, PostgreSQL service and a prepared releases/current.
"""
import json, os, secrets, subprocess
from pathlib import Path
from urllib.parse import urlparse

root = Path.cwd()
private = root / 'private'
private.mkdir(exist_ok=True, mode=0o700)
config_file = private / 'sales-config.json'
if config_file.exists():
    config = json.loads(config_file.read_text())
else:
    config = {key: secrets.token_hex(32) for key in ['api_key', 'bridge_key', 'database_password', 'field_key', 'session_secret']}
    config['workspace_password'] = secrets.token_urlsafe(18)
    config['public_origin'] = os.environ['SALES_PUBLIC_ORIGIN']
    config_file.write_text(json.dumps(config, indent=2) + '\n')
    config_file.chmod(0o600)
pg = ['docker', 'compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
role = "DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='sales_workspace') THEN CREATE ROLE sales_workspace LOGIN PASSWORD '" + config['database_password'] + "'; END IF; END $$;"
subprocess.run(pg, input=role, text=True, capture_output=True, check=True)
found = subprocess.run(pg + ['-tAc', "SELECT 1 FROM pg_database WHERE datname='sales_workspace'"], capture_output=True, text=True, check=True)
if not found.stdout.strip():
    subprocess.run(pg, input='CREATE DATABASE sales_workspace OWNER sales_workspace;', text=True, capture_output=True, check=True)
core = {'NODE_ENV': 'production', 'PORT': '4100', 'DEFAULT_WORKSPACE_ID': 'ake-demo', 'DEFAULT_USER_ID': 'demo-operator', 'STORE_DRIVER': 'postgres', 'DATABASE_URL': 'postgresql://sales_workspace:' + config['database_password'] + '@postgres:5432/sales_workspace', 'FIELD_ENCRYPTION_KEY': config['field_key'], 'API_AUTH_MODE': 'api-key', 'API_KEY': config['api_key'], 'INBOX_BRIDGE_KEY': config['bridge_key'], 'ADS_MODE': 'mock', 'MODEL_PROVIDER': 'mock', 'AI_AUTO_SEND': 'false', 'OKKI_SYNC_ENABLED': 'false', 'DEMO_SEED': 'true'}
web = {'NODE_ENV': 'production', 'PORT': '3000', 'HOSTNAME': '0.0.0.0', 'SERVER_API_URL': 'http://sales-core:4100', 'API_KEY': config['api_key'], 'DEFAULT_WORKSPACE_ID': 'ake-demo', 'DEFAULT_USER_ID': 'demo-operator', 'NEXT_PUBLIC_BASE_PATH': '/sales', 'WORKSPACE_PUBLIC_ORIGIN': config['public_origin'], 'WORKSPACE_PASSWORD': config['workspace_password'], 'WORKSPACE_SESSION_SECRET': config['session_secret']}
for name, values in [('sales-core.env', core), ('sales-web.env', web)]:
    path = private / name
    path.write_text('\n'.join(key + '=' + value for key, value in values.items()) + '\n')
    path.chmod(0o600)
reception_file = private / 'reception-config.json'
reception = json.loads(reception_file.read_text())
reception.update({'core_url': 'http://127.0.0.1:14100', 'core_api_key': config['api_key'], 'core_bridge_key': config['bridge_key']})
# Keep the existing authorized model workdir. Supply it explicitly on the first rollout.
if os.environ.get('RECEPTION_MODEL_WORKDIR'):
    reception['model_workdir'] = os.environ['RECEPTION_MODEL_WORKDIR']
reception_file.write_text(json.dumps(reception, indent=2) + '\n')
reception_file.chmod(0o600)
print(json.dumps({'configured': True, 'ads_mode': 'mock', 'database': 'sales_workspace', 'operator_password_file': 'private/sales-config.json'}))
