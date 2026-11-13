"""Development helper: load the site in headless Chrome and screenshot chosen moments.
usage: python3 tests/shots.py <base-url> <out-prefix> <t1,t2,...> [query]"""
import sys, json, time
from playwright.sync_api import sync_playwright

base, prefix, times = sys.argv[1], sys.argv[2], [float(x) for x in sys.argv[3].split(',')]
query = sys.argv[4] if len(sys.argv) > 4 else 'q=medium&seed=1787'
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'])
    page = b.new_page(viewport={'width': 1120, 'height': 630})
    page.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    page.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    page.on('requestfailed', lambda r: logs.append(f'[requestfailed] {r.url}'))
    page.goto(f'{base}/?{query}')
    page.wait_for_function('window.__ride && window.__ride.app.ready', timeout=120000)
    print('stats:', page.evaluate('document.getElementById("simstats").textContent'))
    page.evaluate('document.getElementById("veil").classList.add("gone"); document.getElementById("hud").style.display="none"')
    for t in times:
        f0 = page.evaluate('window.__ride.app.frames')
        page.evaluate(f'window.__ride.seek({t})')
        page.wait_for_function(f'window.__ride.app.frames > {f0}', timeout=120000)
        time.sleep(0.3)
        page.screenshot(path=f'{prefix}_{t:05.2f}.png')
        st = page.evaluate('(() => { const r = window.__ride; const s = r.state(); const c = r.rig.camera.position; return {phase: s.phase, tip: s.tipIndex, cam: [c.x|0, c.y|0, c.z|0], inCloud: +r.rig.inCloud.toFixed(2)}; })()')
        print(t, json.dumps(st))
    b.close()
print('\n'.join(logs) if logs else 'no console output')
