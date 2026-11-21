"""Browser test: month-end pack, downloads, lock/unlock, compare & what-if, automation & emails (node tools/dev-server.js --demo --month)."""
import asyncio, sys, urllib.request, zipfile, io
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode(); errors = []
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

        # ---- month-end pack ----
        await pg.click('a[href="#/month"]'); await pg.wait_for_selector('#mDepts .card')
        txt = await pg.inner_text('#content'); print(txt[:600].replace('\n', ' | '))
        assert 'Housekeeping' in txt and 'Clear before locking' in txt, 'HK should be blocked'
        await pg.screenshot(path=f'{SHOTS}/q1_month.png', full_page=True)
        # bill preview
        await pg.click('[data-prev^="HK|"] >> nth=0'); await pg.wait_for_selector('.dialog .billpv')
        bt = await pg.inner_text('.dialog'); assert 'Net payable' in bt and 'Rupees' in bt, bt[:300]
        await pg.screenshot(path=f'{SHOTS}/q2_bill.png'); await pg.click('.dialog [data-cancel]')
        # downloads
        async with pg.expect_download() as dl: await pg.click('[data-file="xlsx"][data-k^="HK|"] >> nth=0')
        d = await dl.value; path = await d.path(); print('excel:', d.suggested_filename)
        z = zipfile.ZipFile(path); assert 'xl/worksheets/sheet5.xml' in z.namelist(); assert d.suggested_filename.endswith('_DRAFT.xlsx')
        open(f'{SHOTS}/q_pack.xlsx', 'wb').write(open(path, 'rb').read())
        async with pg.expect_download() as dl2: await pg.click('[data-file="pdf"][data-k^="HK|"] >> nth=0')
        d2 = await dl2.value; pdf = open(await d2.path(), 'rb').read(); assert pdf[:5] == b'%PDF-', pdf[:10]; print('pdf:', d2.suggested_filename, len(pdf))
        open(f'{SHOTS}/q_bill.pdf', 'wb').write(pdf)
        # lock SS (ready), then force-lock HK as Admin, then unlock HK
        await pg.click('[data-lock="SS"]'); await pg.wait_for_selector('.dialog'); await pg.click('.dialog button[type=submit]'); await pg.wait_for_selector('.dialog', state='detached')
        await pg.wait_for_selector('[data-unlock="SS"]')
        await pg.click('[data-lock="HK"][data-force]'); await pg.wait_for_selector('.dialog textarea[name=reason]')
        await pg.fill('.dialog textarea[name=reason]', 'Vendor deadline; open item checked on paper'); await pg.click('.dialog button[type=submit]'); await pg.wait_for_selector('.dialog', state='detached')
        await pg.wait_for_selector('[data-unlock="HK"]'); await pg.wait_for_timeout(300)
        txt = await pg.inner_text('#content'); assert 'MAH-OSC/HK/' in txt and 'locked with open items' in txt, txt[-800:]
        await pg.screenshot(path=f'{SHOTS}/q3_locked.png', full_page=True)
        async with pg.expect_download() as dl3: await pg.click('[data-file="pdf"][data-k^="HK|"] >> nth=0')
        d3 = await dl3.value; assert not d3.suggested_filename.endswith('_DRAFT_bill.pdf'), d3.suggested_filename
        await pg.click('[data-unlock="HK"]'); await pg.fill('.dialog textarea[name=reason]', 'Correction needed'); await pg.click('.dialog button[type=submit]'); await pg.wait_for_selector('.dialog', state='detached')
        await pg.wait_for_selector('[data-lock="HK"]')

        # ---- compare & what-if ----
        await pg.click('a[href="#/compare"]'); await pg.wait_for_selector('#wiR .wi')
        before = await pg.inner_text('#wiPay')
        await pg.fill('#wiR .wi >> nth=0', '900'); await pg.wait_for_timeout(200)
        after = await pg.inner_text('#wiPay'); diff = await pg.inner_text('#wiDiff'); print('what-if', before, '->', after, diff); assert before != after and diff.startswith('+')
        await pg.fill('#wiRules input[name=extraHalfFromMin]', '41'); await pg.fill('#wiRules input[name=extraFullFromMin]', '50'); await pg.click('#wiRules button[type=submit]')
        await pg.wait_for_selector('#wiRulesOut table'); wt = await pg.inner_text('#wiRulesOut'); print(wt[:200].replace('\n', ' | ')); assert 'duties would change' in wt
        await pg.screenshot(path=f'{SHOTS}/q4_compare.png', full_page=True)

        # ---- automation & emails ----
        await pg.click('a[href="#/automation"]'); await pg.wait_for_selector('[data-run]')
        await pg.click('[data-run="monthDraft"]'); await pg.wait_for_timeout(1500)
        await pg.wait_for_selector('[data-run]')
        at = await pg.inner_text('#content'); assert 'Draft month-end pack' in at
        await pg.click('#eTest'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'{SHOTS}/q5_automation.png', full_page=True)
        await pg.click('[data-pv="morning"]'); await pg.wait_for_selector('.dialog iframe.mailpv'); await pg.wait_for_timeout(500)
        fr = pg.frame_locator('.dialog iframe.mailpv'); mt = await fr.locator('body').inner_text(); assert 'Yesterday by department' in mt, mt[:200]
        await pg.screenshot(path=f'{SHOTS}/q6_mail_preview.png')
        await pg.click('.dialog [data-cancel]')
        await pg.click('a[href="#/settings"]'); await pg.wait_for_selector('[data-key="backupDay"]'); await pg.screenshot(path=f'{SHOTS}/q7_settings.png', full_page=True)

        # ---- phone ----
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        await m.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
        await m.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))
        mp = await m.new_page(); await mp.goto(BASE + '/console/')
        await mp.fill('input[name=username]', 'admin'); await mp.fill('input[name=password]', 'Hospital2026x'); await mp.click('button[type=submit]')
        await mp.wait_for_selector('#dashRoot'); await mp.goto(BASE + '/console/#/month'); await mp.wait_for_selector('#mDepts .card'); await mp.screenshot(path=f'{SHOTS}/q8_mobile_month.png', full_page=True)
        await b.close()
    print('JS errors:', errors or 'none'); assert not errors
    print('PHASE5 E2E OK')
asyncio.run(main())
