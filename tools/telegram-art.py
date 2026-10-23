#!/usr/bin/env python3
"""Draws the bot's art into telegram/: avatar.png (640×640, the APK's ice-blue crystal on dark navy, sharp at any size)
and cover.png (640×360, the picture BotFather's /newapp asks for: the crystal and the title over a station shot)."""
import pathlib
from PIL import Image, ImageDraw, ImageFilter, ImageFont

root = pathlib.Path(__file__).resolve().parent.parent
out = root / "telegram"
out.mkdir(exist_ok=True)
S = 2048  # drawn large, then scaled down


def crystal(size, cx, cy, h):
    """The crystal, its glow and a dark navy ground, as an RGBA image size×size; h is its height."""
    w = h * 0.34
    tip, sh, bot = cy - h / 2, cy - h / 2 + h * 0.24, cy + h / 2 - h * 0.21
    mid = cx + w * 0.07  # the front edge, a little right of centre
    L, R = cx - w / 2, cx + w / 2
    faces = [  # (points, colour): the top facets, the body, the foot
        ([(cx, tip), (L, sh), (mid, sh)], (205, 240, 253)), ([(cx, tip), (mid, sh), (R, sh)], (150, 215, 246)),
        ([(L, sh), (mid, sh), (mid, bot), (L, bot)], (126, 205, 244)), ([(mid, sh), (R, sh), (R, bot), (mid, bot)], (84, 176, 232)),
        ([(L, bot), (mid, bot), (cx, cy + h / 2)], (92, 186, 238)), ([(mid, bot), (R, bot), (cx, cy + h / 2)], (58, 150, 214)),
    ]
    img = Image.new("RGBA", (size, size))
    g = ImageDraw.Draw(img)
    for pts, col in faces: g.polygon(pts, fill=col + (255,))
    for pts, _ in faces: g.line(pts + [pts[0]], fill=(232, 251, 255, 255), width=max(2, size // 300))
    glow = Image.new("RGBA", (size, size), (58, 180, 255, 0))
    glow.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(size / 18)).point(lambda a: int(a * 0.85)))
    return Image.alpha_composite(glow, img)


def ground(wd, ht):
    """Dark navy, lighter in the middle."""
    bg = Image.new("RGB", (wd, ht), (6, 14, 24))
    halo = Image.new("L", (wd, ht), 0)
    ImageDraw.Draw(halo).ellipse([wd * 0.15, ht * 0.1, wd * 0.85, ht * 0.9], fill=255)
    halo = halo.filter(ImageFilter.GaussianBlur(min(wd, ht) / 5))
    return Image.composite(Image.new("RGB", (wd, ht), (20, 48, 72)), bg, halo)


av = ground(S, S).convert("RGBA")
av = Image.alpha_composite(av, crystal(S, S / 2, S / 2, S * 0.74))
av.convert("RGB").resize((640, 640), Image.LANCZOS).save(out / "avatar.png")

W, H = 1280, 720
shot = Image.open(root / "minis" / "speculum.jpg").convert("RGB").resize((W, H), Image.LANCZOS)
cover = Image.blend(shot, ground(W, H), 0.62).convert("RGBA")
cr = crystal(H, H / 2, H / 2, H * 0.78)
cover.alpha_composite(cr, (int(W * 0.21 - H / 2), 0))
g = ImageDraw.Draw(cover)
try:
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 132)
    small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 36)
except OSError:
    font = small = ImageFont.load_default()
g.text((W * 0.39, H * 0.42), "LIMBUS", font=font, fill=(240, 250, 255), anchor="lm")
g.text((W * 0.395, H * 0.6), "Rails between the Light and the Dark", font=small, fill=(170, 215, 240), anchor="lm")
cover.convert("RGB").resize((640, 360), Image.LANCZOS).save(out / "cover.png")
print("telegram/avatar.png, telegram/cover.png")
