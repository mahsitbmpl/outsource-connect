"""Browser test: dashboard, exceptions fixes, penalties (node tools/dev-server.js --demo --punches)."""
import asyncio, sys, urllib.request
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()
async def fix(pg, sel, reason='Forgot to punch'):
    await pg.click(sel); await pg.wait_for_selector('.dialog select[name=reasonCode]')
    await pg.select_option('.dialog select[name=reasonCode]', reason); await pg.fill('.dialog textarea[name=note]', 'Checked with supervisor')
    await pg.click('.dialog button[type=submit]'); await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(400)
async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode(); errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900})
        await ctx.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
        await ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE + '/console/')
        await pg.fill('input[name=username]', 'admin'); await pg.fill('input[name=password]', temp); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#cpForm'); await pg.fill('input[name=oldPassword]', temp); await pg.fill('input[name=newPassword]', 'Hospital2026x'); await pg.fill('input[name=confirm]', 'Hospital2026x'); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#dashRoot svg'); await pg.screenshot(path=f'{SHOTS}/p1_dashboard.png', full_page=True)
        await pg.click('a[href="#/exceptions"]'); await pg.wait_for_selector('#xl .card')
        before = await pg.locator('#xl .card').count(); print('exception cards:', before)
        await pg.screenshot(path=f'{SHOTS}/p2_exceptions.png', full_page=True)
        await fix(pg, '[data-a="setOut"] >> nth=0'); await pg.wait_for_selector('#xl')
        await fix(pg, '[data-a="addIn"] >> nth=0')
        await fix(pg, '[data-a="grace"] >> nth=0', 'Transport problem')
        await fix(pg, '[data-a="approveAll"] >> nth=0', 'Emergency')
        await pg.wait_for_timeout(500)
        after = await pg.locator('#xl .card').count(); print('after 4 fixes:', after); assert after <= before - 4, (before, after)
        await pg.screenshot(path=f'{SHOTS}/p3_after.png', full_page=True)
        await pg.click('a[href="#/penalties"]'); await pg.wait_for_selector('#addP')
        await pg.click('#addP'); await pg.fill('.dialog input[name=amount]', '3000'); await pg.fill('.dialog textarea[name=reason]', 'Grooming not as per SOP'); await pg.click('.dialog button[type=submit]')
        await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(300)
        await pg.click('#addD'); await pg.fill('.dialog input[name=hours]', '4'); await pg.select_option('.dialog select[name=staffId]', index=1); await pg.fill('.dialog textarea[name=reason]', 'Left duty without handover'); await pg.click('.dialog button[type=submit]')
        await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(300)
        txt = await pg.inner_text('#content'); assert '3,000.00' in txt and '4.00' in txt, txt[:400]
        await pg.screenshot(path=f'{SHOTS}/p4_penalties.png', full_page=True)
        await pg.click('a[href="#/duties"]'); await pg.wait_for_selector('[data-why]'); await pg.click('[data-why] >> nth=0'); await pg.wait_for_selector('.dialog [data-da]')
        await pg.screenshot(path=f'{SHOTS}/p5_how_actions.png')
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        await m.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
        await m.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
        mp = await m.new_page(); await mp.goto(BASE + '/console/')
        await mp.fill('input[name=username]', 'admin'); await mp.fill('input[name=password]', 'Hospital2026x'); await mp.click('button[type=submit]')
        await mp.wait_for_selector('#dashRoot svg'); await mp.screenshot(path=f'{SHOTS}/p6_mobile.png', full_page=True)
        await b.close()
    print('JS errors:', errors or 'none'); print('PHASE4 E2E OK')
asyncio.run(main())
