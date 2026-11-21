"""Browser test: System health (tamper check, speed check) and the parallel-run checker (node tools/dev-server.js --demo --month)."""
import asyncio, sys, urllib.request, datetime
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode(); errors = []
    t = datetime.date.today().replace(day=1) - datetime.timedelta(days=1); ym = t.strftime('%Y-%m')
    rows = ['Employee ID,Date,Hours']
    for i in range(1, 8):
        for d in range(1, 11):
            rows.append(f'HK{i:03d},{ym}-{d:02d},{8 if (i, d) == (2, 3) else 12}')
    open('/tmp/register.csv', 'w').write('\n'.join(rows) + '\n')
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        await ctx.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
        await ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
        pg = await ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e))); pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        await pg.goto(BASE + '/console/')
        await pg.fill('input[name=username]', 'admin'); await pg.fill('input[name=password]', temp); await pg.click('button[type=submit]')
        await pg.wait_for_selector('#cpForm'); await pg.fill('input[name=oldPassword]', temp); await pg.fill('input[name=newPassword]', 'Hospital2026x'); await pg.fill('input[name=confirm]', 'Hospital2026x'); await pg.click('#cpForm button[type=submit]')
        await pg.wait_for_selector('#dashRoot')
        # system health
        await pg.click('a[href="#/health"]'); await pg.wait_for_selector('#hInt')
        txt = await pg.inner_text('#content'); assert 'Sheet size' in txt and 'Google Sheet sharing' in txt, txt[:300]
        await pg.click('#hInt'); await pg.wait_for_selector('#hOut .note'); ht = await pg.inner_text('#hOut'); print(ht[:200].replace('\n', ' | ')); assert 'No changes found' in ht
        await pg.screenshot(path=f'{SHOTS}/r1_health.png', full_page=True)
        await pg.click('#hSpeed'); await pg.wait_for_selector('#hOut table'); st = await pg.inner_text('#hOut'); assert 'Dashboard' in st and 'Tablet start-up' in st
        # parallel run
        await pg.click('a[href="#/parallel"]'); await pg.wait_for_selector('#pFile', state='attached')
        await pg.set_input_files('#pFile', '/tmp/register.csv'); await pg.wait_for_selector('#pOut .kpi')
        pt = await pg.inner_text('#pOut'); print(pt[:400].replace('\n', ' | '))
        assert 'Rows compared' in pt and 'Differences' in pt and 'HK002' in pt
        await pg.screenshot(path=f'{SHOTS}/r2_parallel.png', full_page=True)
        async with pg.expect_download() as dl: await pg.click('#pCsv')
        d = await dl.value; csv = open(await d.path(), encoding='utf-8-sig').read(); assert 'Register hours' in csv, csv[:200]
        await pg.select_option('#pTol', '1'); await pg.wait_for_timeout(200)
        # templates are served
        assert urllib.request.urlopen(BASE + '/console/templates/parallel_run_template.xlsx').read()[:2] == b'PK'
        await b.close()
    print('JS errors:', errors or 'none'); assert not errors
    print('PHASE6 E2E OK')
asyncio.run(main())
