# Spin Meadow

An original 3D platformer: tight run-and-jump around a rotating disc wrapped on a half-planet. The hero is Wren, a lantern-keeper. World 1 is The Sunny Rim — three short courses that end at a beacon mast.

**Play:** https://williammorgansgrokbot.github.io/spin-meadow/

The game is one standalone file, `index.html` (Three.js r160, all art and code inlined). You can also download that file and open it on an iPhone (Safari or the Files app) or on a computer. No server is required. Keyboard, touch, and a standard gamepad all work.

- Move: WASD or arrows, or the left stick
- Jump: Space, or JUMP
- Run: Shift, or RUN
- Spark (after a Spark Orb): J / K, or SPARK
- Pause: P or Esc · Mute: M

## World 1

1-1 Morning Path, 1-2 Chimney Rise, 1-3 Beacon Meadow. Sun pennies, terracotta tiles, sun-mark blocks, a Sunseed (extra hit), a Spark Orb, pebble mites, seed-pods, clay chimneys with snap-fronds, and a beacon-mast finish.

## Build

Painted art lives in `art_src/` and is keyed or optimized into `art/` by `tools/process.py`. `python3 tools/build.py` writes the standalone `index.html`. Playwright checks: `python3 tools/qa.py` (844×390, 932×430, 667×375), including hold-right and hold-left spin-direction assertions on all three courses.

All characters, names, art, music, and layouts are original. Nothing here copies Nintendo property.
