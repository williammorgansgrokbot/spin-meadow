const Snd = (() => {
  let ctx = null, master = null, musicG = null, sfxG = null, muted = store.get('muted', false);
  let timer = null, nextT = 0, step = 0, started = false;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ctx = new AC();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 120; hp.Q.value = 0.7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.18;
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    hp.connect(comp); comp.connect(master); master.connect(ctx.destination);
    musicG = ctx.createGain(); musicG.gain.value = 0.42; musicG.connect(hp);
    sfxG = ctx.createGain(); sfxG.gain.value = 0.95; sfxG.connect(hp);
    started = true;
  }
  function tone(type, f, t, dur, vol, o) {
    if (!ctx) return;
    o = o || {}; const osc = ctx.createOscillator(); osc.type = type; osc.frequency.setValueAtTime(Math.max(30, f), t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + dur);
    const g = ctx.createGain(); const a = o.a || 0.006;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let last = osc;
    if (o.lp) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(o.lp, t); if (o.lp2) lp.frequency.exponentialRampToValueAtTime(o.lp2, t + dur); osc.connect(lp); last = lp; }
    last.connect(g); g.connect(o.dest || musicG);
    osc.start(t); osc.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, type, f1, f2) {
    if (!ctx) return;
    const n = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur + 8), ctx.sampleRate);
    const d = n.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource(); s.buffer = n;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(f1, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxG); s.start(t); s.stop(t + dur + 0.05);
  }
  // Original meadow tune in G major. Bass stays at G3 (196 Hz) and above, well over the 120 Hz high-pass.
  // A gentle plucked ostinato — not a borrowed hook.
  const bass = [0, -1, 7, -1, 4, -1, 7, -1, 0, -1, 9, -1, 5, -1, 7, -1];
  const mel  = [74, -1, 71, 69, -1, 71, 74, -1, 76, -1, 74, 71, 69, -1, 67, 69, 71, -1, 74, 76, -1, 74, 71, -1, 69, 67, 64, 67, 69, -1, 71, -1];
  function sched(st, t) {
    const root = 67, sp = st & 15;
    if (sp % 4 === 0) { tone('triangle', 196, t, 0.1, 0.22, { f2: 160, a: 0.001, dest: musicG }); noise(t, 0.025, 0.05, 'highpass', 2800); }
    if (sp === 8) noise(t, 0.08, 0.1, 'bandpass', 1600, 900);
    const b = bass[sp];
    if (b >= 0) tone('triangle', mtof(root + b), t, 0.2, 0.14, { lp: 1100, lp2: 500, dest: musicG });
    if (sp === 0 || sp === 8) [0, 4, 7].forEach((iv) => tone('sine', mtof(root + iv), t, 0.28, 0.035, { lp: 1800 }));
    const m = mel[st & 31];
    if (m > 0) tone('triangle', mtof(m), t, 0.24, 0.09, { lp: 2600, a: 0.012 });
  }
  function tick() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.14) { sched(step, nextT); nextT += 60 / 112 / 4; step = (step + 1) % 64; }
  }
  function startMusic() {
    init(); if (!ctx) return;
    step = 0; nextT = ctx.currentTime + 0.06;
    if (timer) clearInterval(timer); timer = setInterval(tick, 28); tick();
  }
  function stopMusic() { if (timer) { clearInterval(timer); timer = null; } }
  const ok = () => ctx && started && !muted;
  const A = {
    init, startMusic, stopMusic,
    get muted() { return muted; },
    setMuted(v) { muted = !!v; store.set('muted', muted); if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx ? ctx.currentTime : 0, 0.03); },
    jump() { if (!ok()) return; const t = ctx.currentTime; tone('square', 520, t, 0.12, 0.12, { f2: 880, lp: 2400, dest: sfxG, a: 0.002 }); },
    land() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.06, 0.16, 'lowpass', 900, 300); tone('triangle', 180, t, 0.08, 0.1, { f2: 90, dest: sfxG }); },
    penny() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 880, t, 0.08, 0.16, { dest: sfxG }); tone('sine', 1320, t + 0.06, 0.12, 0.12, { dest: sfxG }); },
    bump() { if (!ok()) return; const t = ctx.currentTime; tone('square', 200, t, 0.07, 0.12, { f2: 140, lp: 800, dest: sfxG }); },
    brk() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.14, 0.28, 'bandpass', 1400, 500); tone('triangle', 240, t, 0.1, 0.1, { f2: 80, dest: sfxG }); },
    stomp() { if (!ok()) return; const t = ctx.currentTime; noise(t, 0.1, 0.22, 'lowpass', 700, 200); tone('square', 160, t, 0.08, 0.1, { dest: sfxG }); },
    power() { if (!ok()) return; const t = ctx.currentTime; [523, 659, 784, 1046].forEach((f, i) => tone('sine', f, t + i * 0.06, 0.16, 0.12, { dest: sfxG })); },
    hurt() { if (!ok()) return; const t = ctx.currentTime; tone('sawtooth', 320, t, 0.22, 0.16, { f2: 90, lp: 1200, dest: sfxG }); noise(t, 0.16, 0.18, 'bandpass', 900, 200); },
    spark() { if (!ok()) return; const t = ctx.currentTime; tone('sawtooth', 900, t, 0.12, 0.12, { f2: 1600, lp: 3000, dest: sfxG }); noise(t, 0.08, 0.12, 'highpass', 2500); },
    beacon() { if (!ok()) return; const t = ctx.currentTime; [392, 494, 587, 784].forEach((f, i) => tone('sine', f, t + i * 0.1, 0.28, 0.14, { dest: sfxG })); },
    click() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 660, t, 0.06, 0.08, { dest: sfxG }); },
    flush() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
  return A;
})();
