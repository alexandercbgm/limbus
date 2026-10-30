#!/usr/bin/env python3
"""Build rails/index.html: the game source with every track from music/ embedded as base64.

The page then works as a single file (offline, from disk, or as a hosted artifact): three.js is inlined as well.
A track is addressed in the code by its file stem, e.g. music/glass_perspective.mp3 -> musicBytes("glass_perspective").

To keep the page under the 16 MB artifact limit, tracks are re-encoded to MP3 at 56 kbps with ffmpeg before
embedding (cached in .build/, the originals in music/ stay untouched). MP3 rather than AAC or Opus because every
browser decodes it. Without ffmpeg the MP3s go in as they are.

With --no-music the tracks are left out: the page then loads music/<stem>.mp3 next to it at full quality
(the Android app ships them as files).

With --telegram it builds dist/telegram/, the Telegram Mini App served by GitHub Pages: the page without its music
and with Telegram's telegram-web-app.js, the tracks beside it in music/ (re-encoded to 96 kbps when ffmpeg is there),
so the first load is small and each track comes in with its level.
"""
import base64
import pathlib
import re
import shutil
import subprocess
import sys

BITRATE = "56k"
root = pathlib.Path(__file__).resolve().parent
cache = root / ".build"
ffmpeg = shutil.which("ffmpeg")


def embedded(track):
    """The bytes to embed for a track and their media type."""
    if not ffmpeg:
        return track.read_bytes(), "audio/mpeg"
    cache.mkdir(exist_ok=True)
    out = cache / f"{track.stem}-{BITRATE}.mp3"
    if not out.exists() or out.stat().st_mtime < track.stat().st_mtime:
        subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", str(track), "-map", "0:a", "-c:a", "libmp3lame",
                        "-b:a", BITRATE, "-ar", "44100", str(out)], check=True)
    return out.read_bytes(), "audio/mpeg"


page = (root / "src" / "game.html").read_text(encoding="utf-8").rstrip("\n") + "\n"
# three.js goes in inline too, so a saved or exported copy of the page runs where the CDN can't be reached
THREE_TAG = '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
three = (root / "android" / "three.min.js").read_text(encoding="utf-8")
assert THREE_TAG in page and "</script" not in three
page = page.replace(THREE_TAG, "<script>" + three + "</script>")
# the fonts go in inline as well (fonts/: latin and cyrillic woff2 from Google Fonts), so the APK and an offline copy
# look as the page does online, instead of falling back to the system's fonts
FONT_LINKS = re.compile(r'<link rel="preconnect" href="https://fonts\.g[^>]*>\n|<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n')
faces = re.sub(r"url\(([^)]+)\)", lambda m: "url(data:font/woff2;base64," + base64.b64encode((root / "fonts" / m.group(1)).read_bytes()).decode("ascii") + ")",
               (root / "fonts" / "fonts.css").read_text(encoding="utf-8"))
assert len(FONT_LINKS.findall(page)) == 3
page = FONT_LINKS.sub("", page, count=2)
page = FONT_LINKS.sub("<style>" + faces + "</style>\n", page, count=1)
# the game's version, one for every build (the page shows it under the scheme; the Android builds take it as versionName)
VERSION = (root / "VERSION").read_text().strip()
page = page.replace("__LIMBUS_VERSION__", VERSION)
TELEGRAM = "--telegram" in sys.argv
# the bot's server (bot/worker.js), once it is deployed: its address in telegram/bot-api.txt, known to every build
api = root / "telegram" / "bot-api.txt"
if api.exists() and api.read_text().strip():
    page = page.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<script>window.LIMBUS_BOT_API = "' + api.read_text().strip() + '"</script>\n', 1)
if TELEGRAM:
    page = page.replace("<script>", '<script src="https://telegram.org/js/telegram-web-app.js"></script>\n<script>', 1)
    page = page.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<script>document.documentElement.classList.add("tgbuild")</script>\n', 1)

for track in [] if "--no-music" in sys.argv or TELEGRAM else sorted((root / "music").glob("*.mp3")):
    raw, kind = embedded(track)
    data = base64.b64encode(raw).decode("ascii")
    page += f'<script type="application/octet-stream" id="music-{track.stem}" data-type="{kind}">{data}</script>\n'
# shots of each level for the station sheets (minis/<level id>.jpg, light half and dark half)
for shot in sorted(f for f in (root / "minis").glob("*.jpg") if "." not in f.stem): # <id>.clip.jpg is a clip's first frame
    data = base64.b64encode(shot.read_bytes()).decode("ascii")
    page += f'<img hidden alt="" id="mini-{shot.stem}" src="data:image/jpeg;base64,{data}">\n'
# clips of a level that play in its sheet in place of the shot (minis/<level id>.mp4): inline in the one-file page, beside it in the Telegram build
for clip in sorted(f for f in (root / "minis").glob("*.mp4") if "." not in f.stem): # <id>.bot.mp4 is the bot's 16:9 cut, served beside the Telegram build only
    src = f"minis/{clip.name}" if TELEGRAM else "data:video/mp4;base64," + base64.b64encode(clip.read_bytes()).decode("ascii")
    page += f'<script type="text/plain" id="clip-{clip.stem}">{src}</script>\n'
    poster = clip.with_suffix(".clip.jpg") # its first frame, decoded with the page and drawn at once while the clip starts
    if poster.exists():
        page += f'<img hidden alt="" id="poster-{clip.stem}" src="data:image/jpeg;base64,{base64.b64encode(poster.read_bytes()).decode("ascii")}">\n'
# the scheme's background: a short loop of the rails, blurred beforehand (minis/menu.bg.mp4, small, inline in every build) and
# its first frame, so the menu needs no live 3D behind it
bg = root / "minis" / "menu.bg.mp4"
if bg.exists():
    page += f'<script type="text/plain" id="menubg">data:video/mp4;base64,{base64.b64encode(bg.read_bytes()).decode("ascii")}</script>\n'
    page += f'<img hidden alt="" id="menubg-poster" src="data:image/jpeg;base64,{base64.b64encode(bg.with_suffix(".jpg").read_bytes()).decode("ascii")}">\n'
night = root / "minis" / "menu.night.mp4" # the night theme's loop: a neon grid and glass shards flying out (tools/menu_night.js)
if night.exists():
    page += f'<script type="text/plain" id="menubg-night">data:video/mp4;base64,{base64.b64encode(night.read_bytes()).decode("ascii")}</script>\n'
    page += f'<img hidden alt="" id="menubg-night-poster" src="data:image/jpeg;base64,{base64.b64encode(night.with_suffix(".jpg").read_bytes()).decode("ascii")}">\n'
if TELEGRAM:
    out = root / "dist" / "telegram"
    shutil.rmtree(out, ignore_errors=True)
    (out / "music").mkdir(parents=True)
    (out / "index.html").write_text(page, encoding="utf-8")
    for track in sorted((root / "music").glob("*.mp3")):
        if ffmpeg:
            subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", str(track), "-map", "0:a", "-c:a", "libmp3lame",
                            "-b:a", "96k", "-ar", "44100", str(out / "music" / track.name)], check=True)
        else:
            shutil.copy(track, out / "music" / track.name)
    shutil.copytree(root / "minis", out / "minis") # the bot sends a level's picture with its news
    shutil.copy(root / "telegram" / "privacy.html", out / "privacy.html") # the privacy policy Google Play links to
    (out / ".nojekyll").write_text("")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"dist/telegram: page {len(page) / 1e6:.1f} MB, {size / 1e6:.1f} MB in all")
else:
    (root / "index.html").write_text(page, encoding="utf-8")
    print(f"index.html: {len(page) / 1e6:.1f} MB")
