"""Accept one fictional website inquiry through the actual Chatwoot-to-CRM path."""
import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

site = os.environ['DEMO_SITE_URL'].rstrip('/')
workspace = os.environ['WORKFLOW_URL'].rstrip('/')
output = Path(os.environ.get('SNAPSHOT_DIR', '/tmp/live-website-evidence'))
output.mkdir(parents=True, exist_ok=True)
message = 'Fictional v0.1 acceptance: I am the project manager for a new shopping mall in Riyadh, Saudi Arabia, with 800 parking spaces. We need ANPR, barriers and a payment system. Installation is planned for Q1 next year. Please request our site drawings.'
with sync_playwright() as p:
    options = {'headless': True}
    if os.environ.get('BROWSER_EXECUTABLE'): options['executable_path'] = os.environ['BROWSER_EXECUTABLE']
    if os.environ.get('BROWSER_PROXY'): options['proxy'] = {'server': os.environ['BROWSER_PROXY']}
    browser = p.chromium.launch(**options)
    visitor = browser.new_context(viewport={'width': 1600, 'height': 1000})
    page = visitor.new_page()
    page.goto(site + '/', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_function('Boolean(window.$chatwoot && window.$chatwoot.hasLoaded)', timeout=60000)
    page.evaluate("window.$chatwoot.toggle('open')")
    frame = page.frame_locator('#chatwoot_live_chat_widget')
    frame.get_by_role('button', name='Start Conversation').click(timeout=30000)
    with page.expect_response(lambda r: '/api/v1/widget/messages' in r.url and r.request.method == 'POST', timeout=30000) as sent:
        frame.locator('textarea').fill(message)
        frame.locator('textarea').press('Enter')
    source = sent.value.json()
    cid = source['conversation_id']
    print(json.dumps({'stage': 'website_submitted', 'conversation_id': cid, 'message_id': source['id']}), flush=True)
    page.screenshot(path=str(output / 'website-inquiry.png'))
    operator = browser.new_context(viewport={'width': 1600, 'height': 1000})
    app = operator.new_page()
    app.goto(workspace + '/workspace', wait_until='domcontentloaded', timeout=60000)
    if '/login' in app.url:
        app.get_by_label('Demo workspace password').fill(os.environ['WORKSPACE_PASSWORD'])
        app.get_by_role('button', name='Sign in', exact=True).click()
        app.wait_for_url(workspace + '/workspace', timeout=30000)
    inquiry = None
    deadline = time.monotonic() + 160
    while time.monotonic() < deadline:
        response = operator.request.get(workspace + '/api/backend/api/v1/inbox')
        assert response.ok, 'Authenticated inbox read failed'
        inquiry = next((row for row in response.json() if row['conversationId'] == 'chatwoot:' + str(cid)), None)
        if inquiry and inquiry['status'] in ['analyzed', 'failed']: break
        app.wait_for_timeout(2500)
    assert inquiry and inquiry['status'] == 'analyzed', 'Website analysis was not saved successfully'
    assert inquiry['modelProvider'] == 'codex', 'A live model receipt is required for this acceptance'
    assert inquiry['message'] == message and inquiry['analysis']['parkingSpaces'] == 800
    print(json.dumps({'stage': 'live_analysis_saved', 'inquiry_id': inquiry['id'], 'lead_id': inquiry['leadId'], 'provider': inquiry['modelProvider']}), flush=True)
    app.reload(wait_until='domcontentloaded')
    app.get_by_role('button', name='Unified inbox', exact=True).click()
    app.locator('.conversation-list button').filter(has_text='Website visitor ' + str(cid)).click()
    expect(app.get_by_text('AI · codex', exact=True)).to_be_visible()
    app.locator('.qualification-editor').get_by_role('button', name='Confirm fields to Lead').click()
    expect(app.get_by_text('Reviewed · r1', exact=True)).to_be_visible()
    app.evaluate('window.scrollTo(0,0)')
    app.screenshot(path=str(output / 'live-inbox.png'), full_page=True)
    app.locator('.sales-profile').get_by_role('button', name='Create opportunity', exact=True).click()
    dialog = app.get_by_role('dialog')
    dialog.get_by_label('Opportunity name').fill('Riyadh mall · website demo ' + str(cid))
    with app.expect_response(lambda r: r.url.endswith('/api/v1/opportunities') and r.request.method == 'POST') as created:
        dialog.get_by_role('button', name='Create opportunity', exact=True).click()
    opportunity = created.value.json()['opportunity']
    expect(app.get_by_role('dialog')).to_have_count(0)
    app.get_by_role('button', name='Opportunities', exact=True).click()
    card = app.locator('.opportunity-card').filter(has_text=opportunity['name'])
    card.locator('select').select_option('solution_fit')
    expect(card.locator('select')).to_have_value('solution_fit')
    card.get_by_role('button', name='Review Qualified').click()
    dialog = app.get_by_role('dialog')
    for label in ['Contact is reachable', 'A relevant business need is confirmed', 'Project buyer or channel integrator fits our target']:
        dialog.get_by_label(label, exact=True).check()
    dialog.get_by_role('button', name='Confirm Qualified and record event').click()
    expect(app.get_by_role('dialog')).to_have_count(0)
    expect(card.get_by_text('Human qualified', exact=True)).to_be_visible()
    app.evaluate('window.scrollTo(0,0)')
    app.screenshot(path=str(output / 'live-pipeline.png'), full_page=True)
    app.get_by_role('button', name='Feedback delivery', exact=True).click()
    expect(app.get_by_text('Mock receipt', exact=True)).to_be_visible()
    app.get_by_text('Payload and receipt', exact=True).first.click()
    app.evaluate('window.scrollTo(0,0)')
    app.screenshot(path=str(output / 'live-feedback.png'), full_page=True)
    data = operator.request.get(workspace + '/api/backend/api/v1/dashboard').json()
    lead = next(row for row in data['leads'] if row['id'] == inquiry['leadId'])
    deal = next(row for row in data['opportunities'] if row['id'] == opportunity['id'])
    events = [row for row in data['deliveries'] if row['primarySourceLeadId'] == lead['id']]
    assert lead['status'] == 'qualified' and lead['confirmedQualification']['parkingSpaces'] == 800
    assert deal['stage'] == 'solution_fit' and len(events) == 1 and events[0]['mode'] == 'mock' and events[0]['status'] == 'accepted'
    receipt = {'ok': True, 'synthetic': True, 'conversation_id': cid, 'message_id': source['id'], 'inquiry_id': inquiry['id'], 'lead_id': lead['id'], 'opportunity_id': deal['id'], 'event_id': events[0]['eventId'], 'model_provider': 'codex', 'delivery_mode': 'mock', 'manual_api_injection': False, 'checks': ['website_widget_submission', 'automatic_model_analysis', 'automatic_crm_import', 'source_message_equality', 'human_field_review', 'opportunity_creation', 'stage_update', 'human_qualification', 'one_mock_receipt']}
    (output / 'live-acceptance.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt), flush=True)
    browser.close()
