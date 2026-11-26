const Input = {
  x: 0, jump: false, jumpEdge: false, run: false, spark: false, sparkEdge: false, down: false, up: false,
  padOn: false, keys: {}, prevBtn: [],
  st: { x: 0, y: 0 },
  init() {
    if (IS_TOUCH) document.body.classList.add('touch');
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    this.initTouch();
  },
  kbUsed() { if (this.padOn) { this.padOn = false; document.body.classList.remove('gp'); } },
  key(e, on) {
    const k = e.key;
    this.keys[k] = on;
    if (on && (k === 'p' || k === 'P' || k === 'Escape')) { UI.togglePause(); e.preventDefault(); return; }
    if (on && (k === 'm' || k === 'M')) { UI.toggleMute(); return; }
    if (k === ' ' || k === 'z' || k === 'Z' || k === 'w' || k === 'W' || k === 'ArrowUp') {
      if (on && !this.jump) this.jumpEdge = true;
      if (k === ' ' || k === 'z' || k === 'Z' || k === 'ArrowUp') this.jump = on;
      if (k === 'w' || k === 'W' || k === 'ArrowUp') this.up = on;
      e.preventDefault(); this.kbUsed(); return;
    }
    if (k === 'j' || k === 'J' || k === 'k' || k === 'K' || k === 'Control') {
      if (on && !this.spark) this.sparkEdge = true;
      this.spark = on; e.preventDefault(); this.kbUsed(); return;
    }
    if (k === 'Shift') { this.run = on; e.preventDefault(); this.kbUsed(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'a', 'A', 'd', 'D', 's', 'S'].includes(k)) e.preventDefault();
    this.kbUsed();
  },
  initTouch() {
    const pad = $('pad'), knob = $('padKnob'), zone = $('stickZone');
    let id = null, cx = 0, cy = 0; const rad = 56;
    const set = (px, py) => {
      let dx = (px - cx) / rad, dy = (py - cy) / rad;
      const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
      const mm = Math.hypot(dx, dy); const k = mm < 0.12 ? 0 : (mm - 0.12) / 0.88 / (mm || 1);
      this.st.x = dx * k; this.st.y = -dy * k;
      knob.style.transform = 'translate(' + (dx * 34).toFixed(1) + 'px,' + (dy * 34).toFixed(1) + 'px)';
    };
    zone.addEventListener('touchstart', (e) => {
      Snd.init(); if (id != null) return;
      const t = e.changedTouches[0]; e.preventDefault(); id = t.identifier;
      const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      if (Math.hypot(t.clientX - cx, t.clientY - cy) > 90) {
        cx = t.clientX; cy = t.clientY;
        pad.style.left = (cx - 60) + 'px'; pad.style.top = (cy - 60) + 'px'; pad.style.bottom = 'auto';
      }
      pad.classList.add('show'); set(t.clientX, t.clientY);
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) { e.preventDefault(); set(t.clientX, t.clientY); }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === id) {
        id = null; this.st.x = this.st.y = 0; knob.style.transform = '';
        pad.classList.remove('show'); pad.style.left = ''; pad.style.top = ''; pad.style.bottom = '';
      }
    };
    window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    const hold = (btn, prop, edgeProp, flag) => {
      const dn = (e) => { e.preventDefault(); Snd.init(); if (edgeProp && !this[prop]) this[edgeProp] = true; this[prop] = true; if (flag) this[flag] = true; btn.classList.add('on'); };
      const up = (e) => { if (e) e.preventDefault(); this[prop] = false; if (flag) this[flag] = false; btn.classList.remove('on'); };
      btn.addEventListener('touchstart', dn, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up);
      btn.addEventListener('mousedown', dn);
      window.addEventListener('mouseup', () => { if (this[prop] && btn.classList.contains('on')) up(); });
    };
    hold($('jumpBtn'), 'jump', 'jumpEdge', '_touchJump');
    hold($('runBtn'), 'run', null, '_touchRun');
    hold($('sparkBtn'), 'spark', 'sparkEdge', '_touchSpark');
  },
  poll() {
    const k = this.keys;
    let kx = 0, ky = 0;
    if (k.ArrowLeft || k.a || k.A) kx -= 1;
    if (k.ArrowRight || k.d || k.D) kx += 1;
    if (k.ArrowDown || k.s || k.S) { ky -= 1; this.down = true; } else this.down = this.down && this.st.y < -0.5;
    // gamepad
    let gx = 0, gy = 0, runPad = false, jumpPad = false, sparkPad = false;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const B = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const prev = this.prevBtn;
      let ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (Math.hypot(ax, ay) < 0.2) { ax = 0; ay = 0; }
      if (B(14)) ax = -1; if (B(15)) ax = 1; if (B(12)) ay = -1; if (B(13)) ay = 1;
      gx = ax; gy = -ay;
      const any = p.buttons.some((b) => b.pressed) || ax || ay;
      if (any && !this.padOn) { this.padOn = true; document.body.classList.add('gp'); }
      const edge = (i) => B(i) && !prev[i];
      if (edge(0)) this.jumpEdge = true;
      jumpPad = B(0);
      runPad = B(1) || B(5) || B(7);
      if (edge(2) || edge(3)) this.sparkEdge = true;
      sparkPad = B(2) || B(3);
      if (ay > 0.55 || B(13)) this.down = true;
      if (ay < -0.55 || B(12)) this.up = true;
      if (edge(9) || edge(8)) UI.togglePause();
      this.prevBtn = p.buttons.map((b) => b.pressed);
      break;
    }
    this.run = !!(k.Shift || this._touchRun || runPad);
    this.jump = !!(this.keys[' '] || k.z || k.Z || this._touchJump || jumpPad);
    this.spark = !!(k.j || k.J || k.k || k.K || k.Control || this._touchSpark || sparkPad);
    if (this.st.y < -0.55) this.down = true;
    if (this.st.y > 0.55) this.up = true;
    let x = kx + this.st.x + gx;
    if (this.botX != null) x = this.botX;
    if (this.botRun) this.run = true;
    if (this.botJump) { if (!this.jump) this.jumpEdge = true; this.jump = true; }
    x = clamp(x, -1, 1);
    this.x = x;
  },
  endFrame() { this.jumpEdge = false; this.sparkEdge = false; }
};
