"""Browser acceptance of the fictional inquiry -> reviewed Lead -> opportunity -> Mock receipt."""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get('WORKFLOW_URL', 'http://127.0.0.1:3010/sales').rstrip('/')
out = Path(os.environ.get('SNAPSHOT_DIR', '/tmp/sales-workflow-evidence'))
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, **({'executable_path': os.environ['BROWSER_EXECUTABLE']} if os.environ.get('BROWSER_EXECUTABLE') else {}))
    context = browser.new_context(viewport={'width': 1600, 'height': 1000})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = context.request.get(base + '/api/backend/api/v1/inbox')
    assert response.status == 401, 'Unauthenticated API must reject access'
    page.goto(base + '/workspace', wait_until='networkidle')
    if '/login' in page.url:
        page.get_by_label('Demo workspace password').fill(os.environ['WORKSPACE_PASSWORD'])
        page.get_by_role('button', name='Sign in', exact=True).click()
        page.wait_for_url(base + '/workspace')
    page.get_by_role('button', name='Unified inbox', exact=True).click()
    page.get_by_role('button', name='New demo inquiry', exact=True).click()
    page.get_by_role('button', name='GCC · High intent', exact=True).click()
    with page.expect_response(lambda response: response.url.endswith('/api/v1/inbox') and response.request.method == 'POST') as created:
        page.get_by_role('button', name='Receive and analyze', exact=True).click()
    inquiry_id = created.value.json()['id']
    expect(page.locator('.inquiry-composer')).to_have_count(0)
    expect(page.locator('.conversation-detail')).to_have_attribute('data-inquiry-id', inquiry_id)
    expect(page.get_by_role('heading', name='Suggested project profile')).to_be_visible(timeout=30000)
    page.locator('.qualification-editor').get_by_role('button', name='Confirm fields to Lead').click()
    expect(page.get_by_text('Reviewed · r1', exact=True)).to_be_visible()
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(out / 'workspace.png'), full_page=True)
    page.locator('.sales-profile').get_by_role('button', name='Create opportunity', exact=True).click()
    page.get_by_role('dialog').get_by_role('button', name='Create opportunity', exact=True).click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    page.get_by_role('button', name='Opportunities', exact=True).click()
    card = page.locator('.opportunity-card').filter(has=page.get_by_role('button', name='Review Qualified')).last
    card.locator('select').select_option('solution_fit')
    expect(page.locator('.kanban-column').filter(has=page.get_by_role('heading', name='Solution', exact=False)).locator('.opportunity-card')).to_have_count(1)
    page.get_by_role('button', name='Review Qualified', exact=True).last.click()
    dialog = page.get_by_role('dialog')
    for label in ['Contact is reachable', 'A relevant business need is confirmed', 'Project buyer or channel integrator fits our target']:
        dialog.get_by_label(label, exact=True).check()
    dialog.get_by_role('button', name='Confirm Qualified and record event').click()
    expect(page.get_by_role('dialog')).to_have_count(0)
    expect(page.get_by_text('Human qualified', exact=True).last).to_be_visible()
    page.screenshot(path=str(out / 'pipeline.png'), full_page=True)
    page.get_by_role('button', name='Feedback delivery', exact=True).click()
    expect(page.get_by_text('Mock receipt', exact=True).last).to_be_visible()
    page.get_by_text('Payload and receipt', exact=True).last.click()
    page.screenshot(path=str(out / 'feedback.png'), full_page=True)
    data = context.request.get(base + '/api/backend/api/v1/dashboard').json()
    item = data['opportunities'][0]
    headers = {'Origin': base.rsplit('/sales', 1)[0]}
    payload = {'contactReachable': True, 'relevantNeed': True, 'targetBuyer': True, 'nextAction': item['nextAction']}
    replay = context.request.post(base + '/api/backend/api/v1/opportunities/' + item['id'] + '/qualify', data=payload, headers=headers)
    assert replay.ok and replay.json()['deduplicated'] is True
    assert context.request.post(base + '/api/backend/api/v1/inbox/import', data={}, headers=headers).status == 404
    assert context.request.post(base + '/api/backend/api/v1/inbox', data={}, headers={'Origin': 'https://invalid.example'}).status == 403
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='Open navigation').click()
    page.get_by_role('button', name='Unified inbox', exact=True).click()
    expect(page.get_by_role('heading', name='Suggested project profile')).to_be_visible()
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Mobile document overflow'
    page.screenshot(path=str(out / 'mobile.png'), full_page=True)
    assert not errors, errors
    receipt = {'ok': True, 'checks': ['login', 'unauthenticated_api_rejected', 'inquiry_received', 'automatic_analysis', 'fields_reviewed', 'opportunity_created', 'stage_updated', 'human_qualified', 'mock_receipt', 'qualification_replay_deduplicated', 'bridge_proxy_rejected', 'csrf_rejected', 'mobile_no_overflow', 'no_page_errors'], 'lead_id': item['primarySourceLeadId'], 'opportunity_id': item['id'], 'event_id': replay.json()['delivery']['eventId']}
    (out / 'browser-acceptance.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))
    browser.close()
