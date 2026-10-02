"""Verify replay and restart persistence on the authorized fictional demo deployment."""
import json, subprocess, time, urllib.request
from pathlib import Path

config = json.loads(Path('private/sales-config.json').read_text())
base = 'http://127.0.0.1:14100/api/v1/'
def api(path, data=None):
    req = urllib.request.Request(base + path, data=None if data is None else json.dumps(data).encode(), headers={'Content-Type': 'application/json', 'x-api-key': config['api_key'], 'x-inbox-bridge-key': config['bridge_key']})
    with urllib.request.urlopen(req, timeout=20) as response:
        return json.load(response)

before = api('dashboard')
inquiries = api('inbox')
live = next(item for item in inquiries if item.get('modelProvider') == 'codex')
replayed = api('inbox/import', {key: live[key] for key in ['eventId','conversationId','channel','displayName','message','isTest','occurredAt','analysis']})
assert replayed['id'] == live['id'] and replayed['leadId'] == live['leadId']
opportunity = next(item for item in before['opportunities'] if item['primarySourceLeadId'] == live['leadId'])
qualified = api('opportunities/' + opportunity['id'] + '/qualify', {'contactReachable': True, 'relevantNeed': True, 'targetBuyer': True, 'nextAction': opportunity['nextAction']})
assert qualified['deduplicated'] is True
subprocess.run(['docker','compose','-f','compose.yaml','-f','compose.sales.yaml','restart','sales-core','sales-workspace'], capture_output=True, text=True, check=True)
subprocess.run(['systemctl','restart','ai-sales-reception'], check=True)
for attempt in range(45):
    try:
        after = api('dashboard')
        break
    except Exception:
        if attempt == 44: raise
        time.sleep(1)
for key in ['leads','opportunities','deliveries']:
    assert {item['id'] for item in before[key]} <= {item['id'] for item in after[key]}
    assert len(before[key]) == len(after[key]), 'Restart or replay created a duplicate'
for prior in before['opportunities']:
    current = next(item for item in after['opportunities'] if item['id'] == prior['id'])
    assert current['stage'] == prior['stage'] and current['version'] == prior['version']
assert {item['eventId'] for item in before['deliveries']} == {item['eventId'] for item in after['deliveries']}
receipt = {'ok': True, 'inquiry_replay_same_id': True, 'qualification_replay_same_event': True, 'restart_records_preserved': True, 'counts': {key: len(after[key]) for key in ['leads','opportunities','deliveries']}, 'live_inquiry_id': live['id'], 'event_id': qualified['delivery']['eventId']}
Path('evidence').mkdir(exist_ok=True)
Path('evidence/v01-restart-readback.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
