#!/usr/bin/env python3
"""Build rails/index.html: the game source with every track from music/ embedded as base64.

The page then works as a single file (offline, from disk, or as a hosted artifact).
A track is addressed in the code by its file stem, e.g. music/seer_vahl.mp3 -> musicBytes("seer_vahl").
"""
import base64
import pathlib

root = pathlib.Path(__file__).resolve().parent
page = (root / "src" / "game.html").read_text(encoding="utf-8").rstrip("\n") + "\n"
for track in sorted((root / "music").glob("*.mp3")):
    data = base64.b64encode(track.read_bytes()).decode("ascii")
    page += f'<script type="application/octet-stream" id="music-{track.stem}">{data}</script>\n'
(root / "index.html").write_text(page, encoding="utf-8")
print(f"index.html: {len(page) / 1e6:.1f} MB")
