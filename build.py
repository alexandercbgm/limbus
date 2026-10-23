#!/usr/bin/env python3
"""Build rails/index.html: the game source with every track from music/ embedded as base64.

The page then works as a single file (offline, from disk, or as a hosted artifact): three.js is inlined as well.
A track is addressed in the code by its file stem, e.g. music/seer_vahl.mp3 -> musicBytes("seer_vahl").

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
TELEGRAM = "--telegram" in sys.argv
if TELEGRAM:
    page = page.replace("<script>", '<script src="https://telegram.org/js/telegram-web-app.js"></script>\n<script>', 1)
    page = page.replace('<meta charset="utf-8">\n', '<meta charset="utf-8">\n<script>document.documentElement.classList.add("tgbuild")</script>\n', 1)
for track in [] if "--no-music" in sys.argv or TELEGRAM else sorted((root / "music").glob("*.mp3")):
    raw, kind = embedded(track)
    data = base64.b64encode(raw).decode("ascii")
    page += f'<script type="application/octet-stream" id="music-{track.stem}" data-type="{kind}">{data}</script>\n'
# shots of each level for the station sheets (minis/<level id>.jpg, light half and dark half)
for shot in sorted((root / "minis").glob("*.jpg")):
    data = base64.b64encode(shot.read_bytes()).decode("ascii")
    page += f'<img hidden alt="" id="mini-{shot.stem}" src="data:image/jpeg;base64,{data}">\n'
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
    (out / ".nojekyll").write_text("")
    size = sum(f.stat().st_size for f in out.rglob("*") if f.is_file())
    print(f"dist/telegram: page {len(page) / 1e6:.1f} MB, {size / 1e6:.1f} MB in all")
else:
    (root / "index.html").write_text(page, encoding="utf-8")
    print(f"index.html: {len(page) / 1e6:.1f} MB")
