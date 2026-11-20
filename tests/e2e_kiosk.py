"""
Browser test: console + tablet page together against the real Code.gs (tools/dev-server.js --demo).
Uses Chrome's fake camera (a moving test pattern, no face), so it checks setup, signing, model loading,
enrollment hand-off and every result screen; real face recognition is checked on the real tablet.
Run: node tools/dev-server.js --demo &   python3 tests/e2e_kiosk.py /tmp/shots
"""
import asyncio, sys, urllib.request
from playwright.async_api import async_playwright

BASE = 'http://localhost:8787'
SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"

def bridge(body):
    req = urllib.request.Request(BASE + '/api', data=body.encode(), headers={'Content-Type': 'text/plain'})
    return urllib.request.urlopen(req).read().decode()

async def wire(ctx):
    await ctx.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
    await ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode()
    errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        # console: sign in, add a tablet, read the setup code
        cctx = await b.new_context(viewport={'width': 1366, 'height': 900}); await wire(cctx)
        con = await cctx.new_page()
        con.on('pageerror', lambda e: errors.append('console page: ' + str(e)))
        await con.goto(BASE + '/console/')
        await con.fill('input[name=username]', 'admin'); await con.fill('input[name=password]', temp); await con.click('button[type=submit]')
        await con.wait_for_selector('#cpForm')
        await con.fill('input[name=oldPassword]', temp); await con.fill('input[name=newPassword]', 'Hospital2026x'); await con.fill('input[name=confirm]', 'Hospital2026x')
        await con.click('button[type=submit]'); await con.wait_for_selector('.kpi')
        await con.click('a[href="#/tablet"]'); await con.wait_for_selector('#add')
        await con.click('#add'); await con.click('.dialog button[type=submit]')
        await con.wait_for_selector('.secret')
        code = (await con.inner_text('.secret')).strip()
        await con.screenshot(path=f'{SHOTS}/k1_setup_code.png')
        await con.click('.dialog button[type=submit]')

        # tablet
        kctx = await b.new_context(viewport={'width': 1152, 'height': 720}, permissions=['camera']); await wire(kctx)
        k = await kctx.new_page()
        k.on('pageerror', lambda e: errors.append('kiosk: ' + str(e)))
        k.on('console', lambda m: errors.append('kiosk console: ' + m.text) if m.type == 'error' else None)
        await k.goto(BASE + '/kiosk/')
        await k.wait_for_selector('#code')
        await k.screenshot(path=f'{SHOTS}/k2_tablet_setup.png')
        await k.fill('#code', 'TAB1-AAAA')
        await k.click('#setupForm button')
        await k.wait_for_timeout(300)
        assert 'not complete' in await k.inner_text('#setupErr')
        await k.fill('#code', code.lower().replace('-', ' '))
        await k.click('#setupForm button')
        await k.wait_for_function("document.body.dataset.mode==='idle'", timeout=120000)
        await k.screenshot(path=f'{SHOTS}/k3_idle.png')
        st = await k.evaluate("({people: window.__kiosk.S.people.length, cfg: !!window.__kiosk.S.config, backend: window.__kiosk.S.backend})")
        print('tablet state:', st)

        # the tablet reports to the server: device shows online in the console
        await k.evaluate("1")
        await con.click('#rf'); await con.wait_for_selector('.pill.ok')
        await con.screenshot(path=f'{SHOTS}/k4_tablet_status.png', full_page=True)

        # enrollment request from the console reaches the tablet within one poll (15 s)
        await con.goto(BASE + '/console/#/staff/HK002'); await con.wait_for_selector('#bEnroll')
        await con.click('#bEnroll'); await con.wait_for_selector('#enrSt .note')
        await k.wait_for_function("document.body.dataset.mode==='enroll'", timeout=30000)
        await k.wait_for_timeout(800)
        await k.screenshot(path=f'{SHOTS}/k5_enroll.png')
        await con.locator('#enrSt', has_text='InProgress').wait_for(timeout=20000)
        await con.screenshot(path=f'{SHOTS}/k6_enroll_console.png')
        await con.click('#enrCancel')
        await k.wait_for_function("document.body.dataset.mode==='idle'", timeout=30000)

        # result screens (rendered through the real screen code)
        shots = [
            ("IN", "{staffId:'HK001',name:'Mr. Aarav Demo',status:K.t2('inOk'),meta:'HK001 · Housekeeping · Supervisor',time:'08:02 AM',foot:K.t2('welcome')}", 'k7_in'),
            ("OUT", "{staffId:'HK001',name:'Mr. Aarav Demo',status:K.t2('outOk'),meta:'HK001 · Housekeeping · Supervisor',time:'08:32 PM',sub:'This duty: 12 h 30 m · IN 08:02 AM',foot:K.t2('thanks'),chip:'<span class=\"k-chip\">○ Saved on tablet · will sync</span>'}", 'k8_out'),
            ("DUP", "{staffId:'HK001',name:'Mr. Aarav Demo',status:K.t2('dup'),meta:'HK001 · IN was recorded',time:'08:02 AM',sub:K.t2('noNeed'),foot:K.t2('dup')}", 'k9_dup'),
            ("bad", "{name:'Please try again',status:K.t2('notRec'),meta:'Step closer and look straight at the camera',sub:'<span class=\"hi\">पुनः प्रयास करें</span>',foot:'Photo saved for review'}", 'k10_bad'),
        ]
        for kind, obj, name in shots:
            await k.evaluate(f"(() => {{ const K = window.__kiosk; K.showResult('{kind}', {obj}); }})()")
            await k.wait_for_timeout(250)
            await k.screenshot(path=f'{SHOTS}/{name}.png')
        await b.close()
    real = [e for e in errors if 'favicon' not in e]
    print('JS errors:', real if real else 'none')
    print('KIOSK E2E OK')

asyncio.run(main())
