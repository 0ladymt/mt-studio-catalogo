"""Extract approved ink pixels from source art; preserve RGB and original files.

The alpha key removes dark surface pixels. White/purple keys isolate overlapping
ink colours where appropriate. No artwork generation, resizing or recolouring.
Run from the repository root with Pillow and numpy installed.
"""
from pathlib import Path
import numpy as np
from PIL import Image

SOURCES = Path('assets/backgrounds')
TARGET = SOURCES / 'elements'
# Source page, crop in original pixels, ink colour key.
ELEMENTS = {
    'home-crown': ('home', (45, 20, 165, 135), 'white'),
    'home-butterfly-purple': ('home', (707, 363, 941, 715), 'purple'),
    'home-butterfly-white': ('home', (680, 630, 820, 810), 'white'),
    'home-heart': ('home', (58, 292, 112, 365), 'purple'),
    'home-brush': ('home', (0, 0, 310, 295), 'purple'),
    'loja-crown': ('loja', (40, 15, 140, 125), 'white'),
    'loja-stroke': ('loja', (78, 104, 208, 225), 'white'),
    'loja-heart': ('loja', (55, 975, 112, 1060), 'purple'),
    'catalogo-brush': ('catalogo', (0, 0, 185, 195), 'purple'),
    'catalogo-drip': ('catalogo', (887, 0, 924, 210), 'purple'),
    'sobre-heart': ('sobre', (80, 223, 146, 297), 'purple'),
    'sobre-butterfly': ('sobre', (740, 405, 865, 602), 'white'),
    'sobre-brush': ('sobre', (0, 1440, 310, 1672), 'purple'),
    'redes-spark': ('redes', (815, 435, 888, 517), 'white'),
    'redes-heart': ('redes', (810, 975, 906, 1080), 'all'),
    'redes-butterfly': ('redes', (20, 700, 115, 816), 'white'),
    'projetos-crown': ('projetos', (12, 20, 315, 345), 'white'),
    'projetos-butterfly': ('projetos', (40, 750, 168, 955), 'purple'),
    'projetos-brush': ('projetos', (0, 1310, 305, 1672), 'purple'),
    'projetos-heart': ('projetos', (837, 485, 902, 558), 'purple'),
}

def extract(name, page, box, mode):
    crop = Image.open(SOURCES / (page + '.png')).convert('RGB').crop(box)
    rgb = np.asarray(crop).astype(float)
    white = np.clip((rgb.min(axis=2) - 60) / 65, 0, 1)
    purple = np.minimum(np.clip((rgb[:, :, 2] - 40) / 45, 0, 1),
                        np.clip((rgb[:, :, 2] - rgb[:, :, 1] - 15) / 25, 0, 1))
    alpha = white if mode == 'white' else purple if mode == 'purple' else np.maximum(white, purple)
    rgba = np.dstack((rgb.astype('uint8'), (alpha * 255).round().astype('uint8')))
    out = Image.fromarray(rgba)
    bounds = out.getbbox()
    if not bounds:
        raise ValueError('No ink in ' + name)
    out = out.crop(bounds)
    # A transparent perimeter prevents any crop box from being painted.
    padded = Image.new('RGBA', (out.width + 12, out.height + 12))
    padded.paste(out, (6, 6))
    padded.save(TARGET / (name + '.png'))
    print(name, padded.size)

if __name__ == '__main__':
    TARGET.mkdir(parents=True, exist_ok=True)
    for name, (page, box, mode) in ELEMENTS.items():
        extract(name, page, box, mode)
