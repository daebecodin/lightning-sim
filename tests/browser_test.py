"""End-to-end browser checks with Playwright and Chrome.

    python3 tests/browser_test.py http://localhost:5173 [--chrome /path/to/chrome]

Checks: the bolt reaches the ground, Play / Pause / Restart work, seed and
quality changes work, rapid repeated resets are safe, the page stays
responsive while the worker computes, and the console stays free of errors.
Headless Chrome renders with a software rasteriser here, so frame rates
reported by this script say nothing about real GPUs.
"""
import sys, time, json
from playwright.sync_api import sync_playwright

base = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
chrome = sys.argv[sys.argv.index('--chrome') + 1] if '--chrome' in sys.argv else '/usr/bin/google-chrome'
failures, logs = [], []

def check(cond, msg):
    print(('  ok    ' if cond else '  FAIL  ') + msg)
    if not cond: failures.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=chrome, args=[
        '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'])
    page = b.new_page(viewport={'width': 640, 'height': 360})
    page.on('console', lambda m: logs.append((m.type, m.text)))
    page.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    page.on('requestfailed', lambda r: logs.append(('requestfailed', r.url)))
    ev = page.evaluate
    ready = lambda timeout=120000: page.wait_for_function('window.__ride && window.__ride.app.ready', timeout=timeout)

    print('== load and prepare ==')
    # Watch the main thread while the worker computes: record the longest gap between animation frames.
    page.add_init_script('''window.__gap = 0; (function loop(last){ requestAnimationFrame(function(now){ if (last && !(window.__ride && window.__ride.app.ready)) window.__gap = Math.max(window.__gap, now - last); loop(now); }); })(0);''')
    page.goto(f'{base}/?q=low&seed=11')
    ready()
    check(ev('window.__gap') < 200, f"main thread stayed responsive during preparation (longest frame gap {ev('window.__gap'):.0f} ms)")
    check(not ev('document.getElementById("start").hidden'), 'Play button is offered once the bolt is ready')
    check(ev('window.__ride.audio.ctx') is None, 'no audio context before the user presses Play')

    print('== the leader reaches the ground ==')
    info = ev('''(() => { const b = window.__ride.app.bolt, s = b.stats; const m = b.mainCount;
      return { nodes: s.nodes, main: m, strikeY: b.mainPos[3*(m-1)+1], rootY: b.mainPos[1], cloudBase: b.cloudBaseY,
               minY: Math.min(...Array.from({length: b.nodeCount}, (_, i) => b.wpos[3*i+1])), ground: b.ground.count, stalls: s.stallEvents,
               growths: s.memoryGrowths, ms: s.computeMs }; })()''')
    print('   ', json.dumps(info))
    check(info['strikeY'] == 0 and info['minY'] == 0, 'main channel ends on the ground plane (y = 0)')
    check(info['rootY'] > info['cloudBase'], 'leader starts inside the cloud')
    check(info['ground'] > 50, 'ground discharge pattern was produced from the strike')
    tl = ev('(() => { const r = window.__ride; const a = r.app.timeline.evaluate(r.TIMES.attach - 0.4), z = r.app.timeline.evaluate(r.TIMES.attach + 0.01); return [a.tipIndex, z.tipIndex, r.app.bolt.mainCount, r.app.timeline.events.length]; })()')
    check(tl[1] == tl[2] - 1 and tl[0] < tl[1], f'timeline attaches at the scheduled time ({tl[3]} stepped bursts)')

    print('== transport ==')
    page.click('#start')
    page.wait_for_function('window.__ride.app.playing && window.__ride.app.t > 0.3', timeout=60000)
    check(True, 'Play starts the clock')
    check(ev('window.__ride.audio.ctx && window.__ride.audio.ctx.state') == 'running', 'audio context starts after Play')
    check('gone' in ev('document.getElementById("veil").className'), 'start overlay is dismissed')
    page.click('#play')
    t1 = ev('window.__ride.app.t'); time.sleep(0.6); t2 = ev('window.__ride.app.t')
    check(not ev('window.__ride.app.playing') and t1 == t2, 'Pause freezes the clock')
    page.wait_for_function('window.__ride.audio.ctx.state === "suspended"', timeout=5000)
    check(True, 'Pause suspends audio')
    page.keyboard.press('Space')
    page.wait_for_function(f'window.__ride.app.playing && window.__ride.app.t > {t2}', timeout=60000)
    check(True, 'Space resumes')
    ev('window.__ride.seek(22.5)')
    page.wait_for_function('window.__ride.app.t > 22.6', timeout=60000)
    page.click('#restart')
    page.wait_for_function('window.__ride.app.playing && window.__ride.app.t < 3', timeout=60000)
    check(True, 'Restart returns to the beginning and keeps playing')

    print('== playback through the strike to the end ==')
    ev('window.__ride.seek(21.0)')
    page.wait_for_function('window.__ride.app.t > 21.9', timeout=120000)
    check(ev('window.__ride.state().phase') == 'stroke', 'return stroke phase is reached during playback')
    ev('window.__ride.seek(27.2)')
    page.wait_for_function('!window.__ride.app.playing && window.__ride.app.t >= 28', timeout=120000)
    check(ev('document.getElementById("start-label").textContent') == 'Replay', 'end of the shot offers Replay')
    page.click('#start')
    page.wait_for_function('window.__ride.app.playing && window.__ride.app.t < 3', timeout=60000)
    check(True, 'Replay restarts')

    print('== seed and quality ==')
    h1 = ev('Array.from(window.__ride.app.bolt.mainPos.slice(-30)).join()')
    page.fill('#seed', '12345'); page.press('#seed', 'Enter')
    page.wait_for_function('window.__ride.app.ready && window.__ride.app.bolt.seed === 12345', timeout=120000)
    h2 = ev('Array.from(window.__ride.app.bolt.mainPos.slice(-30)).join()')
    check(h1 != h2, 'a new seed grows a different bolt')
    check(ev('window.__ride.app.playing'), 'changing the seed after Play goes straight back into playback')
    page.fill('#seed', '11'); page.press('#seed', 'Enter')
    page.wait_for_function('window.__ride.app.ready && window.__ride.app.bolt.seed === 11', timeout=120000)
    check(ev('Array.from(window.__ride.app.bolt.mainPos.slice(-30)).join()') == h1, 'the same seed grows the same bolt again')
    page.select_option('#quality', 'medium')
    page.wait_for_function('window.__ride.app.ready && window.__ride.app.bolt.stats.ny === 128', timeout=120000)
    check(ev('window.__ride.renderer.qualityKey') == 'medium', 'quality switch rebuilds the scene and re-runs the simulation on the finer grid')
    page.select_option('#quality', 'low')
    page.wait_for_function('window.__ride.app.ready && window.__ride.app.bolt.stats.ny === 96', timeout=120000)

    print('== repeated resets ==')
    for i in range(25):   # hammer the button faster than the worker can finish
        page.click('#reseed'); time.sleep(0.03)
    page.wait_for_function('window.__ride.app.ready', timeout=120000)
    time.sleep(0.5)
    check(ev('window.__ride.app.ready && window.__ride.app.bolt.seed === Number(document.getElementById("seed").value)'), '25 rapid reseeds settle on the last requested seed')
    mem = []
    for i in range(12):
        ev(f'(window.__ride.app.seed = {100 + i}, window.__ride.prepare())')
        page.wait_for_function(f'window.__ride.app.ready && window.__ride.app.bolt.seed === {100 + i}', timeout=120000)
        mem.append(ev('window.__ride.app.bolt.stats.memoryBytes'))
    check(len(set(mem[4:])) == 1, f'wasm memory is stable across further resets ({mem[-1] / 1048576:.1f} MB)')
    for i in range(6):
        page.click('#restart'); time.sleep(0.05)
    page.wait_for_function('window.__ride.app.playing', timeout=20000)
    check(True, 'repeated Restart presses are safe')
    page.click('#mute'); check(ev('window.__ride.audio.muted'), 'mute toggles')

    print('== console ==')
    errors = [l for l in logs if l[0] in ('error', 'pageerror', 'requestfailed')]
    apperr = ev('window.__ride.app.errors')
    check(not errors and not apperr, f'no console errors, failed requests, or uncaught exceptions ({len(logs)} console messages in total)')
    for l in errors + [('app', e) for e in apperr]: print('     ', l)
    other = sorted(set(t for t, m in logs if t not in ('error', 'pageerror', 'requestfailed')))
    for t, m in logs:
        if t not in ('error', 'pageerror', 'requestfailed'): print(f'    [{t}] {m[:150]}')
    fps = ev('''new Promise(res => { const r = window.__ride; if (!r.app.playing) r.play(8); const f0 = r.app.frames, t0 = performance.now(); setTimeout(() => res((r.app.frames - f0) / ((performance.now() - t0) / 1000)), 3000); })''')
    print(f'    software-rendered frame rate at 640x360, low quality: {fps:.1f} fps')
    b.close()

print('\nFAILED: ' + '; '.join(failures) if failures else '\nall browser checks passed')
sys.exit(1 if failures else 0)
