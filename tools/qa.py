#!/usr/bin/env python3
"""Playwright checks: iPhone layout, world-spin direction, and a short gameplay recording."""
import http.server, socketserver, threading, time, os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'screens'
OUT.mkdir(exist_ok=True)
PORT = 8788
ERRORS = []

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(ROOT), **k)
    def log_message(self, fmt, *args):
        pass

def start_server():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(('127.0.0.1', PORT), Handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd

SIZES = [(844, 390), (932, 430), (667, 375)]
URL = f'http://127.0.0.1:{PORT}/index.html'

# Per-course start points on long ground, with room to run either way
# without falling into a gap (enemies and beacons are muted by __SPIN.qa).
# Right and left can use different starts so each hold stays on one platform.
CASES = [
    # course, dir, start_s
    (0,  1, 42.0),   # 1-1 ground 39.2–62, plats now walkable
    (0, -1, 56.0),
    (1,  1, 36.3),   # 1-2 after chimney at 35.4, ground to 48
    (1, -1, 46.0),
    (2,  1, 33.8),   # 1-3 after chimney, ground to 44
    (2, -1, 42.0),
]

def attach(page):
    errs = []
    page.on('console', lambda msg: errs.append(('console', msg.type, msg.text)) if msg.type in ('error',) else None)
    page.on('pageerror', lambda exc: errs.append(('pageerror', str(exc))) or None)
    return errs

def no_clip(page, selectors):
    vw = page.viewport_size['width']; vh = page.viewport_size['height']
    issues = []
    for sel in selectors:
        for el in page.query_selector_all(sel):
            if not el.is_visible():
                continue
            box = el.bounding_box()
            if not box:
                continue
            if box['x'] < -1 or box['y'] < -1 or box['x'] + box['width'] > vw + 1 or box['y'] + box['height'] > vh + 1:
                issues.append((sel, box))
    return issues

def hold_dir(page, course, start_s, direction, seconds=3.2):
    page.evaluate(f'() => window.__SPIN.start({course})')
    page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
    page.evaluate(f'''() => {{
      window.__SPIN.qa(true, {{ speed: 3.2, hideEnemies: true }});
      window.__SPIN.place({start_s}, 1.02);
      const I = window.__SPIN.input;
      I.botX = 0; I.botRun = false; I.botJump = false;
    }}''')
    page.wait_for_timeout(280)
    before = page.evaluate('() => window.__SPIN.probe()')
    page.evaluate(f'() => {{ const I = window.__SPIN.input; I.botX = {direction}; I.botRun = false; }}')
    samples = []
    t0 = time.time()
    while time.time() - t0 < seconds:
        page.wait_for_timeout(120)
        samples.append(page.evaluate('() => window.__SPIN.probe()'))
    page.evaluate('() => { const I = window.__SPIN.input; I.botX = 0; I.botRun = false; }')
    after = page.evaluate('() => window.__SPIN.probe()')
    return before, samples, after

def check_hold(course, direction, before, samples, after):
    issues = []
    name = f'course {course} {"right" if direction > 0 else "left"}'
    if after['mode'] != 'play':
        issues.append(f'{name}: mode became {after["mode"]}')
    if after['y'] < 0.4:
        issues.append(f'{name}: fell, y={after["y"]:.2f}')
    if not after.get('on') and after['y'] < 0.8:
        issues.append(f'{name}: not on ground, y={after["y"]:.2f} on={after.get("on")}')
    ds = after['s'] - before['s']
    drot = after['worldRotZ'] - before['worldRotZ']
    if direction > 0:
        if ds < 4:
            issues.append(f'{name}: expected s to increase, ds={ds:.2f}')
        if drot <= 0.05:
            issues.append(f'{name}: world rotation should increase when running right, drot={drot:.4f}')
    else:
        if ds > -4:
            issues.append(f'{name}: expected s to decrease, ds={ds:.2f}')
        if drot >= -0.05:
            issues.append(f'{name}: world rotation should decrease when running left, drot={drot:.4f}')
    for i, sm in enumerate([before] + samples + [after]):
        rot_err = abs(sm['worldRotZ'] - sm['expectedRotZ'])
        if rot_err > 0.02:
            issues.append(f'{name} sample {i}: rot sign/value mismatch got {sm["worldRotZ"]:.4f} expected {sm["expectedRotZ"]:.4f}')
        if sm['sx'] < 0.28 or sm['sx'] > 0.72:
            issues.append(f'{name} sample {i}: Wren not centered horizontally, sx={sm["sx"]:.3f}')
        if sm['sy'] < 0.16 or sm['sy'] > 0.80:
            issues.append(f'{name} sample {i}: Wren left the vertical frame, sy={sm["sy"]:.3f} y={sm["y"]:.2f}')
        if sm['mode'] != 'play':
            issues.append(f'{name} sample {i}: mode={sm["mode"]}')
        if abs(sm['world']['x']) > 3.5:
            issues.append(f'{name} sample {i}: Wren world x drifted off the top of the ring, x={sm["world"]["x"]:.2f}')
        if sm['y'] < -1:
            issues.append(f'{name} sample {i}: fell off, y={sm["y"]:.2f}')
    return issues, {
        'course': course, 'dir': direction,
        'ds': ds, 'drot': drot,
        'before': {k: before[k] for k in ('s', 'y', 'on', 'sx', 'sy', 'worldRotZ')},
        'after': {k: after[k] for k in ('s', 'y', 'on', 'sx', 'sy', 'worldRotZ', 'mode')},
        'samples': len(samples),
        'issues': issues,
    }

def main():
    httpd = start_server()
    time.sleep(0.25)
    results = []
    fail_msgs = []
    video_path = None
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            tag = f'{w}x{h}'
            context = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2)
            page = context.new_page()
            errs = attach(page)
            page.goto(URL, wait_until='load', timeout=60000)
            page.wait_for_function('() => window.__SPIN && window.__SPIN.state', timeout=30000)
            page.wait_for_timeout(500)
            page.screenshot(path=str(OUT / f'title-{tag}.png'))
            clip = no_clip(page, ['#btnPlay', '#btnMuteTitle', '.perks', '#titleBg'])
            results.append({'size': tag, 'stage': 'title', 'errors': list(errs), 'clip': clip})
            page.click('#btnPlay')
            page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
            page.wait_for_timeout(700)
            page.screenshot(path=str(OUT / f'play-{tag}.png'))
            clip2 = no_clip(page, ['#topLeft', '#topRight', '#jumpBtn', '#runBtn', '#btnPause', '#btnMute'])
            results.append({'size': tag, 'stage': 'play', 'errors': list(errs), 'clip': clip2})
            context.close()

        # Portrait rotate overlay
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errs = attach(page)
        page.goto(URL, wait_until='load', timeout=60000)
        page.wait_for_timeout(700)
        page.evaluate("document.body.classList.add('touch')")
        page.wait_for_timeout(200)
        vis = page.evaluate("() => getComputedStyle(document.getElementById('rotate')).display")
        page.screenshot(path=str(OUT / 'portrait-rotate.png'))
        results.append({'size': '390x844', 'stage': 'rotate', 'errors': list(errs), 'rotate_display': vis})
        context.close()

        # Real spin-direction checks on all three courses, both ways
        context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2)
        page = context.new_page()
        errs = attach(page)
        page.goto(URL, wait_until='load', timeout=60000)
        page.wait_for_function('() => window.__SPIN && window.__SPIN.probe', timeout=30000)

        for course, direction, start_s in CASES:
            if True:
                before, samples, after = hold_dir(page, course, start_s, direction, seconds=3.0)
                issues, rec = check_hold(course, direction, before, samples, after)
                results.append({'size': '844x390', 'stage': f'spin-{course}-{"R" if direction>0 else "L"}', 'errors': list(errs), 'spin': rec})
                fail_msgs.extend(issues)
                if issues:
                    page.screenshot(path=str(OUT / f'spin-fail-{course}-{"R" if direction>0 else "L"}.png'))
                else:
                    page.screenshot(path=str(OUT / f'spin-ok-{course}-{"R" if direction>0 else "L"}.png'))

        # Also: from spawn on 1-1, hold right for a second (before the first gap)
        page.evaluate('() => { window.__SPIN.start(0); window.__SPIN.qa(true); }')
        page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
        page.wait_for_timeout(200)
        page.evaluate('() => { const I = window.__SPIN.input; I.botX = 1; I.botRun = false; }')
        page.wait_for_timeout(1100)
        spawn = page.evaluate('() => window.__SPIN.probe()')
        page.evaluate('() => { window.__SPIN.input.botX = 0; }')
        spawn_issues = []
        if spawn['mode'] != 'play' or spawn['y'] < 0.4:
            spawn_issues.append(f'spawn right: fell/mode={spawn["mode"]} y={spawn["y"]}')
        if spawn['s'] < 4:
            spawn_issues.append(f'spawn right: did not advance, s={spawn["s"]}')
        if spawn['worldRotZ'] <= 0.05:
            spawn_issues.append(f'spawn right: rotation did not go positive, rot={spawn["worldRotZ"]}')
        if spawn['sx'] < 0.28 or spawn['sx'] > 0.72:
            spawn_issues.append(f'spawn right: not centered, sx={spawn["sx"]}')
        if abs(spawn['world']['x']) > 3.5:
            spawn_issues.append(f'spawn right: world x drift {spawn["world"]["x"]}')
        fail_msgs.extend(spawn_issues)
        page.screenshot(path=str(OUT / 'spin-spawn-right.png'))
        results.append({'size': '844x390', 'stage': 'spin-spawn-right', 'errors': list(errs), 'probe': spawn, 'issues': spawn_issues})

        # High jump: Wren must stay in frame
        page.evaluate('() => { window.__SPIN.start(0); window.__SPIN.qa(true, { hideEnemies: true }); window.__SPIN.place(8, 1.02); }')
        page.wait_for_timeout(200)
        page.evaluate('() => { const I = window.__SPIN.input; I.botX = 0; I.botJump = true; }')
        apex = None
        for _ in range(22):
            page.wait_for_timeout(30)
            pr = page.evaluate('() => window.__SPIN.probe()')
            if apex is None or pr['y'] > apex['y']:
                apex = pr
            if apex and apex['y'] > 2.0 and pr.get('vy') is not None and pr['vy'] < 0:
                break
        page.evaluate('() => { window.__SPIN.input.botJump = false; }')
        jump_issues = []
        if not apex or apex['y'] < 2.0:
            jump_issues.append(f'high jump did not leave the ground, apex={apex}')
        if apex and (apex['sy'] < 0.08 or apex['sy'] > 0.85):
            jump_issues.append(f'high jump left the frame, apex y={apex["y"]} sy={apex["sy"]}')
        if apex and (apex['sx'] < 0.22 or apex['sx'] > 0.78):
            jump_issues.append(f'high jump not centered, sx={apex["sx"]}')
        fail_msgs.extend(jump_issues)
        page.screenshot(path=str(OUT / 'spin-jump.png'))
        results.append({'size': '844x390', 'stage': 'spin-jump', 'errors': list(errs), 'apex': apex, 'issues': jump_issues})
        context.close()

        # Gameplay recording of course 1 running right
        context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, record_video_dir=str(OUT / 'video'), record_video_size={'width': 844, 'height': 390})
        page = context.new_page()
        errs = attach(page)
        page.goto(URL, wait_until='load', timeout=60000)
        page.wait_for_function('() => window.__SPIN && window.__SPIN.state', timeout=30000)
        page.evaluate('() => { window.__SPIN.start(0); window.__SPIN.qa(false); window.__SPIN.invuln(true); }')
        page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
        page.evaluate("""() => {
          const I = window.__SPIN.input; I.botX = 1; I.botRun = true;
          window.__jumps = {};
          window.__bot = setInterval(() => {
            const st = window.__SPIN.state();
            if (st.mode !== 'play') return;
            I.botX = 1; I.botRun = true;
            const marks = [15.05, 21.3, 34.7, 42.7, 50.4];
            for (const m of marks) {
              if (st.s >= m && st.s < m + 0.55 && !window.__jumps[m]) {
                window.__jumps[m] = 1;
                I.botJump = true;
                setTimeout(() => { I.botJump = false; }, 450);
              }
            }
          }, 20);
        }""")
        last_shot = 0
        t0 = time.time()
        while time.time() - t0 < 16:
            st = page.evaluate('() => window.__SPIN.state()')
            if st['mode'] in ('clear', 'lose'):
                page.wait_for_timeout(800)
                break
            if time.time() - last_shot > 1.6:
                page.screenshot(path=str(OUT / f'gameplay-{int(time.time()-t0):02d}.png'))
                last_shot = time.time()
            page.wait_for_timeout(80)
        page.evaluate('() => { if (window.__bot) clearInterval(window.__bot); const I = window.__SPIN && window.__SPIN.input; if (I) { I.botX = null; I.botRun = false; I.botJump = false; } }')
        page.screenshot(path=str(OUT / 'gameplay-end.png'))
        results.append({'size': '844x390', 'stage': 'demo', 'errors': list(errs), 'final': page.evaluate('() => window.__SPIN.state()')})
        video_path = page.video.path() if page.video else None
        context.close()
        browser.close()

    httpd.shutdown()
    bad = False
    print(json.dumps(results, indent=2, default=str))
    for r in results:
        if r.get('errors'):
            print('ERRORS at', r['size'], r['stage'], r['errors'])
            bad = True
        if r.get('clip'):
            print('CLIP at', r['size'], r['stage'], r['clip'])
            bad = True
    if fail_msgs:
        print('SPIN_FAIL')
        for m in fail_msgs:
            print(' -', m)
        bad = True
    else:
        print('SPIN_OK all hold-left/hold-right checks passed on courses 0,1,2')
    if video_path:
        print('VIDEO_RAW', video_path)
    print('screens', list(OUT.glob('*.png')))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
