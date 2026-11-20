"""
Browser test of the console against the real Code.gs (via tools/dev-server.js).
Run: node tools/dev-server.js --demo &  then  python3 tests/e2e_console.py
"""
import asyncio, json, sys, urllib.request
from playwright.async_api import async_playwright

BASE = 'http://localhost:8787'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'

def bridge(body):
    req = urllib.request.Request(BASE + '/api', data=body.encode(), headers={'Content-Type': 'text/plain'})
    return urllib.request.urlopen(req).read().decode()

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode()
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900})
        await ctx.route('https://script.google.com/**', lambda route: route.fulfill(status=200, content_type='application/json', body=bridge(route.request.post_data)))
        await ctx.add_init_script("window.__cfg=1")
        page = await ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        # point config at a script.google.com URL so the route catches it
        await page.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body="window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"))
        await page.goto(BASE + '/console/')
        await page.fill('input[name=username]', 'admin')
        await page.fill('input[name=password]', 'wrong-password')
        await page.click('button[type=submit]')
        await page.wait_for_selector('[data-err]:not([hidden])')
        assert 'Wrong username or password' in await page.inner_text('[data-err]')
        await page.fill('input[name=password]', temp)
        await page.click('button[type=submit]')
        await page.wait_for_selector('#cpForm')
        await page.screenshot(path=f'{SHOTS}/e2e_1_change_pw.png')
        await page.fill('input[name=oldPassword]', temp)
        await page.fill('input[name=newPassword]', 'Hospital2026x')
        await page.fill('input[name=confirm]', 'Hospital2026x')
        await page.click('button[type=submit]')
        await page.wait_for_selector('.kpi')
        await page.wait_for_timeout(300)
        await page.screenshot(path=f'{SHOTS}/e2e_2_home.png', full_page=True)
        # staff list (demo data)
        await page.click('a[href="#/staff"]')
        await page.wait_for_selector('table.t tbody tr')
        n = await page.locator('table.t tbody tr').count()
        assert n == 30, n
        await page.fill('#q', 'HK01')
        await page.wait_for_timeout(300)
        assert await page.locator('table.t tbody tr').count() == 5
        await page.fill('#q', '')
        await page.screenshot(path=f'{SHOTS}/e2e_3_staff.png')
        # add staff with a validation error first
        await page.click('a[href="#/staff/new"]')
        await page.wait_for_selector('#sf')
        await page.select_option('select[name=title]', 'Ms.')
        await page.fill('input[name=fullName]', 'Kiran Desai')
        await page.fill('input[name=dob]', '2010-01-01')
        await page.fill('input[name=mobile]', '98123 45678')
        await page.select_option('select[name=deptCode]', 'SC')
        await page.click('#sf button[type=submit]')
        await page.wait_for_selector('[data-field=dob].err')
        await page.screenshot(path=f'{SHOTS}/e2e_4_validation.png')
        await page.fill('input[name=dob]', '1998-08-02')
        await page.click('#sf button[type=submit]')
        await page.wait_for_url('**/#/staff/SC*')
        await page.wait_for_selector('#bMove')
        title = await page.inner_text('#pageTitle')
        assert 'Kiran Desai' in title, title
        await page.screenshot(path=f'{SHOTS}/e2e_5_detail.png', full_page=True)
        # companies + add rate
        await page.click('a[href="#/companies"]')
        await page.wait_for_selector('table.t tbody tr')
        await page.click('table.t tbody tr >> nth=0')
        await page.wait_for_selector('#bRate')
        await page.click('#bRate')
        await page.fill('.dialog input[name=ratePerDuty]', '830')
        await page.fill('.dialog input[name=effectiveFrom]', '2026-12-01')
        await page.click('.dialog button[type=submit]')
        await page.wait_for_selector('.toast')
        await page.screenshot(path=f'{SHOTS}/e2e_6_company.png', full_page=True)
        # users: create ops manager
        await page.click('a[href="#/users"]')
        await page.wait_for_selector('#add')
        await page.click('#add')
        await page.fill('.dialog input[name=username]', 'rina.shah')
        await page.fill('.dialog input[name=fullName]', 'Rina Shah')
        await page.click('.dialog button[type=submit]')
        await page.wait_for_selector('.secret')
        pw = (await page.inner_text('.secret')).strip()
        assert len(pw) >= 12
        await page.screenshot(path=f'{SHOTS}/e2e_7_user.png')
        await page.click('.dialog button[type=submit]')
        await page.click('a[href="#/settings"]')
        await page.wait_for_selector('[data-key]')
        await page.click('a[href="#/audit"]')
        await page.wait_for_selector('table.t tbody tr')
        await page.click('a[href="#/departments"]')
        await page.wait_for_selector('[data-edit]')
        # import: upload the template (2 example rows reference unknown company codes -> errors shown)
        await page.goto(BASE + '/console/#/staff/import')
        await page.wait_for_selector('#file')
        await page.set_input_files('#file', 'console/templates/staff_import_template.xlsx')
        await page.wait_for_selector('#rep .pill')
        await page.screenshot(path=f'{SHOTS}/e2e_8_import.png', full_page=True)
        rep = await page.inner_text('#rep')
        assert 'with problems' in rep, rep[:300]
        # mobile layout
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True)
        await m.route('https://script.google.com/**', lambda route: route.fulfill(status=200, content_type='application/json', body=bridge(route.request.post_data)))
        mp = await m.new_page()
        await mp.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body="window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"))
        await mp.goto(BASE + '/console/')
        await mp.fill('input[name=username]', 'admin')
        await mp.fill('input[name=password]', 'Hospital2026x')
        await mp.click('button[type=submit]')
        await mp.wait_for_selector('.kpi')
        await mp.wait_for_timeout(300)
        await mp.screenshot(path=f'{SHOTS}/e2e_9_mobile.png', full_page=True)
        await b.close()
    real = [e for e in errors if 'favicon' not in e]
    print('JS errors:', real if real else 'none')
    print('E2E OK')

asyncio.run(main())
