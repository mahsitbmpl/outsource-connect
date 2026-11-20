"""Browser test of Duties, Rules and the Rule test report (node tools/dev-server.js --demo --punches)."""
import asyncio, sys, urllib.request
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()
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
        await pg.wait_for_selector('.kpi')
        await pg.click('a[href="#/duties"]'); await pg.wait_for_selector('#dl table')
        n = await pg.locator('#dl tbody tr').count(); print('duty rows:', n); assert n >= 6, n
        await pg.screenshot(path=f'{SHOTS}/d1_duties.png', full_page=True)
        await pg.click('[data-why] >> nth=0'); await pg.wait_for_selector('.dialog dl'); await pg.screenshot(path=f'{SHOTS}/d2_how.png'); await pg.click('.dialog button[type=submit]')
        await pg.click('[data-tab="days"]'); await pg.wait_for_selector('#dl table'); await pg.screenshot(path=f'{SHOTS}/d3_days.png', full_page=True)
        await pg.click('[data-tab="exc"]'); await pg.wait_for_selector('#dl .tablebox'); txt = await pg.inner_text('#dl'); print('exceptions shown:', [t for t in ['Missing OUT', 'Missing IN', 'Late arrival', 'Over 12 h', 'Short duty'] if t in txt])
        await pg.screenshot(path=f'{SHOTS}/d4_attention.png', full_page=True)
        await pg.click('a[href="#/rules"]'); await pg.wait_for_selector('#nv'); await pg.screenshot(path=f'{SHOTS}/d5_rules.png', full_page=True)
        await pg.click('#nv'); await pg.fill('.dialog input[name=graceMin]', '15'); await pg.click('#pv'); await pg.wait_for_selector('#pvr .note'); print('preview:', await pg.inner_text('#pvr .note'))
        await pg.screenshot(path=f'{SHOTS}/d6_preview.png'); await pg.click('.dialog [data-cancel]')
        await pg.click('a[href="#/rule-tests"]'); await pg.wait_for_selector('#prt'); summary = await pg.inner_text('.note'); print(summary)
        import re; m = re.search(r'(\d+) of (\d+)', summary); assert m and m.group(1) == m.group(2), summary
        await pg.screenshot(path=f'{SHOTS}/d7_tests.png')
        await b.close()
    print('JS errors:', errors or 'none'); print('DUTIES E2E OK')
asyncio.run(main())
