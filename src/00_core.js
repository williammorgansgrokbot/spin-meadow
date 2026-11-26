const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('sm_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('sm_' + k, JSON.stringify(v)); } catch (e) {} }
};
const AS = window.__ASSETS || {};
const IS_TOUCH = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M4 9v6h3.2L12 19V5L7.2 9H4zm11.5 3a3.5 3.5 0 0 0-1.8-3v6a3.5 3.5 0 0 0 1.8-3z"/><path d="M15.7 6.1a7 7 0 0 1 0 11.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9v6h3.2L12 19V5L7.2 9H4z"/><path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>';

const R = 26;
const STEP = 1 / 120;
const WALK_MAX = 6.4;
const RUN_MAX = 10.2;
const ACCEL = 48;
const DECEL = 64;
const AIR_ACCEL = 32;
const GRAV = 64;
const JUMP_V = 16.6;
const JUMP_CUT = 0.48;
const COYOTE = 0.09;
const BUFFER = 0.1;
const STOMP_V = 9.2;
const MAX_FALL = 24;
const WREN_W = 0.62;
const WREN_H = 1.48;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function now() { return performance.now() / 1000; }

function polar(s, y) {
  const a = s / R;
  const rr = R + y;
  return { x: Math.sin(a) * rr, y: Math.cos(a) * rr, z: 0, a };
}

function loadTex(name, opts) {
  opts = opts || {};
  return new Promise((res, rej) => {
    const data = AS[name];
    if (!data) { console.warn('missing asset', name); rej(new Error(name)); return; }
    const im = new Image();
    im.onload = () => {
      const t = new THREE.Texture(im);
      t.needsUpdate = true;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
      if (opts.repeat) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(opts.repeat, opts.repeat);
      }
      t._w = im.width; t._h = im.height; t._name = name;
      res(t);
    };
    im.onerror = () => rej(new Error('tex ' + name));
    im.src = data;
  });
}

function spriteMesh(tex, height, anchor) {
  const asp = (tex._w || tex.image.width) / (tex._h || tex.image.height);
  const w = height * asp;
  const geo = new THREE.PlaneGeometry(w, height);
  if (anchor === 'feet') geo.translate(0, height / 2, 0);
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, alphaTest: 0.2, side: THREE.DoubleSide
  });
  const m = new THREE.Mesh(geo, mat);
  m._h = height; m._w = w;
  return m;
}

function cubeMesh(mats, sx, sy, sz) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mats);
  return m;
}
