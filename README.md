# Limbus

A Smash Hit style rail shooter: a cart with a railgun rides between Light and Darkness.

- `src/game.html` is the game source (Three.js r128 from cdnjs, everything else inline).
- `music/*.mp3` are the level tracks; a track is referenced by its file stem (`seer_vahl`, `perfect_alignment`, `luminous_glass`, `calculated_descent`, `luminous_path`). The build re-encodes them to 128 kbps with ffmpeg (cached in `.build/`), so the page stays under the 16 MB artifact limit.
- `python3 build.py` writes `index.html`: the source with every track embedded as base64, so the game is one file.

Open `index.html` in a browser. Add `#all` to the URL to open every built station for testing.
