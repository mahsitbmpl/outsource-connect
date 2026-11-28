"""Browser test (v6.1): exceptions ignore/restore (single + bulk), punch date filters, bulk dismiss of unrecognised faces,
and speed: combined requests and pages drawn from the browser's memory while the server is slow (node tools/dev-server.js --demo --month)."""
import asyncio, sys, urllib.request, time, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()
SLOW = {'ms': 0}; CALLS = []
async def handler(r):
    body = r.request.post_data; a = json.loads(body).get('action'); CALLS.append(a)
    if SLOW['ms']: await asyncio.sleep(SLOW['ms'] / 1000)
    await r.fulfill(status=200, content_type='application/json', body=bridge(body))

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode(); errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        await ctx.route('https://script.google.com/**', handler)
        await ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE + '/console/')
        await pg.fill('input[name=username]', 'admin'); await pg.fill('input[name=password]', temp); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#cpForm'); await pg.fill('input[name=oldPassword]', temp); await pg.fill('input[name=newPassword]', 'Hospital2026x'); await pg.fill('input[name=confirm]', 'Hospital2026x'); await pg.click('#cpForm button[type=submit]')
        await pg.wait_for_selector('#dashRoot'); CALLS.clear(); await pg.wait_for_timeout(3000)
        print('requests after sign-in (background loading):', CALLS); assert 'batch' in CALLS and len(CALLS) <= 4, CALLS

        # ---- exceptions: ignore two (bulk), restore one ----
        await pg.click('a[href="#/exceptions"]'); await pg.wait_for_selector('.xsel')
        n0 = await pg.locator('.xc').count()
        await pg.locator('.xsel').nth(0).check(); await pg.locator('.xsel').nth(1).check()
        assert '2 selected' in await pg.inner_text('#selN')
        await pg.click('#bulkIgnore'); await pg.wait_for_selector('.dialog select[name=reasonCode]')
        await pg.select_option('.dialog select[name=reasonCode]', 'Other'); await pg.fill('.dialog textarea[name=note]', 'Duplicate of register entry')
        await pg.click('.dialog button[type=submit]'); await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(500)
        n1 = await pg.locator('.xc').count(); print('exception cards', n0, '->', n1); assert n1 == n0 - 2
        await pg.screenshot(path=f'{SHOTS}/v1_exceptions.png')
        await pg.select_option('#xView', 'Ignored'); await pg.wait_for_selector('[data-restore]')
        assert await pg.locator('[data-restore]').count() == 2
        assert 'Ignored · Other: Duplicate of register entry' in await pg.inner_text('#xl')
        await pg.screenshot(path=f'{SHOTS}/v2_ignored.png')
        await pg.locator('[data-restore]').first.click(); await pg.wait_for_timeout(800)
        await pg.wait_for_function("document.querySelectorAll('[data-restore]').length === 1", timeout=10000)
        # single ignore from a card
        await pg.select_option('#xView', 'Open'); await pg.wait_for_selector('[data-ignore]')
        await pg.locator('[data-ignore]').first.click(); await pg.wait_for_selector('.dialog select[name=reasonCode]')
        assert 'leaves the list without changing any hours' in await pg.inner_text('.dialog')
        await pg.click('.dialog [data-cancel]')

        # ---- punches: presets, filters, search, CSV ----
        await pg.click('a[href="#/punches"]'); await pg.wait_for_selector('[data-pre="lastMonth"]')
        await pg.click('[data-pre="lastMonth"]'); await pg.wait_for_selector('#pl table')
        t = await pg.inner_text('#pl .chips'); print('last month punches:', t.replace('\n', ' ')); assert 'Shown' in t
        await pg.select_option('#pt', 'OUT'); await pg.wait_for_timeout(1200)
        rows = await pg.locator('#pl tbody tr').count(); assert rows > 0
        assert await pg.locator('#pl tbody .pill.ok').count() == 0, 'only OUT rows'
        await pg.fill('#pq', 'HK001'); await pg.wait_for_timeout(300)
        names = await pg.locator('#pl tbody .who span').all_inner_texts(); assert names and all('HK001' in x for x in names), names[:3]
        async with pg.expect_download() as dl: await pg.click('#pcsv')
        csv = open(await (await dl.value).path(), encoding='utf-8-sig').read(); assert csv.startswith('Date time,Employee ID'), csv[:60]
        await pg.click('[data-pre="yesterday"]'); await pg.wait_for_selector('#pl')
        await pg.screenshot(path=f'{SHOTS}/v3_punches.png')

        # ---- unrecognised: select two, dismiss; then dismiss all shown ----
        await pg.click('a[href="#/unrecognised"]'); await pg.wait_for_selector('.usel')
        assert await pg.locator('.usel').count() == 4
        await pg.locator('.usel').nth(0).check(); await pg.locator('.usel').nth(1).check()
        await pg.click('#uDisSel'); await pg.wait_for_selector('.dialog select[name=reason]'); await pg.click('.dialog button[type=submit]')
        await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(600)
        assert await pg.locator('.usel').count() == 2
        await pg.screenshot(path=f'{SHOTS}/v4_unrec.png')
        await pg.click('#uDisAll'); await pg.wait_for_selector('.dialog select[name=reason]'); await pg.click('.dialog button[type=submit]')
        await pg.wait_for_selector('.dialog', state='detached'); await pg.wait_for_timeout(600)
        assert await pg.locator('.usel').count() == 0

        # ---- speed: close the browser tab, slow server (2.5 s a request), open again: remembered pages draw at once ----
        await pg.evaluate("localStorage.setItem('osc.rc.wroteAt', String(Date.now() - 3600000))")  # last save an hour ago (normal next visit)
        await pg.close(); SLOW['ms'] = 2500
        pg2 = await ctx.new_page(); pg2.on('pageerror', lambda e: errors.append(str(e)))
        t0 = time.time(); await pg2.goto(BASE + '/console/#/exceptions'); await pg2.wait_for_selector('.xc, .empty', timeout=15000)
        first = time.time() - t0
        t1 = time.time(); await pg2.click('a[href="#/punches"]'); await pg2.wait_for_selector('#pl table, #pl .empty, #pl .card', timeout=15000); second = time.time() - t1
        print('with a 2.5 s server: exceptions page drawn in %.2f s, punches in %.2f s' % (first, second))
        assert first < 2.0 and second < 1.0, (first, second)
        await pg2.wait_for_timeout(6000)  # background refresh finishes
        await b.close()
    print('JS errors:', errors or 'none'); assert not errors
    print('V6.1 E2E OK')
asyncio.run(main())
