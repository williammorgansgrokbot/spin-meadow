#!/usr/bin/env python3
"""Spin Meadow art pipeline.

Presentation boards in art_src/ are optimized to JPEG (no WebP) in art/ and previews/.
When later sprite sheets are painted on chroma green, use key() to cut them to PNG.

Usage: python3 tools/process.py
"""
from pathlib import Path
from PIL import Image, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'art_src'
ART = ROOT / 'art'
PREV = ROOT / 'previews'
ART.mkdir(exist_ok=True)
PREV.mkdir(exist_ok=True)

# Bill-facing preview names
PREVIEWS = [
    ('wren-character-sheet.jpg', '01-wren-character-sheet.jpg'),
    ('spin-meadow-key-art.jpg', '02-spin-meadow-key-art.jpg'),
    ('enemy-concepts.jpg', '03-enemy-concepts.jpg'),
    ('item-sheet.jpg', '04-item-sheet.jpg'),
    ('spin-meadow-title.jpg', '05-spin-meadow-title.jpg'),
]


def key(img, spill=25, falloff=60):
    """Green-screen key with a light spill reduction, same idea as Bill's other games."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = g - np.maximum(r, b)
    al = np.clip(1 - (d - spill) / falloff, 0, 1)
    g2 = np.minimum(g, np.maximum(r, b) * 1.02)
    out = np.dstack([r, g2, b, al * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    A = im.split()[3].filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(A)
    return im


def crop(im, pad=6, thresh=20):
    bb = im.split()[3].point(lambda v: 255 if v > thresh else 0).getbbox()
    if not bb:
        return im
    x0, y0, x1, y1 = bb
    return im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))


def save_jpeg(im, path, quality=90):
    im.convert('RGB').save(path, quality=quality, optimize=True, progressive=True)


def process_previews():
    for src_name, out_name in PREVIEWS:
        src = SRC / src_name
        if not src.exists():
            print('missing', src)
            continue
        im = Image.open(src).convert('RGB')
        save_jpeg(im, ART / out_name)
        save_jpeg(im, PREV / out_name)
        print(out_name, im.size, (PREV / out_name).stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    process_previews()
