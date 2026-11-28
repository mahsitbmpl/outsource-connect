"""
Browser test (kiosk 3.1 self-repair): the evening problem. Simulates (1) the screen going off and on,
(2) a frozen camera picture, (3) a face-detection call that never finishes. The app must recover by itself.
Run: node tools/dev-server.js --demo &   python3 tests/e2e_kiosk_selfheal.py /tmp/shots
"""
import asyncio, sys, urllib.request, json
from playwright.async_api import async_playwright
BASE = 'http://localhost:8787'; SHOTS = sys.argv[1] if len(sys.argv) > 1 else '/tmp'
CFG = "window.OSC_CONFIG={apiUrl:'https://script.google.com/macros/s/TEST/exec'};"
def bridge(body): return urllib.request.urlopen(urllib.request.Request(BASE + '/api', data=body.encode())).read().decode()
async def wire(ctx):
    await ctx.route('https://script.google.com/**', lambda r: r.fulfill(status=200, content_type='application/json', body=bridge(r.request.post_data)))
    await ctx.route('**/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CFG))

async def main():
    temp = urllib.request.urlopen(BASE + '/__admin').read().decode(); errors = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        cctx = await b.new_context(); await wire(cctx); con = await cctx.new_page()
        await con.goto(BASE + '/console/')
        await con.fill('input[name=username]', 'admin'); await con.fill('input[name=password]', temp); await con.click('button[type=submit]')
        await con.wait_for_selector('#cpForm'); await con.fill('input[name=oldPassword]', temp); await con.fill('input[name=newPassword]', 'Hospital2026x'); await con.fill('input[name=confirm]', 'Hospital2026x')
        await con.click('button[type=submit]'); await con.wait_for_selector('.kpi')
        await con.click('a[href="#/tablet"]'); await con.wait_for_selector('#add'); await con.click('#add'); await con.click('.dialog button[type=submit]')
        await con.wait_for_selector('.secret'); code = (await con.inner_text('.secret')).strip(); await con.click('.dialog button[type=submit]')

        kctx = await b.new_context(viewport={'width': 1152, 'height': 720}, permissions=['camera']); await wire(kctx)
        k = await kctx.new_page()
        k.on('pageerror', lambda e: errors.append('kiosk: ' + str(e)))
        await k.goto(BASE + '/kiosk/'); await k.wait_for_selector('#code')
        await k.fill('#code', code); await k.click('#setupForm button')
        await k.wait_for_function("document.body.dataset.mode==='idle'", timeout=120000)
        st = await k.evaluate("({v: window.__kiosk.VERSION, res: document.querySelector('#cam').videoWidth + 'x' + document.querySelector('#cam').videoHeight})")
        print('kiosk', st); assert st['v'] == '3.1.0' and st['res'] == '640x480', st

        # 1. screen off for a while, then on: the camera is restarted and the loop keeps going
        await k.evaluate("""() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis || 'visible' });
          window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); }""")
        await k.wait_for_timeout(1500)
        await k.evaluate("() => { document.querySelector('#cam').pause(); window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }")
        await k.wait_for_timeout(2500)
        s1 = await k.evaluate("({paused: document.querySelector('#cam').paused, mode: document.body.dataset.mode, loopAge: performance.now() - window.__kiosk.S.loopAt})")
        print('after screen on:', s1); assert not s1['paused'] and s1['mode'] == 'idle' and s1['loopAge'] < 3000, s1

        # 2. frozen picture: the video stops moving -> camera restarted by the watchdog (checks every 5 s)
        before = await k.evaluate("window.__kiosk.S.diag.camRestarts")
        await k.evaluate("() => { const v = document.querySelector('#cam'); v.pause(); v.play = () => Promise.resolve(); }")  # stays paused
        await k.wait_for_function(f"window.__kiosk.S.diag.camRestarts > {before}", timeout=20000)
        print('frozen camera restarted, restarts =', await k.evaluate("window.__kiosk.S.diag.camRestarts"))
        await k.evaluate("() => { const v = document.querySelector('#cam'); delete v.play; v.play(); }")
        await k.wait_for_function("!document.querySelector('#cam').paused", timeout=10000)

        # 3. a detection call that never finishes (graphics chip stuck): the app restarts itself and records why
        await k.evaluate("() => { window.__kiosk.face.hang = true; }")
        await k.wait_for_function("localStorage.getItem('osc.k.reload') !== null", timeout=30000)
        await k.wait_for_function("document.body && document.body.dataset.mode==='idle'", timeout=120000)
        why = json.loads(await k.evaluate("localStorage.getItem('osc.k.reload')"))
        diag = await k.evaluate("window.__kiosk.S.diag")
        print('restarted itself because:', why['reason'], '| diag after restart:', diag)
        assert why['reason'] == 'face loop stuck' and 'face loop stuck' in diag['reloadReason']
        await k.screenshot(path=f'{SHOTS}/k_selfheal_idle.png')

        # the heartbeat carries the diagnostics to the console Tablet page
        await k.evaluate("() => window.__kiosk && 0")
        await k.wait_for_timeout(1500)
        await con.goto(BASE + '/console/#/home'); await con.wait_for_selector('#dashRoot')
        await con.click('a[href="#/tablet"]'); await con.wait_for_selector('#rf'); await con.wait_for_timeout(800); await con.click('#rf')
        await con.wait_for_selector('.diag', timeout=20000)
        txt = await con.inner_text('.diag'); print('console tablet health:', txt.replace('\n', ' | ')); assert 'Self-repairs' in txt
        await con.screenshot(path=f'{SHOTS}/k_selfheal_console.png')
        await b.close()
    real = [e for e in errors if 'Failed to fetch' not in e]
    print('JS errors:', real or 'none'); assert not real
    print('KIOSK SELF-HEAL E2E OK')
asyncio.run(main())
