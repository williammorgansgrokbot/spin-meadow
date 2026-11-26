/* World 1 — The Sunny Rim. s is arc length along the ring; y is height above the ring surface. */
function _L() {
  const L = { solids: [], blocks: [], pennies: [], enemies: [], chimneys: [], deco: [], items: [], beacon: 0, spawn: 2.5, name: '', title: '' };
  return L;
}
function ground(L, s0, s1, top) {
  top = top == null ? 1 : top;
  L.solids.push({ s0: s0, s1: s1, y0: top - 1, y1: top, kind: 'ground' });
}
function plat(L, s0, w, top) {
  L.solids.push({ s0: s0, s1: s0 + w, y0: top - 1, y1: top, kind: 'plat' });
}
function penny(L, s, y) { L.pennies.push({ s: s, y: y, got: false }); }
function pennies(L, s0, n, y, ds) { for (let i = 0; i < n; i++) penny(L, s0 + i * (ds || 1.4), y); }
function block(L, s, y, kind, contain) {
  L.blocks.push({ s: s, y: y, kind: kind || 'tile', contain: contain || null, used: false, gone: false });
  L.solids.push({ s0: s - 0.5, s1: s + 0.5, y0: y - 0.5, y1: y + 0.5, kind: 'block', block: L.blocks[L.blocks.length - 1] });
}
function enemy(L, kind, s0, s1, y) { L.enemies.push({ kind: kind, s0: s0, s1: s1, s: (s0 + s1) / 2, y: y, dir: 1, alive: true, squish: 0 }); }
function chimney(L, s, tall, frond, warpTo) { L.chimneys.push({ s: s, tall: !!tall, frond: !!frond, warpTo: warpTo || 0, phase: Math.random() * Math.PI * 2 }); }
function deco(L, kind, s, y) { L.deco.push({ kind: kind, s: s, y: y == null ? 1 : y }); }
function item(L, kind, s, y) { L.items.push({ kind: kind, s: s, y: y, got: false, vy: 0, spawn: 0 }); }

function course11() {
  const L = _L();
  L.name = '1-1'; L.title = 'Morning Path';
  ground(L, -6, 16, 1);
  pennies(L, 5.2, 3, 2.25, 1.5);
  block(L, 11.5, 3.1, 'tile', 'penny');
  deco(L, 'flowers', 4, 1); deco(L, 'tree_a', 8.5, 1); deco(L, 'bush', 14.2, 1);
  // easy gap
  ground(L, 18.3, 36, 1);
  plat(L, 22.5, 3, 3.7);
  block(L, 24, 4.2, 'sun', 'penny');
  pennies(L, 22.8, 3, 5.1, 1.15);
  enemy(L, 'mite', 27, 33.5, 1);
  chimney(L, 30.6, false, false, 0);
  deco(L, 'flowers', 20, 1); deco(L, 'cairn', 34.4, 1);
  // run-friendly gap
  ground(L, 39.2, 62, 1);
  plat(L, 44, 4.2, 3.7);
  pennies(L, 44.4, 4, 5.0, 1.1);
  deco(L, 'tree_b', 42, 1); deco(L, 'frond_deco', 50, 1);
  enemy(L, 'mite', 51, 58, 1);
  deco(L, 'flowers', 59, 1);
  L.beacon = 60.5;
  L.end = 64;
  return L;
}

function course12() {
  const L = _L();
  L.name = '1-2'; L.title = 'Chimney Rise';
  ground(L, -6, 12, 1);
  pennies(L, 3.5, 3, 2.25, 1.4);
  deco(L, 'tree_a', 2.2, 1);
  plat(L, 8, 2, 2.6);
  plat(L, 11.2, 2, 3.6);
  pennies(L, 8.3, 2, 3.7, 1.1);
  // first jump gap onto a mid ledge
  ground(L, 16, 28, 1);
  chimney(L, 18.4, true, true, 0);
  block(L, 21.5, 3.1, 'sun', 'sunseed');
  enemy(L, 'pod', 22.5, 27, 1);
  deco(L, 'bush', 16.6, 1);
  // warp chimney over a wide gap
  chimney(L, 26.6, true, false, 35.4);
  ground(L, 33.6, 48, 1);
  chimney(L, 35.4, false, false, 0);
  plat(L, 38, 3.2, 3.7);
  pennies(L, 38.3, 3, 5.0, 1.1);
  enemy(L, 'mite', 40, 46.5, 1);
  deco(L, 'flowers', 37, 1); deco(L, 'tree_b', 47, 1);
  // tighter gap, then a tile stair
  ground(L, 51.2, 72, 1);
  block(L, 54, 1.5, 'tile', null);
  block(L, 55, 1.5, 'tile', 'penny');
  block(L, 55, 2.5, 'tile', null);
  block(L, 58.5, 4.2, 'sun', 'penny');
  plat(L, 57.5, 3, 3.7);
  pennies(L, 61, 3, 2.3, 1.3);
  chimney(L, 65, true, true, 0);
  enemy(L, 'pod', 62, 64.4, 1);
  L.beacon = 69;
  L.end = 73;
  return L;
}

function course13() {
  const L = _L();
  L.name = '1-3'; L.title = 'Beacon Meadow';
  ground(L, -6, 14, 1);
  pennies(L, 3.2, 3, 2.25, 1.4);
  block(L, 8.5, 3.1, 'sun', 'orb');
  deco(L, 'flowers', 5, 1); deco(L, 'tree_a', 12, 1);
  // floating cubes over a gap
  plat(L, 16, 2, 2.4);
  plat(L, 19.4, 2, 3.2);
  plat(L, 23, 2.4, 4);
  pennies(L, 16.3, 2, 3.5, 1);
  pennies(L, 23.3, 2, 5.15, 1);
  ground(L, 27, 44, 1);
  enemy(L, 'mite', 28.5, 34, 1);
  enemy(L, 'pod', 36, 42, 1);
  chimney(L, 32.2, true, true, 0);
  plat(L, 38, 3, 3.7);
  block(L, 39.5, 4.2, 'sun', 'penny');
  deco(L, 'bush', 27.6, 1); deco(L, 'frond_deco', 43, 1);
  // run gap then a high path
  plat(L, 46.2, 2.2, 2.6);
  plat(L, 50, 5.5, 3.4);
  pennies(L, 50.4, 4, 4.55, 1.15);
  enemy(L, 'mite', 50.6, 54.8, 3.4);
  ground(L, 57, 80, 1);
  chimney(L, 60, false, false, 0);
  deco(L, 'tree_b', 58.2, 1); deco(L, 'flowers', 63, 1); deco(L, 'cairn', 67, 1);
  block(L, 65.5, 1.5, 'tile', 'penny');
  block(L, 66.5, 1.5, 'tile', null);
  enemy(L, 'pod', 69, 74.5, 1);
  pennies(L, 70, 3, 2.3, 1.3);
  L.beacon = 77;
  L.end = 81;
  return L;
}

const COURSES = [course11, course12, course13];
const WORLD_NAME = 'The Sunny Rim';
