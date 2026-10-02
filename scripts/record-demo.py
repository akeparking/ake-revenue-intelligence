"""Record actual deployed browser actions, with an edit list that omits only waiting time."""
import json, os, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect, TimeoutError as BrowserTimeout

root = Path(os.environ['VIDEO_OUTPUT_DIR'])
root.mkdir(parents=True, exist_ok=True)
workspace = os.environ['WORKFLOW_URL'].rstrip('/')
site = os.environ['DEMO_SITE_URL'].rstrip('/')
message = 'Fictional video demo: I am the project manager for a new shopping mall in Riyadh, Saudi Arabia, with 800 parking spaces. We need ANPR, barriers and a payment system. Installation is planned for Q1 next year. Please request our site drawings.'
segments = []
with sync_playwright() as p:
    options = {'headless': True}
    if os.environ.get('BROWSER_EXECUTABLE'): options['executable_path'] = os.environ['BROWSER_EXECUTABLE']
    if os.environ.get('BROWSER_PROXY'): options['proxy'] = {'server': os.environ['BROWSER_PROXY']}
    browser = p.chromium.launch(**options)
    auth = browser.new_context()
    login = auth.new_page()
    login.goto(workspace + '/login', wait_until='domcontentloaded', timeout=60000)
    login.get_by_label('Demo workspace password').fill(os.environ['WORKSPACE_PASSWORD'])
    login.get_by_role('button', name='Sign in', exact=True).click()
    login.wait_for_url(workspace + '/workspace', timeout=30000)
    context = browser.new_context(viewport={'width': 1920, 'height': 1080}, storage_state=auth.storage_state(), record_video_dir=str(root / 'raw'), record_video_size={'width': 1920, 'height': 1080})
    zero = time.monotonic()
    page = context.new_page()
    def beat(title, caption, seconds, action):
        start = time.monotonic() - zero
        action()
        page.wait_for_timeout(max(0, seconds - (time.monotonic() - zero - start)) * 1000)
        end = time.monotonic() - zero
        segments.append({'title': title, 'caption': caption, 'start': start, 'end': end})
        print(json.dumps({'beat': title, 'recorded_seconds': round(end - start, 1)}), flush=True)
    page.goto(workspace, wait_until='networkidle', timeout=60000)
    beat('Business problem', 'B2B inquiries lose context between conversations, sales and marketing. Follow one fictional project.', 12, lambda: page.evaluate('window.scrollTo(0,0)'))
    for attempt in range(2):
        page.goto(site + '/', wait_until='domcontentloaded', timeout=60000)
        try:
            page.wait_for_function('Boolean(window.$chatwoot && window.$chatwoot.hasLoaded)', timeout=60000)
            break
        except BrowserTimeout:
            print(json.dumps({'widget_exists': page.evaluate('Boolean(window.$chatwoot)'), 'widget_loaded': page.evaluate('Boolean(window.$chatwoot?.hasLoaded)'), 'frames': len(page.frames)}), flush=True)
            if attempt == 1: raise
            print('Reloading before submission after a widget load timeout.', flush=True)
    sent = {}
    def send_inquiry():
        page.evaluate("window.$chatwoot.toggle('open')")
        frame = page.frame_locator('#chatwoot_live_chat_widget')
        frame.get_by_role('button', name='Start Conversation').click(timeout=30000)
        with page.expect_response(lambda r: '/api/v1/widget/messages' in r.url and r.request.method == 'POST', timeout=30000) as response:
            frame.locator('textarea').fill(message)
            page.wait_for_timeout(2500)
            frame.locator('textarea').press('Enter')
        sent.update(response.value.json())
    beat('Website inquiry', 'One website message: Riyadh, 800 spaces, ANPR, barriers and payment. The original conversation stays in Chatwoot.', 24, send_inquiry)
    cid = sent['conversation_id']
    # Network/model waiting is outside the selected video segments.
    inquiry = None
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        rows = context.request.get(workspace + '/api/backend/api/v1/inbox').json()
        inquiry = next((row for row in rows if row['conversationId'] == 'chatwoot:' + str(cid)), None)
        if inquiry and inquiry['status'] in ['analyzed', 'failed']: break
        page.wait_for_timeout(2000)
    assert inquiry and inquiry['status'] == 'analyzed' and inquiry['modelProvider'] == 'codex'
    page.goto(workspace + '/workspace', wait_until='domcontentloaded', timeout=60000)
    page.get_by_role('button', name='Unified inbox', exact=True).click()
    page.locator('.conversation-list button').filter(has_text='Website visitor ' + str(cid)).click()
    expect(page.get_by_text('AI · codex', exact=True)).to_be_visible()
    def evidence():
        page.evaluate('window.scrollTo(0,0)')
        page.locator('.analysis-summary summary').click()
    beat('AI evidence', 'The real AI result arrives automatically. Exact source evidence stays beside the original inquiry. Waiting time is omitted.', 24, evidence)
    def review():
        page.locator('.qualification-editor').get_by_role('button', name='Confirm fields to Lead').click()
        expect(page.get_by_text('Reviewed · r1', exact=True)).to_be_visible()
        page.wait_for_timeout(2500)
        page.locator('.sales-profile').get_by_role('button', name='Create opportunity', exact=True).click()
        dialog = page.get_by_role('dialog')
        dialog.get_by_label('Opportunity name').fill('Riyadh mall · video walkthrough')
        page.wait_for_timeout(3500)
        dialog.get_by_role('button', name='Create opportunity', exact=True).click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        page.get_by_role('button', name='Opportunities', exact=True).click()
        page.evaluate('window.scrollTo(0,0)')
    beat('Human review', 'Unknown company stays blank. A person confirms the Lead fields and creates a discovery opportunity.', 22, review)
    card = page.locator('.opportunity-card').filter(has_text='Riyadh mall · video walkthrough')
    def move_stage():
        card.scroll_into_view_if_needed()
        page.wait_for_timeout(2500)
        target = page.locator('.kanban-column').nth(1)
        card.drag_to(target)
        expect(card.locator('select')).to_have_value('solution_fit')
        page.evaluate('window.scrollTo(0,0)')
    beat('Pipeline', 'Move the opportunity from Discovery to Solution. The versioned stage change appears in the activity timeline.', 18, move_stage)
    def qualify():
        card.get_by_role('button', name='Review Qualified').click()
        dialog = page.get_by_role('dialog')
        page.wait_for_timeout(2000)
        for label in ['Contact is reachable', 'A relevant business need is confirmed', 'Project buyer or channel integrator fits our target']:
            dialog.get_by_label(label, exact=True).check()
            page.wait_for_timeout(1600)
        dialog.get_by_role('button', name='Confirm Qualified and record event').click()
        expect(page.get_by_role('dialog')).to_have_count(0)
        expect(card.get_by_text('Human qualified', exact=True)).to_be_visible()
    beat('Qualified', 'Qualified is a separate human decision: reachable contact, relevant need, buyer fit, owner and next action.', 22, qualify)
    def feedback():
        page.get_by_role('button', name='Feedback delivery', exact=True).click()
        page.get_by_text('Payload and receipt', exact=True).first.click()
        page.evaluate('window.scrollTo(0,0)')
    beat('Feedback', 'One stable conversion event produces a Mock receipt. This demonstrates the feedback contract, not live ad attribution.', 20, feedback)
    def scenarios():
        page.get_by_role('button', name='Unified inbox', exact=True).click()
        page.locator('.conversation-list button').filter(has_text='SEA Demo Integrator').click()
        page.wait_for_timeout(3500)
        page.locator('.conversation-list button').filter(has_text='Demo Job Applicant').click()
        page.wait_for_timeout(3500)
        page.get_by_role('button', name='Integrations', exact=True).click()
        page.evaluate('window.scrollTo(0,0)')
    beat('Three scenarios', 'High-intent project, exploratory integrator, non-target inquiry. Email, WhatsApp and advertising remain clearly labeled Mock.', 18, scenarios)
    data = context.request.get(workspace + '/api/backend/api/v1/dashboard').json()
    lead = next(row for row in data['leads'] if row['id'] == inquiry['leadId'])
    events = [row for row in data['deliveries'] if row['primarySourceLeadId'] == lead['id']]
    assert lead['status'] == 'qualified' and len(events) == 1 and events[0]['mode'] == 'mock' and events[0]['status'] == 'accepted'
    video = page.video
    context.close()
    source = video.path()
    manifest = {'source': str(source), 'segments': segments, 'synthetic': True, 'conversation_id': cid, 'message_id': sent['id'], 'lead_id': lead['id'], 'event_id': events[0]['eventId'], 'model_provider': 'codex', 'delivery_mode': 'mock', 'waiting_omitted': True}
    (root / 'recording.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'ok': True, 'selected_duration': sum(s['end'] - s['start'] for s in segments), 'segments': len(segments)}), flush=True)
    browser.close()
