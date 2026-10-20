#!/usr/bin/env python3
"""Build rails/index.html: the game source with every track from music/ embedded as base64.

The page then works as a single file (offline, from disk, or as a hosted artifact).
A track is addressed in the code by its file stem, e.g. music/seer_vahl.mp3 -> musicBytes("seer_vahl").

To keep the page under the 16 MB artifact limit, tracks are re-encoded to 112 kbps with ffmpeg before
embedding (cached in .build/, the originals in music/ stay untouched). Without ffmpeg they go in as they are.
"""
import base64
import pathlib
import shutil
import subprocess

BITRATE = "112k"
root = pathlib.Path(__file__).resolve().parent
cache = root / ".build"
ffmpeg = shutil.which("ffmpeg")


def embedded(track):
    if not ffmpeg:
        return track.read_bytes()
    cache.mkdir(exist_ok=True)
    out = cache / f"{track.stem}-{BITRATE}.mp3"
    if not out.exists() or out.stat().st_mtime < track.stat().st_mtime:
        subprocess.run([ffmpeg, "-loglevel", "error", "-y", "-i", str(track), "-map", "0:a", "-c:a", "libmp3lame",
                        "-b:a", BITRATE, "-ar", "44100", str(out)], check=True)
    return out.read_bytes()


page = (root / "src" / "game.html").read_text(encoding="utf-8").rstrip("\n") + "\n"
for track in sorted((root / "music").glob("*.mp3")):
    data = base64.b64encode(embedded(track)).decode("ascii")
    page += f'<script type="application/octet-stream" id="music-{track.stem}">{data}</script>\n'
(root / "index.html").write_text(page, encoding="utf-8")
print(f"index.html: {len(page) / 1e6:.1f} MB")
