#!/usr/bin/env python3
"""Cuts the game's trailers from the level recordings: 16:9 (1920x1080) and 9:16 (1080x1920), in Russian and English.

A title over a blurred shot, then every level for three seconds with its name, then where to play; the game's own Lux track
under it all. The picture is the recording's band of play (1280x496, its letterbox cut away) over a blurred, darkened copy of
itself, so neither shape shows black bars. Titles are drawn by Playwright in the game's fonts and laid over by ffmpeg.

    SRC=/path/to/recordings OUT=/path/to/out python3 tools/trailer.py

SRC holds a recording per level, named by its id (initium.mp4, vitrum.mp4, ... abyssus.mp4 for Nox): 1280x720 screen
recordings with the play in the middle 1280x496.
"""
import json
import os
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = pathlib.Path(os.environ["SRC"]), pathlib.Path(os.environ["OUT"])
OUT.mkdir(parents=True, exist_ok=True)
work = pathlib.Path(tempfile.mkdtemp(prefix="trailer-"))
BAND = "crop=1280:496:0:112"
SEG, FADE, FPS = 3.0, 0.25, 30
MUSIC, MUSIC_AT = root / "music" / "translucent_path.mp3", 12.5  # its quiet opening under the title, the drop on the first level

# the journey's order, each level's stretch of its recording (seconds in), and its names
LEVELS = [("initium", 3.0, "Initium", "Начало", "Beginning"), ("vitrum", 4.0, "Vitrum", "Стекло", "Glass"),
          ("labyrinthus", 5.0, "Labyrinthus", "Лабиринт", "Labyrinth"), ("rubinus", 4.0, "Rubinus", "Рубин", "Ruby"),
          ("hortus", 4.0, "Hortus", "Сад", "Garden"), ("thesaurus", 4.0, "Thesaurus", "Сокровищница", "Treasury"),
          ("speculum", 5.0, "Speculum", "Зеркало", "Mirror"), ("tao", 3.0, "Tao", "Дао", "The Way"),
          ("abyssus", 5.0, "Nox", "Тьма", "Dark"), ("carcer", 5.0, "Carcer", "Темница", "Dungeon"), ("lux", 4.0, "Lux", "Свет", "Light")]
WORDS = {"ru": {"tag": "Рельсы между Светом и Тьмой", "play": "Играйте в Telegram"},
         "en": {"tag": "Rails between the Light and the Dark", "play": "Play in Telegram"}}
BOT = "@limbus_game_bot"
SHAPES = {"h": (1920, 1080), "v": (1080, 1920)}

CSS = f"""<link rel="stylesheet" href="file://{root}/fonts/fonts.css"><style>
html, body {{ margin: 0; background: transparent; color: #f4fbfc; font-family: Manrope; }}
.logo {{ font-family: Unbounded; font-weight: 700; letter-spacing: 0.22em; margin-right: -0.22em; line-height: 1; text-shadow: 0 6px 40px rgba(0,0,0,.5); }}
.logo span {{ color: #1d6f8f; }}
.shadow {{ text-shadow: 0 3px 18px rgba(0,0,0,.65), 0 0 2px rgba(0,0,0,.4); }}
.center {{ position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }}
.pill {{ display: inline-block; padding: .45em 1.1em; border-radius: 999px; background: #f4fbfc; color: #10242e; font-weight: 700; }}
</style>"""


def card(kind, shape, lang, lv=None):
    """The HTML of one transparent overlay: the title, a level's name, or the end."""
    w, h = SHAPES[shape]; s = w / 1920 if shape == "h" else w / 1080
    W = WORDS[lang]
    if kind == "title":
        body = f'<div class="center"><div class="logo" style="font-size:{170 * s}px">LIMB<span>U</span>S</div><div class="shadow" style="font-size:{44 * s}px;font-weight:600;margin-top:{30 * s}px">{W["tag"]}</div></div>'
    elif kind == "end":
        body = (f'<div class="center"><div class="logo" style="font-size:{150 * s}px">LIMB<span>U</span>S</div>'
                f'<div class="shadow" style="font-size:{46 * s}px;font-weight:600;margin:{34 * s}px 0 {30 * s}px">{W["play"]}</div>'
                f'<div class="pill" style="font-size:{44 * s}px">{BOT}</div></div>')
    else:
        _, _, latin, ru, en = lv
        name = ru if lang == "ru" else en
        if shape == "h":  # lower left, on the blurred strip under the play
            body = (f'<div class="shadow" style="position:absolute;left:90px;bottom:26px;display:flex;align-items:baseline;gap:22px"><div style="font-family:Unbounded;font-weight:700;font-size:64px;letter-spacing:.04em">{latin}</div>'
                    f'<div style="font-size:34px;font-weight:600;opacity:.92">{name}</div></div>')
        else:  # under the band of play, the logo above it
            body = (f'<div class="center" style="justify-content:flex-start;padding-top:330px"><div class="logo" style="font-size:96px">LIMB<span>U</span>S</div></div>'
                    f'<div class="shadow" style="position:absolute;left:0;right:0;top:1230px;text-align:center"><div style="font-family:Unbounded;font-weight:700;font-size:84px;letter-spacing:.04em">{latin}</div>'
                    f'<div style="font-size:44px;font-weight:600;margin-top:8px;opacity:.92">{name}</div></div>')
    return f"<!doctype html><html><head><meta charset='utf-8'>{CSS}</head><body style='width:{w}px;height:{h}px;position:relative'>{body}</body></html>"


def overlays():
    """Every overlay as a transparent PNG, drawn in the game's fonts by Playwright."""
    jobs = []
    for shape in SHAPES:
        for lang in WORDS:
            for kind, lv in [("title", None), ("end", None)] + [("level", lv) for lv in LEVELS]:
                name = f"{shape}-{lang}-{kind if not lv else lv[0]}"
                (work / f"{name}.html").write_text(card(kind, shape, lang, lv), encoding="utf-8")
                jobs.append([str(work / f"{name}.html"), str(work / f"{name}.png"), *SHAPES[shape]])
    script = work / "shoot.js"
    script.write_text("""const { chromium } = require('playwright');
(async () => { const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  for (const [html, png, w, h] of JSON.parse(process.argv[2])) { const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('file://' + html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(150);
    await p.screenshot({ path: png, omitBackground: true }); await p.close(); }
  await b.close(); })();""")
    subprocess.run(["node", str(script), json.dumps(jobs)], check=True)


def ff(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def segment(out, src, start, dur, shape, over, fg=True, dark=0.3):
    """A stretch of a recording in a shape: the band of play over its own blur, an overlay on top, faded in and out."""
    w, h = SHAPES[shape]
    pic = (f"[0:v]{BAND},fps={FPS},split[a][b];[a]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},"
           f"boxblur=40:3,eq=brightness=-{dark}[bg];")
    pic += f"[b]scale={w}:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[v];" if fg else "[b]nullsink;[bg]null[v];"
    pic += f"[v][1:v]overlay=0:0,fade=in:st=0:d={FADE},fade=out:st={dur - FADE}:d={FADE},format=yuv420p"
    ff("-ss", str(start), "-t", str(dur), "-i", str(src), "-loop", "1", "-t", str(dur), "-i", str(over),
       "-filter_complex", pic, "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-r", str(FPS), str(out))


def trailer(shape, lang):
    parts = []
    parts.append(work / f"{shape}-{lang}-0.mp4"); segment(parts[-1], SRC / "lux.mp4", 1.0, 2.5, shape, work / f"{shape}-{lang}-title.png", fg=False, dark=0.4)
    for i, lv in enumerate(LEVELS):
        parts.append(work / f"{shape}-{lang}-{i + 1}.mp4")
        segment(parts[-1], SRC / f"{lv[0]}.mp4", lv[1], SEG, shape, work / f"{shape}-{lang}-{lv[0]}.png")
    parts.append(work / f"{shape}-{lang}-end.mp4"); segment(parts[-1], SRC / "abyssus.mp4", 8.0, 4.0, shape, work / f"{shape}-{lang}-end.png", fg=False, dark=0.4)
    (work / f"{shape}-{lang}.txt").write_text("".join(f"file '{p}'\n" for p in parts))
    total = 2.5 + SEG * len(LEVELS) + 4.0
    out = OUT / f"limbus-trailer-{lang}-{'16x9' if shape == 'h' else '9x16'}.mp4"
    ff("-f", "concat", "-safe", "0", "-i", str(work / f"{shape}-{lang}.txt"), "-ss", str(MUSIC_AT), "-t", str(total), "-i", str(MUSIC),
       "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-af", f"afade=t=in:d=0.8,afade=t=out:st={total - 2.5}:d=2.5",
       "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out))
    print(out, f"{out.stat().st_size / 1e6:.1f} MB")


overlays()
for shape in SHAPES:
    for lang in WORDS:
        trailer(shape, lang)
