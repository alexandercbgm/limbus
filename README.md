# Limbus

A Smash Hit style rail shooter: a cart with a railgun rides between Light and Darkness.

- `src/game.html` is the game source (Three.js r128 from cdnjs, everything else inline).
- `music/*.mp3` are the level tracks; a track is referenced by its file stem (`seer_vahl`, `perfect_alignment`, `luminous_glass`, `calculated_descent`, `luminous_path`, `glass_horizon`, `through_the_glass_corridor`, `refraction_point`, `translucent_path`, `through_the_glass_maze`, `translucent_corridor`). The build re-encodes them to MP3 at 56 kbps with ffmpeg (cached in `.build/`), so the page stays under the 16 MB artifact limit. The menu plays the first level's track, then the last level run.
- The game speaks Russian and English (the globe button on the scheme; English to begin with).
- `python3 build.py` writes `index.html`: the source with every track embedded as base64, so the game is one file.

Open `index.html` in a browser. Add `#all` to the URL to open every built station for testing.
- `minis/<level>.jpg` are the station sheets' miniatures (shots of the level, light and dark), embedded by the build; `tools/shoot-minis.js` and `tools/compose-minis.py` remake them.
- `android/` wraps the built page in a full-screen landscape WebView app; `ANDROID_HOME=… android/build_apk.sh` makes `android/limbus.apk` (needs `platforms;android-34`, `build-tools;35.0.0` and a JDK, no Gradle). three.js is bundled there so the app works offline, and the tracks go in as they are (192 kbps files in `assets/music/`, built with `build.py --no-music`).
- Telegram: `python3 build.py --telegram` makes `dist/telegram/`, the page as a Telegram Mini App (with `telegram-web-app.js`, the tracks beside it in `music/`). `.github/workflows/pages.yml` builds it and publishes it on GitHub Pages at every push to `main`; the bot's Mini App points at that address. In Telegram the game goes full screen, keeps clear of Telegram's bar, answers its back button, starts in the user's language and keeps the progress in the bot's cloud as well. The bot's art is in `telegram/` (`avatar.png` 640×640 for the bot's picture, `cover.png` 640×360 for `/newapp`), drawn by `tools/telegram-art.py`.
- Fonts: Unbounded, Manrope and JetBrains Mono (SIL Open Font License), latin and cyrillic, are kept in `fonts/` and inlined into every build, so the APK and offline copies look as the page does online.
- `bot/`: the Telegram bot's server for Cloudflare Workers (start, support relay, Stars donations, level news broadcasts); setup steps in `bot/README.md`. Once deployed, its address goes in `telegram/bot-api.txt` and the Telegram build reports players to it. A `?level=vitrum` or `startapp=vitrum` link opens that station's sheet.
