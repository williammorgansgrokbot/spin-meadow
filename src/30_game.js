const TEX = {};
const Game = {
  mode: 'title', // title, play, pause, clear, lose
  course: 0,
  L: null,
  pennies: 0,
  totalPennies: 0,
  hp: 1,
  maxHp: 2,
  invuln: 0,
  orb: 0,
  bannerT: 0,
  world: null,
  planet: null,
  camLead: 0,
  camY: 1,
  qa: false,
  qaSpeed: 0,
  fx: [],
  bolts: [],
  ready: false
};

const Player = {
  s: 2.5, y: 1, vs: 0, vy: 0, face: 1, on: false, coyote: 0, buffer: 0, jumping: false,
  anim: 'idle', frame: 0, t: 0, node: null, spr: null
};

let renderer, scene, camera, worldGroup, skyTex;
let lastT = 0, acc = 0, raf = 0;

const UI = {
  togglePause() {
    if (Game.mode === 'play') this.pause();
    else if (Game.mode === 'pause') this.resume();
  },
  toggleMute() {
    Snd.init(); Snd.setMuted(!Snd.muted); this.refreshMute(); Snd.click();
  },
  refreshMute() {
    const h = Snd.muted ? ICON_OFF : ICON_ON;
    ['btnMute', 'btnMuteTitle'].forEach((id) => { if ($(id)) $(id).innerHTML = h; });
  },
  pause() {
    if (Game.mode !== 'play') return;
    Game.mode = 'pause';
    document.body.classList.add('pause');
    $('pause').classList.add('show');
    Snd.click();
  },
  resume() {
    if (Game.mode !== 'pause') return;
    Game.mode = 'play';
    document.body.classList.remove('pause');
    $('pause').classList.remove('show');
    Snd.click();
  },
  hud() {
    $('courseNum').textContent = Game.L ? Game.L.name : '1-1';
    $('pennyNum').textContent = String(Game.pennies);
    $('heartNum').textContent = String(Game.hp);
    const sp = $('sparkBtn');
    if (sp) sp.classList.toggle('hidden', Game.orb <= 0);
  },
  banner(text, dur) {
    const b = $('banner'); b.textContent = text; b.classList.add('show'); Game.bannerT = dur || 2.2;
  },
  show(id, on) { $(id).classList.toggle('show', !!on); }
};

function matsFor(kind) {
  const dirt = TEX.dirt, grass = TEX.grass;
  const side = new THREE.MeshLambertMaterial({ map: dirt });
  const top = new THREE.MeshLambertMaterial({ map: grass });
  const bottom = new THREE.MeshLambertMaterial({ map: dirt });
  if (kind === 'tile') {
    const m = new THREE.MeshLambertMaterial({ map: TEX.terracotta });
    return [m, m, m, m, m, m];
  }
  if (kind === 'sun') {
    const m = new THREE.MeshLambertMaterial({ map: TEX.sunblock, emissive: 0x402000, emissiveIntensity: 0.25 });
    return [m, m, m, m, m, m];
  }
  if (kind === 'used') {
    const m = new THREE.MeshLambertMaterial({ map: TEX.used });
    return [m, m, m, m, m, m];
  }
  return [side, side, top, bottom, side, side];
}

function placeNode(node, s, y, z) {
  const p = polar(s, y);
  node.position.set(p.x, p.y, z || 0);
  node.rotation.z = -p.a;
}

function buildCourse(index) {
  if (worldGroup) {
    scene.remove(worldGroup);
    worldGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  Game.L = COURSES[index]();
  Game.course = index;
  worldGroup = new THREE.Group();
  scene.add(worldGroup);

  const L = Game.L;
  // solids as painted cubes along the ring
  L.solids.forEach((sol) => {
    if (sol.kind === 'block') return; // blocks get their own meshes
    const depth = sol.kind === 'plat' ? 1.15 : 1.45;
    const yMid = (sol.y0 + sol.y1) / 2;
    const h = Math.max(0.7, sol.y1 - sol.y0);
    for (let s = sol.s0 + 0.5; s < sol.s1 - 0.02; s += 1) {
      const w = Math.min(1, sol.s1 - (s - 0.5));
      if (w < 0.35) break;
      const mesh = cubeMesh(matsFor('ground'), Math.max(w, 1) * 1.04, h, depth);
      placeNode(mesh, s, yMid, 0);
      worldGroup.add(mesh);
      sol._meshes = sol._meshes || []; sol._meshes.push(mesh);
    }
  });

  L.blocks.forEach((b) => {
    const mesh = cubeMesh(matsFor(b.kind === 'sun' ? 'sun' : 'tile'), 1, 1, 1);
    placeNode(mesh, b.s, b.y, 0);
    b.mesh = mesh; b.baseY = b.y; b.bump = 0;
    worldGroup.add(mesh);
  });

  L.pennies.forEach((c) => {
    const m = spriteMesh(TEX.penny, 0.55, 'center');
    placeNode(m, c.s, c.y, 0.15);
    c.mesh = m; worldGroup.add(m);
  });

  L.enemies.forEach((e) => {
    const h = e.kind === 'pod' ? 1.05 : 0.95;
    const m = spriteMesh(e.kind === 'pod' ? TEX.pod[0] : TEX.mite[0], h, 'feet');
    placeNode(m, e.s, e.y, 0.2);
    e.mesh = m; e.h = h; e.t = Math.random(); e.w = 0.7;
    worldGroup.add(m);
  });

  L.chimneys.forEach((c) => {
    const tex = c.tall ? TEX.chimneyTall : TEX.chimneyShort;
    const h = c.tall ? 2.6 : 1.9;
    const m = spriteMesh(tex, h, 'feet');
    placeNode(m, c.s, 1, 0.35);
    c.mesh = m; c.h = h;
    worldGroup.add(m);
    // a slim collider so Wren can stand near them and enter from the top
    L.solids.push({ s0: c.s - 0.38, s1: c.s + 0.38, y0: 1, y1: 1 + h * 0.72, kind: 'chimney', chimney: c });
    if (c.frond) {
      const f = spriteMesh(TEX.frondIn, 1.35, 'feet');
      placeNode(f, c.s, 1 + h * 0.72, 0.4);
      c.frondMesh = f; c.frondOut = false; c.frondH = 1.35;
      worldGroup.add(f);
    }
  });

  L.deco.forEach((d) => {
    const map = { tree_a: [TEX.treeA, 2.1], tree_b: [TEX.treeB, 2.3], flowers: [TEX.flowers, 1.05], bush: [TEX.bush, 1.1], frond_deco: [TEX.frondDeco, 1.4], cairn: [TEX.cairn, 1.15] };
    const pair = map[d.kind]; if (!pair) return;
    const m = spriteMesh(pair[0], pair[1], 'feet');
    placeNode(m, d.s, d.y, -0.55);
    worldGroup.add(m);
  });

  const beac = spriteMesh(TEX.beacon, 2.8, 'feet');
  placeNode(beac, L.beacon, 1, 0.3);
  L.beaconMesh = beac; worldGroup.add(beac);

  L.items.forEach((it) => spawnItemMesh(it));

  // player sprite
  if (Player.node && Player.node.parent) Player.node.parent.remove(Player.node);
  Player.node = new THREE.Group();
  Player.spr = spriteMesh(TEX.wrenIdle[0], 1.72, 'feet');
  Player.node.add(Player.spr);
  worldGroup.add(Player.node);
}

function spawnItemMesh(it) {
  const tex = it.kind === 'sunseed' ? TEX.sunseed : it.kind === 'orb' ? TEX.orb : TEX.penny;
  const h = it.kind === 'penny' ? 0.5 : 0.72;
  const m = spriteMesh(tex, h, 'center');
  it.mesh = m; it.h = h;
  worldGroup.add(m);
  placeNode(m, it.s, it.y, 0.25);
}

function solidsAt() { return Game.L ? Game.L.solids.filter((s) => !(s.block && s.block.gone)) : []; }

function overlap(s0, s1, y0, y1, sol) {
  return s0 < sol.s1 && s1 > sol.s0 && y0 < sol.y1 && y1 > sol.y0;
}

function movePlayer(dt) {
  const P = Player;
  const running = Input.run && P.on;
  const max = (Game.qa && Game.qaSpeed) ? Game.qaSpeed : (running ? RUN_MAX : WALK_MAX);
  const acc = P.on ? ACCEL : AIR_ACCEL;
  const wish = Input.x;
  if (wish !== 0) {
    P.vs += wish * acc * dt;
    P.face = wish > 0 ? 1 : -1;
    const cap = max;
    if (Math.abs(P.vs) > cap) P.vs = cap * Math.sign(P.vs);
  } else if (P.on) {
    const d = DECEL * dt;
    if (Math.abs(P.vs) <= d) P.vs = 0; else P.vs -= d * Math.sign(P.vs);
  } else {
    const d = (DECEL * 0.25) * dt;
    if (Math.abs(P.vs) <= d) P.vs = 0; else P.vs -= d * Math.sign(P.vs);
  }

  if (Input.jumpEdge) P.buffer = BUFFER;
  if (P.buffer > 0) P.buffer -= dt;
  if (P.on) P.coyote = COYOTE; else P.coyote -= dt;

  if (P.buffer > 0 && P.coyote > 0) {
    P.vy = JUMP_V; P.on = false; P.coyote = 0; P.buffer = 0; P.jumping = true;
    Snd.jump();
  }
  if (P.jumping && !Input.jump && P.vy > 0) {
    P.vy *= JUMP_CUT; P.jumping = false;
  }
  if (P.vy <= 0) P.jumping = false;

  P.vy -= GRAV * dt;
  if (P.vy < -MAX_FALL) P.vy = -MAX_FALL;

  // horizontal
  let ns = P.s + P.vs * dt;
  let hs0 = ns - WREN_W / 2, hs1 = ns + WREN_W / 2;
  let y0 = P.y, y1 = P.y + WREN_H;
  const sols = solidsAt();
  for (const sol of sols) {
    if (!overlap(hs0, hs1, y0 + 0.08, y1 - 0.08, sol)) continue;
    if (P.vs > 0 && P.s <= sol.s0) { ns = sol.s0 - WREN_W / 2 - 0.001; P.vs = 0; }
    else if (P.vs < 0 && P.s >= sol.s1) { ns = sol.s1 + WREN_W / 2 + 0.001; P.vs = 0; }
  }
  P.s = ns;

  // vertical
  let ny = P.y + P.vy * dt;
  hs0 = P.s - WREN_W / 2; hs1 = P.s + WREN_W / 2;
  let landed = false, bumped = null;
  y0 = Math.min(P.y, ny); y1 = Math.max(P.y, ny) + WREN_H;
  for (const sol of sols) {
    if (!overlap(hs0, hs1, y0, y1, sol)) continue;
    if (P.vy <= 0 && P.y >= sol.y1 - 0.05) {
      ny = sol.y1; P.vy = 0; landed = true;
    } else if (P.vy > 0 && P.y + WREN_H <= sol.y0 + 0.08) {
      ny = sol.y0 - WREN_H; P.vy = 0; P.jumping = false;
      bumped = sol;
    }
  }
  if (landed && !P.on) Snd.land();
  P.y = ny; P.on = landed;

  if (bumped && bumped.block) bumpBlock(bumped.block);

  // chimney enter: stand on lip and hold down
  if (P.on && Input.down) {
    for (const c of Game.L.chimneys) {
      if (c.warpTo && Math.abs(P.s - c.s) < 0.45 && P.y < 1 + c.h * 0.85 && P.y > 1 + c.h * 0.5) {
        P.s = c.warpTo; P.vs = 0; P.vy = 6; P.on = false;
        Snd.bump();
        break;
      }
    }
  }
}

function bumpBlock(b) {
  if (b.used || b.gone) { Snd.bump(); return; }
  b.bump = 0.12;
  if (b.kind === 'tile') {
    b.gone = true; if (b.mesh) b.mesh.visible = false;
    Snd.brk();
    if (b.contain === 'penny') tossItem('penny', b.s, b.y + 0.8);
    return;
  }
  if (b.kind === 'sun') {
    b.used = true; b.kind = 'used';
    if (b.mesh) {
      b.mesh.material = matsFor('used');
    }
    Snd.bump();
    const kind = b.contain || 'penny';
    tossItem(kind, b.s, b.y + 0.9);
  }
}

function tossItem(kind, s, y) {
  const it = { kind: kind, s: s, y: y, got: false, vy: 8, spawn: 0.45, mesh: null };
  Game.L.items.push(it); spawnItemMesh(it);
}

function wrenBox() {
  return { s0: Player.s - WREN_W / 2, s1: Player.s + WREN_W / 2, y0: Player.y, y1: Player.y + WREN_H };
}

function hurt(reason) {
  if (Game.invuln > 0 || Game.mode !== 'play') return;
  Game.hp -= 1; Snd.hurt(); UI.hud();
  if (Game.hp <= 0) { fail(reason || 'The lantern went out.'); return; }
  Game.invuln = 1.25; Player.vs = -Player.face * 4; Player.vy = 8;
}

function fail(msg) {
  Game.mode = 'lose';
  document.body.classList.add('lose');
  $('loseSub').textContent = msg || 'The lantern flickered out.';
  UI.show('lose', true);
}

function winCourse() {
  if (Game.mode !== 'play') return;
  Snd.beacon();
  Game.mode = 'clear';
  document.body.classList.add('clear');
  const last = Game.course >= COURSES.length - 1;
  $('clearTitle').textContent = last ? 'The Sunny Rim is lit!' : 'Beacon lit!';
  $('clearSub').textContent = last ? 'World 1 is complete.' : Game.L.title + ' is behind you.';
  $('clearPennies').textContent = String(Game.pennies);
  $('clearCourse').textContent = Game.L.name;
  $('cNext').textContent = last ? 'Play again' : 'Next course';
  UI.show('clear', true);
  store.set('bestPennies', Math.max(store.get('bestPennies', 0), Game.pennies));
}

function collectPennies() {
  const box = wrenBox();
  Game.L.pennies.forEach((c) => {
    if (c.got) return;
    if (Math.abs(Player.s - c.s) < 0.55 && Player.y < c.y + 0.4 && Player.y + WREN_H > c.y - 0.4) {
      c.got = true; if (c.mesh) c.mesh.visible = false;
      Game.pennies += 1; Game.totalPennies += 1; Snd.penny(); UI.hud();
    }
  });
  Game.L.items.forEach((it) => {
    if (it.got || it.spawn > 0) return;
    if (Math.abs(Player.s - it.s) < 0.6 && Player.y < it.y + 0.5 && Player.y + WREN_H > it.y - 0.5) {
      it.got = true; if (it.mesh) it.mesh.visible = false;
      if (it.kind === 'penny') { Game.pennies += 1; Snd.penny(); }
      else if (it.kind === 'sunseed') { Game.hp = Math.min(Game.maxHp, Game.hp + 1); Snd.power(); }
      else if (it.kind === 'orb') { Game.orb = 3; Snd.power(); }
      UI.hud();
    }
  });
}

function updateEnemies(dt) {
  Game.L.enemies.forEach((e) => {
    if (!e.alive) {
      e.squish += dt;
      return;
    }
    e.t += dt;
    e.s += e.dir * 1.55 * dt;
    if (e.s < e.s0) { e.s = e.s0; e.dir = 1; }
    if (e.s > e.s1) { e.s = e.s1; e.dir = -1; }
    // stomp / bump
    const top = e.y + e.h * 0.85;
    const hit = Math.abs(Player.s - e.s) < 0.55 && Player.y < top && Player.y + WREN_H > e.y + 0.1;
    if (hit) {
      if (Player.vy < -1 && Player.y + 0.2 > e.y + e.h * 0.35) {
        e.alive = false; e.squish = 0; Player.vy = STOMP_V; Player.jumping = Input.jump; Snd.stomp();
        setEnemyTex(e, true);
      } else hurt('A meadow walker bumped the lantern.');
    }
  });
  // fronds
  Game.L.chimneys.forEach((c) => {
    if (!c.frond) return;
    c.phase += dt;
    const out = Math.sin(c.phase * 1.3) > 0.15;
    if (out !== c.frondOut) {
      c.frondOut = out;
      if (c.frondMesh) c.frondMesh.material.map = out ? TEX.frondOut : TEX.frondIn;
    }
    if (out && Game.invuln <= 0) {
      const fh = c.h * 0.72 + c.frondH;
      if (Math.abs(Player.s - c.s) < 0.7 && Player.y < 1 + fh && Player.y + WREN_H > 1 + c.h * 0.55) {
        hurt('A snap-frond brushed by.');
      }
    }
  });
}

function setEnemyTex(e, down) {
  if (!e.mesh) return;
  const frames = e.kind === 'pod' ? TEX.pod : TEX.mite;
  const downT = e.kind === 'pod' ? TEX.podDown : TEX.miteDown;
  e.mesh.material.map = down ? downT : frames[(e.frame || 0) & 3];
  e.mesh.material.needsUpdate = true;
}

function fireSpark() {
  if (Game.orb <= 0 || Game.mode !== 'play') return;
  Game.orb -= 1; UI.hud(); Snd.spark();
  const b = { s: Player.s + Player.face * 0.6, y: Player.y + 0.85, vs: Player.face * 16, life: 0.45, mesh: null };
  b.mesh = spriteMesh(TEX.bolt, 0.45, 'center');
  if (Player.face < 0) b.mesh.scale.x = -1;
  worldGroup.add(b.mesh);
  Game.bolts.push(b);
}

function updateBolts(dt) {
  for (const b of Game.bolts) {
    if (b.life <= 0) continue;
    b.s += b.vs * dt; b.life -= dt;
    if (b.life <= 0) { if (b.mesh) b.mesh.visible = false; continue; }
    placeNode(b.mesh, b.s, b.y, 0.3);
    Game.L.enemies.forEach((e) => {
      if (!e.alive) return;
      if (Math.abs(e.s - b.s) < 0.6 && Math.abs((e.y + e.h * 0.5) - b.y) < 0.7) {
        e.alive = false; e.squish = 0; setEnemyTex(e, true); Snd.stomp();
        b.life = 0; if (b.mesh) b.mesh.visible = false;
      }
    });
  }
}

function updateItems(dt) {
  Game.L.items.forEach((it) => {
    if (it.got) return;
    if (it.spawn > 0) {
      it.spawn -= dt; it.y += it.vy * dt; it.vy -= GRAV * dt;
      if (it.vy < 0 && it.spawn <= 0.15) { it.vy *= 0.4; }
    }
  });
}

function updateAnims(dt) {
  const P = Player;
  P.t += dt;
  let anim = 'idle';
  if (!P.on) anim = P.vy > 2 ? 'jump' : (P.vy > -1 ? 'apex' : 'fall');
  else if (Math.abs(P.vs) > 0.4) anim = 'run';
  if (anim !== P.anim) { P.anim = anim; P.frame = 0; P.t = 0; }
  let tex = TEX.wrenIdle[0];
  if (anim === 'idle') {
    if (P.t > 0.4) { P.frame = (P.frame + 1) & 1; P.t = 0; }
    tex = TEX.wrenIdle[P.frame & 1];
  } else if (anim === 'run') {
    const spd = clamp(Math.abs(P.vs) / RUN_MAX, 0.4, 1.2);
    if (P.t > 0.08 / spd) { P.frame = (P.frame + 1) % TEX.wrenRun.length; P.t = 0; }
    tex = TEX.wrenRun[P.frame];
  } else if (anim === 'jump') tex = TEX.wrenJump;
  else if (anim === 'apex') tex = TEX.wrenApex;
  else tex = TEX.wrenFall;
  if (P.spr && P.spr.material.map !== tex) { P.spr.material.map = tex; P.spr.material.needsUpdate = true; }
  P.spr.scale.x = P.face;
  const scale = Game.hp >= 2 ? 1.12 : 1;
  P.node.scale.set(scale, scale, 1);
  if (Game.invuln > 0) P.spr.material.opacity = (Math.sin(Game.invuln * 24) > 0) ? 1 : 0.35;
  else P.spr.material.opacity = 1;

  Game.L.enemies.forEach((e) => {
    if (!e.alive) {
      if (e.mesh && e.squish > 0.8) e.mesh.visible = false;
      return;
    }
    if (e.t > 0.16) { e.frame = ((e.frame || 0) + 1) & 3; e.t = 0; setEnemyTex(e, false); }
    e.mesh.scale.x = e.dir;
  });

  Game.L.pennies.forEach((c) => { if (c.mesh && !c.got) c.mesh.rotation.y += dt * 2.2; });
  Game.L.blocks.forEach((b) => {
    if (!b.mesh || b.gone) return;
    if (b.bump > 0) { b.bump -= dt; placeNode(b.mesh, b.s, b.baseY + Math.sin(b.bump * 20) * 0.18, 0); }
    else placeNode(b.mesh, b.s, b.y, 0);
  });
}

function updateCamera(dt) {
  // +s/R (CCW) brings the point at arc-length s to the top of the ring.
  // A minus sign here doubles the displacement and Wren slides off to the right.
  worldGroup.rotation.z = Player.s / R;
  placeNode(Player.node, Player.s, Player.y, 0.25);
  Game.L.enemies.forEach((e) => { if (e.mesh) placeNode(e.mesh, e.s, e.y, 0.2); });
  Game.L.items.forEach((it) => { if (it.mesh && !it.got) placeNode(it.mesh, it.s, it.y, 0.25); });
  Game.L.chimneys.forEach((c) => {
    if (c.mesh) placeNode(c.mesh, c.s, 1, 0.35);
    if (c.frondMesh) placeNode(c.frondMesh, c.s, 1 + c.h * 0.72, 0.4);
  });
  if (Game.L.beaconMesh) placeNode(Game.L.beaconMesh, Game.L.beacon, 1, 0.3);

  worldGroup.updateMatrixWorld(true);
  const wpos = new THREE.Vector3();
  Player.node.getWorldPosition(wpos);

  const want = Player.face * 2.2;
  Game.camLead = lerp(Game.camLead, want, 1 - Math.exp(-5 * dt));
  Game.camY = lerp(Game.camY, Player.y, 1 - Math.exp(-7 * dt));

  // Follow Wren's world position (and jump height) so he stays near mid-screen.
  const lookX = wpos.x + Game.camLead * 0.3;
  const lookY = Math.max(R + 0.2, (R + Game.camY) + 0.55);
  const target = new THREE.Vector3(lookX, lookY, 0);
  camera.position.set(lookX - Player.face * 0.35, lookY + 1.55, 13.6);
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
}

function tick(dt) {
  if (Game.mode !== 'play') return;
  if (Game.invuln > 0) Game.invuln -= dt;
  if (Game.bannerT > 0) {
    Game.bannerT -= dt;
    if (Game.bannerT <= 0) $('banner').classList.remove('show');
  }
  if (Input.sparkEdge) fireSpark();
  movePlayer(dt);
  updateEnemies(dt);
  updateBolts(dt);
  updateItems(dt);
  collectPennies();
  // beacon
  if (!Game.qa && Math.abs(Player.s - Game.L.beacon) < 0.7 && Player.y < 3.4) winCourse();
  if (Player.y < -3.5) fail('Wren slipped off the rim.');
  if (!Game.qa && Player.s < 0.2) { Player.s = 0.2; Player.vs = Math.max(0, Player.vs); }
}

function loop(tms) {
  raf = requestAnimationFrame(loop);
  const t = tms * 0.001;
  let dt = lastT ? t - lastT : 0.016;
  lastT = t;
  if (dt > 0.08) dt = 0.08;
  Input.poll();
  if (Game.mode === 'play') {
    acc += dt;
    const cap = STEP * 8;
    if (acc > cap) acc = cap;
    while (acc >= STEP) { tick(STEP); acc -= STEP; }
    updateAnims(dt);
    updateCamera(dt);
  } else if (Game.worldReady) {
    // idle spin on title? keep last pose
  }
  if (renderer) renderer.render(scene, camera);
  Input.endFrame();
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function startCourse(index, keepPennies) {
  UI.show('clear', false); UI.show('lose', false); UI.show('pause', false); UI.show('title', false);
  document.body.classList.remove('pause', 'lose', 'clear');
  if (!keepPennies) { Game.pennies = 0; }
  Game.hp = 1; Game.orb = 0; Game.invuln = 0; Game.bolts = [];
  buildCourse(index);
  Player.s = Game.L.spawn; Player.y = 1.02; Player.vs = 0; Player.vy = 0; Player.on = true; Player.face = 1;
  Player.anim = 'idle'; Player.jumping = false;
  Game.camLead = 0; Game.camY = 1; Game.qa = false; Game.qaSpeed = 0;
  Game.mode = 'play';
  document.body.classList.add('inplay');
  UI.hud();
  UI.banner(Game.L.name + '  ·  ' + Game.L.title, 2.4);
  Snd.startMusic();
  Game.worldReady = true;
}

function backToTitle() {
  Game.mode = 'title';
  document.body.classList.remove('inplay', 'pause', 'lose', 'clear');
  UI.show('clear', false); UI.show('lose', false); UI.show('pause', false); UI.show('title', true);
  $('banner').classList.remove('show');
}

function bindUI() {
  $('btnPlay').addEventListener('click', () => { Snd.init(); Snd.click(); startCourse(0, false); });
  $('pResume').addEventListener('click', () => UI.resume());
  $('pRestart').addEventListener('click', () => { Snd.init(); startCourse(Game.course, false); });
  $('pQuit').addEventListener('click', () => { Snd.click(); backToTitle(); });
  $('cNext').addEventListener('click', () => {
    Snd.click();
    if (Game.course >= COURSES.length - 1) startCourse(0, false);
    else startCourse(Game.course + 1, true);
  });
  $('cTitle').addEventListener('click', () => { Snd.click(); backToTitle(); });
  $('lAgain').addEventListener('click', () => { Snd.init(); startCourse(Game.course, false); });
  $('lTitle').addEventListener('click', () => { Snd.click(); backToTitle(); });
  $('btnPause').addEventListener('click', (e) => { e.stopPropagation(); UI.togglePause(); });
  $('btnPause').innerHTML = ICON_PAUSE;
  const bindMute = (id) => $(id) && $(id).addEventListener('click', (e) => { e.stopPropagation(); UI.toggleMute(); });
  bindMute('btnMute'); bindMute('btnMuteTitle');
  UI.refreshMute();
}

async function boot() {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x87b7e0, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace || renderer.outputColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 200);

  const names = {
    grass: 'tex_grass.jpg', dirt: 'tex_dirt.jpg', terracotta: 'tex_terracotta.jpg',
    sunblock: 'tex_sunblock.jpg', used: 'tex_usedblock.jpg', sky: 'bg_sky.jpg',
    planet: 'tex_planet.jpg', title: 'title.jpg',
    penny: 'penny.png', sunseed: 'sunseed.png', orb: 'sparkorb.png', bolt: 'bolt.png',
    chimneyTall: 'chimney_tall.png', chimneyShort: 'chimney_short.png',
    frondIn: 'frond_in.png', frondOut: 'frond_out.png', beacon: 'beacon.png',
    treeA: 'tree_a.png', treeB: 'tree_b.png', flowers: 'flowers.png', bush: 'bush.png',
    frondDeco: 'frond_deco.png', cairn: 'cairn.png',
    wrenJump: 'wren_jump.png', wrenApex: 'wren_apex.png', wrenFall: 'wren_fall.png',
    miteDown: 'mite_down.png', podDown: 'pod_down.png'
  };
  const jobs = Object.keys(names).map((k) => loadTex(names[k]).then((t) => { TEX[k] = t; }));
  jobs.push(Promise.all([0, 1].map((i) => loadTex('wren_idle_' + i + '.png'))).then((a) => { TEX.wrenIdle = a; }));
  jobs.push(Promise.all([0, 1, 2, 3, 4].map((i) => loadTex('wren_run_' + i + '.png'))).then((a) => { TEX.wrenRun = a; }));
  jobs.push(Promise.all([0, 1, 2, 3].map((i) => loadTex('mite_' + i + '.png'))).then((a) => { TEX.mite = a; }));
  jobs.push(Promise.all([0, 1, 2, 3].map((i) => loadTex('pod_' + i + '.png'))).then((a) => { TEX.pod = a; }));
  await Promise.all(jobs);

  skyTex = TEX.sky; scene.background = skyTex;

  const hemi = new THREE.HemisphereLight(0xfff4dc, 0x6a4a28, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8c0, 1.15);
  sun.position.set(4, 10, 16); scene.add(sun);
  const coreLight = new THREE.PointLight(0xffc060, 2.4, 48, 1.15);
  coreLight.position.set(0, 4, 8); scene.add(coreLight);

  // Half-planet in the hole of the ring. The cut face is lifted so its
  // glowing center sits in the lower frame instead of a dark outer rim.
  const PR = R - 1.15;
  const glob = new THREE.Mesh(
    new THREE.SphereGeometry(PR, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({
      map: TEX.planet,
      color: 0xfff0d8,
      emissive: 0xff7a28,
      emissiveMap: TEX.planet,
      emissiveIntensity: 0.55,
      side: THREE.FrontSide
    })
  );
  glob.rotation.x = Math.PI / 2;
  glob.scale.z = 0.34;
  scene.add(glob);
  Game.planet = glob;
  // Cut-face of the half-planet, sitting in the hole under the path
  // (top of the disc stays below Wren's feet at y = R + 1).
  const faceR = 5.15;
  const faceY = 20.4;
  const rim = new THREE.Mesh(
    new THREE.CircleGeometry(faceR + 0.18, 64),
    new THREE.MeshBasicMaterial({ color: 0x6a4a28, toneMapped: false })
  );
  rim.position.set(0, faceY, 2.2);
  scene.add(rim);
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(faceR, 64),
    new THREE.MeshBasicMaterial({ map: TEX.planet, toneMapped: false })
  );
  disc.position.set(0, faceY, 2.35);
  scene.add(disc);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(1.8, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c0, transparent: true, opacity: 0.4, toneMapped: false })
  );
  core.position.set(0, faceY, 2.5);
  scene.add(core);
  const glow = new THREE.PointLight(0xffd080, 1.8, 32, 1.1);
  glow.position.set(0, 18, 7);
  scene.add(glow);

  $('titleBg').src = AS['title.jpg'];
  bindUI();
  Input.init();
  window.addEventListener('resize', resize);
  resize();
  Game.ready = true;
  $('loading').classList.remove('show');
  requestAnimationFrame(loop);

  // Private QA / demo hook (not a public URL)
  window.__SPIN = {
    start: (i) => startCourse(i || 0, false),
    next: () => startCourse(Math.min(Game.course + 1, 2), true),
    win: winCourse,
    state: () => ({ mode: Game.mode, course: Game.course, s: Player.s, y: Player.y, vs: Player.vs, on: Player.on, pennies: Game.pennies, hp: Game.hp, rot: worldGroup ? worldGroup.rotation.z : 0 }),
    input: Input,
    hold: (opts) => { opts = opts || {}; const I = Input; if (opts.x != null) I.x = opts.x; if (opts.run) I.run = true; if (opts.jump) { I.jumpEdge = true; I.jump = true; } },
    qa: (on, opts) => {
      opts = opts || {};
      Game.qa = !!on;
      Game.qaSpeed = (on && opts.speed) ? opts.speed : 0;
      if (Game.qa) {
        Game.invuln = 999;
        if (opts.hideEnemies && Game.L && Game.L.enemies) {
          Game.L.enemies.forEach((e) => { e.alive = false; if (e.mesh) e.mesh.visible = false; });
        }
      }
    },
    invuln: (on) => { Game.invuln = on ? 999 : 0; },
    place: (s, y) => {
      Player.s = s;
      Player.y = (y == null ? 1.02 : y);
      Player.vs = 0; Player.vy = 0; Player.on = true;
      Game.camLead = 0; Game.camY = Player.y;
      if (worldGroup) {
        worldGroup.rotation.z = Player.s / R;
        placeNode(Player.node, Player.s, Player.y, 0.25);
        worldGroup.updateMatrixWorld(true);
      }
    },
    probe: () => {
      const wpos = new THREE.Vector3();
      if (Player.node) Player.node.getWorldPosition(wpos);
      const ndc = wpos.clone().project(camera);
      const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
      return {
        mode: Game.mode, course: Game.course,
        s: Player.s, y: Player.y, vs: Player.vs, vy: Player.vy, on: !!Player.on,
        worldRotZ: worldGroup ? worldGroup.rotation.z : 0,
        expectedRotZ: Player.s / R,
        world: { x: wpos.x, y: wpos.y, z: wpos.z },
        sx: ndc.x * 0.5 + 0.5,
        sy: -ndc.y * 0.5 + 0.5,
        vw: w, vh: h
      };
    }
  };
  if (/[?&]demo=1/.test(location.search)) startCourse(0, false);
}

window.addEventListener('DOMContentLoaded', () => { boot().catch((e) => { console.error(e); }); });
