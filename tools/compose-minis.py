#!/usr/bin/env python3
"""Join each level's light and dark shots into minis/<id>.jpg: the light on the left, the dark on the right,
split down the middle, as the hand-drawn miniatures are. Usage: python3 tools/compose-minis.py <shots dir>"""
import pathlib
import sys
from PIL import Image, ImageDraw

W, H = 640, 360
shots, out = pathlib.Path(sys.argv[1]), pathlib.Path(__file__).resolve().parent.parent / "minis"
out.mkdir(exist_ok=True)


def fit(im):
    w, h = im.size
    s = max(W / w, H / h)
    im = im.resize((round(w * s), round(h * s)), Image.LANCZOS)
    w, h = im.size
    return im.crop(((w - W) // 2, (h - H) // 2, (w - W) // 2 + W, (h - H) // 2 + H))


mask = Image.new("L", (W, H), 0)
ImageDraw.Draw(mask).rectangle([0, 0, W // 2 - 1, H], fill=255)
for light in sorted(shots.glob("*_L.png")):
    lid = light.stem[:-2]
    dark = shots / f"{lid}_D.png"
    Image.composite(fit(Image.open(light).convert("RGB")), fit(Image.open(dark).convert("RGB")), mask).save(out / f"{lid}.jpg", quality=78)
    print(lid)
