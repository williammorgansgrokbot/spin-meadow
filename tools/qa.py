#!/usr/bin/env python3
"""Playwright checks at iPhone landscape sizes, screenshots, and a short gameplay recording."""
import http.server, socketserver, threading, time, os, sys, json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'screens'
OUT.mkdir(exist_ok=True)
PORT = 8775
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

def main():
    httpd = start_server()
    time.sleep(0.2)
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            tag = f'{w}x{h}'
            context = browser.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2)
            # Simulate a 47px safe-area inset on the smallest iPhone size
            page = context.new_page()
            errs = attach(page)
            page.goto(URL, wait_until='load', timeout=60000)
            page.wait_for_function('() => window.__SPIN && window.__SPIN.state', timeout=30000)
            page.wait_for_timeout(600)
            page.screenshot(path=str(OUT / f'title-{tag}.png'))
            clip = no_clip(page, ['#btnPlay', '#btnMuteTitle', '.perks', '#titleBg'])
            results.append({'size': tag, 'stage': 'title', 'errors': list(errs), 'clip': clip})
            # start game
            page.click('#btnPlay')
            page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
            page.wait_for_timeout(800)
            page.screenshot(path=str(OUT / f'play-{tag}.png'))
            clip2 = no_clip(page, ['#topLeft', '#topRight', '#jumpBtn', '#runBtn', '#btnPause', '#btnMute'])
            results.append({'size': tag, 'stage': 'play', 'errors': list(errs), 'clip': clip2})
            context.close()

        # Portrait rotate overlay
        context = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        errs = attach(page)
        page.goto(URL, wait_until='load', timeout=60000)
        page.wait_for_timeout(800)
        page.evaluate("document.body.classList.add('touch')")
        page.wait_for_timeout(200)
        vis = page.evaluate("() => getComputedStyle(document.getElementById('rotate')).display")
        page.screenshot(path=str(OUT / 'portrait-rotate.png'))
        results.append({'size': '390x844', 'stage': 'rotate', 'errors': list(errs), 'rotate_display': vis})
        context.close()

        # Gameplay recording of course 1 with a simple auto-runner
        context = browser.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, record_video_dir=str(OUT / 'video'), record_video_size={'width': 844, 'height': 390})
        page = context.new_page()
        errs = attach(page)
        page.goto(URL, wait_until='load', timeout=60000)
        page.wait_for_function('() => window.__SPIN && window.__SPIN.state', timeout=30000)
        page.evaluate('() => window.__SPIN.start(0)')
        page.wait_for_function('() => window.__SPIN.state().mode === "play"', timeout=10000)
        page.wait_for_timeout(500)
        page.evaluate("""() => {
          window.__jumps = {};
          window.__bot = setInterval(() => {
            const st = window.__SPIN.state();
            if (st.mode !== 'play') return;
            const I = window.__SPIN.input; I.botX = 1; I.botRun = true;
            const marks = [15.3, 21.4, 34.8, 42.8, 50.5];
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
        while time.time() - t0 < 22:
            st = page.evaluate('() => window.__SPIN.state()')
            if st['mode'] in ('clear', 'lose'):
                page.wait_for_timeout(800)
                break
            if time.time() - last_shot > 1.8:
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
    # report
    bad = False
    print(json.dumps(results, indent=2, default=str))
    for r in results:
        if r.get('errors'):
            print('ERRORS at', r['size'], r['stage'], r['errors'])
            bad = True
        if r.get('clip'):
            print('CLIP at', r['size'], r['stage'], r['clip'])
            # clipping of HUD at 47px may be acceptable if very slight; still flag
            bad = True
    if video_path:
        print('VIDEO_RAW', video_path)
    print('screens', list(OUT.glob('*.png')))
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
