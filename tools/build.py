#!/usr/bin/env python3
"""Build standalone index.html: Three.js r160 + game + PNG/JPEG art inlined."""
import base64, os, re, json
D = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + '/'
A = {}
for n in sorted(os.listdir(D + 'art')):
    if n.endswith(('.png', '.jpg', '.jpeg')):
        path = D + 'art/' + n
        mime = 'image/jpeg' if n.endswith(('.jpg', '.jpeg')) else 'image/png'
        A[n] = 'data:%s;base64,' % mime + base64.b64encode(open(path, 'rb').read()).decode()
three = open(D + 'tools/three.module.min.js').read()
m = re.search(r'export\{([^}]*)\};?\s*$', three)
assert m, 'could not wrap three.module.min.js'
pairs = []
for part in m.group(1).split(','):
    a = part.strip().split(' as ')
    pairs.append('%s:%s' % ((a[1].strip() if len(a) > 1 else a[0].strip()), a[0].strip()))
three_js = 'const THREE=(()=>{"use strict";' + three[:m.start()] + ';return Object.freeze({' + ','.join(pairs) + '});})();'
order = ['00_core', '10_audio', '20_input', '25_levels', '30_game']
game = '\n'.join(open(D + 'src/%s.js' % n).read() for n in order)
body = ('(function(){"use strict";\n' + three_js + '\n' + game + '\n})();').replace('</script', '<\\/script')
html = open(D + 'src/template.html').read().replace('/*CSS*/', open(D + 'src/style.css').read())
html = html.replace('<script>/*SCRIPT*/</script>', '<script>window.__ASSETS=' + json.dumps(A) + ';</script>\n<script>\n' + body + '\n</script>')
open(D + 'index.html', 'w').write(html)
print('index.html', round(os.path.getsize(D + 'index.html') / 1e6, 2), 'MB')
