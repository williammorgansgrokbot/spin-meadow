#!/usr/bin/env python3
"""Key chroma-green sprite sheets, slice frames, and write optimized art/ files."""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art_src'
ART = ROOT / 'art'
ART.mkdir(exist_ok=True)


def key(img, spill=18, falloff=55):
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    # also treat near-#00FF00 as green even if slightly off from JPEG
    near = (g > 180) & (g > r + 40) & (g > b + 40)
    al = np.clip(1 - (d - spill) / falloff, 0, 1)
    al = np.where(near & (d > 10), np.minimum(al, 0.15), al)
    al = np.where(d > 80, 0, al)
    g2 = np.minimum(g, np.maximum(r, b) * 1.04)
    out = np.dstack([r, g2, b, al * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    A = im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.5))
    # harden after fringe trim
    arr = np.asarray(A).astype(np.float32)
    arr = np.clip((arr - 12) * 1.15, 0, 255)
    im.putalpha(Image.fromarray(arr.astype(np.uint8)))
    return im


def crop(im, pad=4, thresh=18):
    bb = im.split()[3].point(lambda v: 255 if v > thresh else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def fit_h(im, h):
    w = max(1, round(im.width * h / im.height))
    return im.resize((w, h), Image.LANCZOS)


def columns(im, min_w=20, gap=6, thresh=18):
    A = np.asarray(im.split()[3]) > thresh
    occ = A.any(0)
    segs, inn, s = [], False, 0
    for x, c in enumerate(occ):
        if c and not inn:
            s, inn = x, True
        elif not c and inn:
            if x - s >= min_w:
                segs.append((s, x))
            inn = False
    if inn and im.width - s >= min_w:
        segs.append((s, im.width))
    # merge tiny gaps
    merged = []
    for a, b in segs:
        if merged and a - merged[-1][1] < gap:
            merged[-1] = (merged[-1][0], b)
        else:
            merged.append((a, b))
    return merged


def slice_row(path, names, height, skip=(), min_w=24):
    im = key(Image.open(path))
    segs = columns(im, min_w=min_w)
    print(path.name, 'segs', len(segs), segs)
    # if more segs than names, try to pick the largest
    if len(segs) > len(names):
        segs = sorted(segs, key=lambda ab: ab[1] - ab[0], reverse=True)[:len(names) + len(skip)]
        segs = sorted(segs, key=lambda ab: ab[0])
    out = []
    ni = 0
    for i, (x0, x1) in enumerate(segs):
        if i in skip:
            continue
        if ni >= len(names):
            break
        fr = crop(im.crop((x0, 0, x1, im.height)))
        fr = fit_h(fr, height)
        dest = ART / names[ni]
        fr.save(dest, optimize=True)
        print(' ', names[ni], fr.size, dest.stat().st_size // 1024, 'KB')
        out.append(dest)
        ni += 1
    if ni < len(names):
        print('  WARNING expected', names, 'got', ni)
    return out


def save_jpeg(src, dest, size=None, quality=86):
    im = Image.open(src).convert('RGB')
    if size:
        im = im.resize(size, Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, quality=quality, optimize=True, progressive=True)
    print(dest.name, im.size, dest.stat().st_size // 1024, 'KB')


def main():
    sh = SRC / 'sheets'
    tx = SRC / 'textures'

    # Skip run frame 0: it was generated with two lanterns
    slice_row(sh / 'wren-run.jpg', [f'wren_run_{i}.png' for i in range(5)], 420, skip=(0,))
    slice_row(sh / 'wren-idle-jump.jpg', ['wren_idle_0.png', 'wren_idle_1.png', 'wren_jump.png', 'wren_apex.png', 'wren_fall.png'], 420)
    slice_row(sh / 'mite-walk.jpg', ['mite_0.png', 'mite_1.png', 'mite_2.png', 'mite_3.png', 'mite_down.png'], 280)
    slice_row(sh / 'seedpod-walk.jpg', ['pod_0.png', 'pod_1.png', 'pod_2.png', 'pod_3.png', 'pod_down.png'], 280)
    slice_row(sh / 'items-props.jpg', ['penny.png', 'sunseed.png', 'sparkorb.png', 'bolt.png', 'sunblock_sprite.png'], 260, min_w=30)
    slice_row(sh / 'chimney-frond-beacon.jpg', ['chimney_tall.png', 'chimney_short.png', 'frond_in.png', 'frond_out.png', 'beacon.png'], 480, min_w=30)
    slice_row(sh / 'plants-trees.jpg', ['tree_a.png', 'tree_b.png', 'flowers.png', 'bush.png', 'frond_deco.png', 'cairn.png'], 360)

    save_jpeg(tx / 'tex-grass.jpg', ART / 'tex_grass.jpg', (512, 512))
    save_jpeg(tx / 'tex-dirt.jpg', ART / 'tex_dirt.jpg', (512, 512))
    save_jpeg(tx / 'tex-terracotta.jpg', ART / 'tex_terracotta.jpg', (512, 512))
    save_jpeg(tx / 'tex-sunblock.jpg', ART / 'tex_sunblock.jpg', (512, 512))
    save_jpeg(tx / 'tex-usedblock.jpg', ART / 'tex_usedblock.jpg', (512, 512))
    save_jpeg(tx / 'bg-sky.jpg', ART / 'bg_sky.jpg', (1280, 720), quality=82)
    save_jpeg(tx / 'tex-planet.jpg', ART / 'tex_planet.jpg', (768, 768), quality=84)
    # title card already painted
    save_jpeg(SRC / 'spin-meadow-title.jpg', ART / 'title.jpg', (1280, 720), quality=84)

    print('done', len(list(ART.glob('*'))), 'files in art/')


if __name__ == '__main__':
    main()
