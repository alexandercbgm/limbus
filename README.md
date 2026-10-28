# Limbus

![three.js](https://img.shields.io/badge/three.js-r128-000000?logo=threedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-one%20HTML%20file-F7DF1E?logo=javascript&logoColor=black)
![Telegram](https://img.shields.io/badge/Telegram-Mini%20App%20%2B%20Stars-26A5E4?logo=telegram&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20KV-F38020?logo=cloudflare&logoColor=white)
![Android](https://img.shields.io/badge/Android-WebView%20APK-3DDC84?logo=android&logoColor=white)
![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-auto%20deploy-222222?logo=githubpages&logoColor=white)

A Smash Hit style rail shooter. A cart with a railgun rides between **Light** and **Dark** through glass halls;
you fire steel balls at the glass before you crash into it. Eleven levels lie on a metro-like scheme, each with
its own track, look, obstacles and 20-second finale.

**Play:** <https://alexandercbgm.github.io/limbus/> (the Telegram build, also opens in any browser) ·
the bot's Mini App in Telegram · `android/limbus.apk` on a phone · `index.html` straight from disk.

The game speaks Russian and English (the globe button on the scheme).

## Architecture

```mermaid
graph TD
    SRC[src/game.html<br/>the whole game: HTML + CSS + JS]
    BUILD[build.py]

    SRC --> BUILD
    THREE[(three.js r128)] --> BUILD
    FONTS[(fonts/<br/>Unbounded · Manrope · JetBrains Mono)] --> BUILD
    MUSIC[(music/*.mp3<br/>11 tracks)] --> BUILD
    MINIS[(minis/<br/>shots + clips of every level)] --> BUILD

    BUILD -- "python3 build.py" --> PAGE[index.html<br/>one self-contained file]
    BUILD -- "--telegram" --> TG[dist/telegram/<br/>Mini App, music + clips beside it]
    BUILD -- "--no-music" --> APK[android/build_apk.sh<br/>limbus.apk]
    BUILD -- "--no-music" --> AAB[android/build_aab.sh · Gradle<br/>limbus.aab for Google Play]

    TG -- "GitHub Actions<br/>every push to main" --> PAGES[GitHub Pages]
    PAGES --> MINI[Telegram Mini App]
    MINI <-- "initData · invoices · codes" --> WORKER[Cloudflare Worker<br/>bot/worker.js]
    WORKER <--> KV[(KV: USERS<br/>players · codes · broadcast job)]
    WORKER <--> BOTAPI[(Telegram Bot API)]
    PAGE -. "Buy in Telegram · redeem code" .-> WORKER
    APK -. "Buy in Telegram · redeem code" .-> WORKER

    classDef core fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#000;
    classDef asset fill:#e8f5e9,stroke:#388e3c,stroke-width:2px,color:#000;
    classDef target fill:#fff3e0,stroke:#f57c00,stroke-width:2px,color:#000;
    classDef external fill:#e1f5fe,stroke:#0288d1,stroke-width:2px,color:#000;
    classDef server fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#000;

    class SRC,BUILD core;
    class THREE,FONTS,MUSIC,MINIS asset;
    class PAGE,TG,APK,AAB target;
    class PAGES,MINI,BOTAPI external;
    class WORKER,KV server;
```

One source file, `src/game.html`, holds the whole game. `build.py` turns it into three builds: a single
self-contained page, the Telegram Mini App (published on GitHub Pages by `.github/workflows/pages.yml`), and the
page the Android app wraps. The bot's server is a Cloudflare Worker: it greets players, relays support messages,
sells crystal packs for Telegram Stars and sends level news.

## The scheme

Levels are stations on a metro-like map. A station opens once the one before it on its line is finished; dead-end branches charge a fare
in crystals each ride, and the depot charges a one-time entry.

```mermaid
graph LR
    EMP{{Emptio<br/>crystal shop}}
    INI((I · Initium<br/>Начало))
    VIT((II · Vitrum<br/>Стекло))
    LAB((III · Labyrinthus<br/>Лабиринт))
    TAO((V · Tao<br/>Дао))
    NOX((V·b · Nox<br/>Тьма))
    LUX((VI · Lux<br/>Свет))
    RUB((II·b · Rubinus<br/>Рубин))
    SPE((IV · Speculum<br/>Зеркало))
    HOR[III·a · Hortus<br/>Сад · fare 15]
    ARM[II·a · Armamentarium<br/>Арсенал · entry 15]
    THE[I·a · Thesaurus<br/>Сокровищница · fare 20]
    CAR[V·a · Carcer<br/>Темница · fare 30]

    INI -.- EMP
    INI --- VIT
    VIT --- LAB --- TAO
    TAO ==> NOX ==> LUX
    VIT --- RUB --- SPE
    INI --- HOR --- ARM
    RUB --- THE
    SPE --- CAR

    classDef main fill:#e3f2fd,stroke:#1e6a8d,stroke-width:2px,color:#000;
    classDef upper fill:#e8f5e9,stroke:#2e9a6e,stroke-width:2px,color:#000;
    classDef tao fill:#fbe9e7,stroke:#d0662b,stroke-width:2px,color:#000;
    classDef branch fill:#ede7f6,stroke:#9b84d0,stroke-width:2px,color:#000;
    classDef gold fill:#fff8e1,stroke:#c9a02e,stroke-width:2px,color:#000;

    class INI,VIT,RUB,SPE main;
    class LAB upper;
    class TAO,NOX,LUX tao;
    class HOR,ARM,THE,CAR branch;
    class EMP gold;
```

Two lines leave Vitrum: the lower through Rubinus to Speculum, the upper through Labyrinthus to Tao, from where
the Way of Tao leads through Nox to Lux. The lilac dead ends hang below the line; Emptio, the gold branch up from
Initium, is the crystal shop.

| № | Station | | Track | Finale | Entry |
|---|---|---|---|---|---|
| I | Initium | Начало | `seer_vahl` | Iudicium | — |
| I·a | Thesaurus | Сокровищница | `luminous_glass` | Pluvia | fare ◆ 20 |
| II | Vitrum | Стекло | `perfect_alignment` | Ruina | — |
| II·a | Armamentarium | Арсенал | — (the depot) | — | ◆ 15 once |
| II·b | Rubinus | Рубин | `through_the_glass_maze` | Tessera | — |
| III | Labyrinthus | Лабиринт | `calculated_descent` | Portae | — |
| III·a | Hortus | Сад | `glass_horizon` | Vindemia | fare ◆ 15 |
| IV | Speculum | Зеркало | `luminous_path` | Reflexio | — |
| V | Tao | Дао | `translucent_corridor` | Taiji | — |
| V·a | Carcer | Темница | `refraction_point` | Custodes | fare ◆ 30 |
| V·b | Nox | Тьма | `through_the_glass_corridor` | Rota | — |
| VI | Lux | Свет | `translucent_path` | Triumphus | — |

A station's sheet shows a clip of its level (`minis/<id>.mp4`), its features, conditions and best score.

## A ride

```mermaid
stateDiagram-v2
    [*] --> Scheme
    Scheme --> Sheet: tap a station
    Sheet --> Scheme: Back
    Sheet --> Ride: Ride (fare paid, if any)
    Ride --> Finale: end of the run
    Ride --> Over: out of balls
    Finale --> Station: 20 s, own rules
    Station --> Scheme: crystals → bank
    Over --> Ride: Retry
    Over --> Scheme: to the scheme
    note right of Over
        every 3rd failure in a row
        a reminder points to Armamentarium
    end note
```

The cart rolls on by itself. Tap or click to fire (Space fires at the centre). Balls are ammunition and life:
blue crystals give more, crashing into glass takes some away.

```mermaid
flowchart LR
    HIT[Hits and points] -->|lift| LIGHT[☀ Light<br/>brighter world, fewer obstacles,<br/>blue crystals often · hard climb]
    DMG[Damage] -->|drag| DARK[☾ Dark<br/>spikes, crystal imps, red decoys<br/>· blue crystals rarer but worth<br/>almost twice the balls and two in the bank]
    LIGHT <--> BAR{{the Light–Dark bar}} <--> DARK
```

## Armamentarium and Emptio

Crystals banked on finished levels pay fares and buy cannons and upgrades at the depot.

| Cannon | | Balls a shot | Price ◆ | What it does |
|---|---|---|---|---|
| Ballista | Рельсотрон | 1 | free | one ball; a crystal pays its value |
| Triplex | Тройник | 3 | 60 | three balls in a triangle; a crystal pays for each that hits |
| Gemini | Близнецы | 2 | 90 | a second cannon: a pair; both hit — double pay |
| Lumen | Луч | 2 | 140 | an instant laser through every pane on its line |
| Ferrum | Железо | 2 | not sold | freed in Carcer: an iron shot that goes through glass |

| Upgrade | | Per level | Levels ◆ |
|---|---|---|---|
| Copia | Запас | +10 balls at the start | 40 · 80 · 140 |
| Spiritus | Второе дыхание | go on once with +10 balls | 30 · 60 · 110 |
| Largitas | Щедрость | +1 ball per blue-crystal hit | 50 · 100 · 160 |

Emptio sells crystal packs for Telegram Stars, each with a 25% bonus over what it covers:

```mermaid
sequenceDiagram
    autonumber
    participant P as Player
    participant G as Game
    participant W as Worker
    participant T as Telegram

    alt in Telegram
        P->>G: a pack at Emptio
        G->>W: POST /invoice {product, lang}
        W->>T: createInvoiceLink (XTR)
        T-->>G: link → openInvoice
        P->>T: pays in Stars
        T-->>G: "paid" → crystals to the bank
    else in the APK or a browser
        P->>G: Buy in Telegram
        G->>T: t.me/<bot>?start=apk
        T->>W: /start apk → invoice
        P->>T: pays in Stars
        T->>W: successful_payment
        W-->>P: an 8-letter code (kept in KV for a year)
        P->>G: enters the code
        G->>W: POST /redeem {code}
        W-->>G: crystals (the code is spent)
    end
```

| Pack | Covers | Crystals | Stars |
|---|---|---|---|
| Armoury I | depot entry + first level of all three upgrades | 170 | 40 |
| Armoury II | second level of all three upgrades | 300 | 70 |
| Armoury III | third level of all three upgrades | 515 | 110 |
| Cannons | depot entry, Triplex, Gemini, Lumen | 385 | 90 |
| Everything | all of the above (1075 ◆) | 1345 | 200 |

## Builds

| Command | Output | Music | Clips | Where it goes |
|---|---|---|---|---|
| `python3 build.py` | `index.html` | inline, 56 kbps MP3 | inline | open from disk; the artifact |
| `python3 build.py --telegram` | `dist/telegram/` | beside it, 96 kbps | beside it | GitHub Pages → Telegram Mini App |
| `python3 build.py --no-music` | `index.html` | `music/` at full quality | inline | inside the APK |
| `ANDROID_HOME=… android/build_apk.sh` | `android/limbus.apk` | `assets/music/` | inline | Android phones |
| `ANDROID_HOME=… android/build_aab.sh` | `android/limbus.aab` | `assets/music/` | inline | Google Play (the shop pays through Google Play) |

three.js and the fonts are inlined into every build, so offline copies look and run as the page does online.
The APK needs `platforms;android-36`, `build-tools;36.0.0` and a JDK (no Gradle); the bundle is built by Gradle (`android/play-gradle/`), as Google Play's billing library comes with dependencies of its own; it is a full-screen landscape
WebView that hands external links to the system.

In Telegram the game goes full screen, keeps clear of Telegram's bar, answers its back button, starts in the
user's language and keeps the progress in the bot's cloud as well (the newer copy wins).

## The bot

`bot/worker.js` is the bot's server for Cloudflare Workers; setup steps are in [`bot/README.md`](bot/README.md).

```mermaid
graph LR
    U[Player] -- "/start /play /buy /support /language" --> TGW[/tg webhook/]
    O[Owner] -- "/broadcast level text · /stats · /cancel" --> TGW
    TGW --> W[Worker]
    G[Game] -- "/hello · /invoice · /redeem · /bot" --> W
    CRON[Cron · every minute] -- "~45 messages a run" --> W
    W <--> KV[(KV: USERS)]
    W -- "support messages, payments" --> O
    W -- "news: level picture + Play button" --> U
```

| Endpoint | What it does |
|---|---|
| `POST /tg` | Telegram webhook (checked by `WEBHOOK_SECRET`) |
| `POST /hello` | the Mini App reports a player (initData checked by HMAC) |
| `POST /invoice` | an invoice link for a pack |
| `POST /redeem` | spends a code bought outside Telegram |
| `GET /bot` | the bot's username, for the APK and browser link |
| `GET /setup?key=…` | sets the webhook, the command menu and the Play button |

## Repository layout

```
README.md
build.py                 — builds index.html, dist/telegram/ and the APK's page (see "Builds")
VERSION                  — the game's version, the same in every build: shown under the scheme, the Android builds'
                           versionName (their versionCode made from it: 1.2.3 -> 10203); raise it for each release
index.html               — the built single-file game
src/
  game.html                — the whole game: scheme, sheets, levels, physics, sound, shop, Telegram glue
music/                   — the level tracks, addressed by file stem (seer_vahl, perfect_alignment, …)
minis/                   — per level: <id>.jpg (shot, light and dark halves, also the bot's news picture),
                           <id>.mp4 (the clip in its sheet), <id>.clip.jpg (the clip's first frame) and
                           <id>.bot.mp4 (a 16:9 cut of the clip for the bot's greeting and news);
                           menu.bg.mp4 and .jpg: the menu's background, a 3 s loop of the rails, blurred beforehand
fonts/                   — Unbounded, Manrope, JetBrains Mono (SIL OFL), latin + cyrillic woff2, fonts.css
android/
  build_apk.sh             — builds and signs limbus.apk without Gradle
  build_aab.sh             — builds the Google Play bundle with Gradle, signed with the upload key (kept out of git)
  play-src/PlayBilling.java — Google Play's billing for the crystal shop, in the bundle only
  play-gradle/             — the Gradle project for the bundle
  GOOGLE_PLAY.md           — everything for the Play Console: package name, forms, texts, graphics
  play/                    — the store listing's icon, feature graphic and screenshots
  src/…/MainActivity.java  — the full-screen WebView
  three.min.js             — three.js r128, bundled so everything runs offline
telegram/
  bot-api.txt              — the Worker's address, injected into every build
  avatar.png · cover.png   — the bot's picture and the /newapp cover
bot/
  worker.js                — the bot's server (Cloudflare Worker)
  README.md                — setup steps, broadcasts, packs
tools/
  shoot-minis.js           — shoots every level in the light and the dark (Playwright)
  compose-minis.py         — joins the shots into minis/<id>.jpg
  telegram-art.py          — draws the bot's avatar and cover
  trailer.py               — cuts the trailers (16:9 and 9:16, Russian and English) from the level recordings
.github/workflows/
  pages.yml                — builds the Telegram build and publishes it on Pages
```

## Development

- Open `index.html` (or serve the folder) in a browser. `#all` in the URL opens every built station for testing.
- `?level=vitrum` (or `startapp=vitrum` in Telegram) opens that station's sheet.
- `window.__rails` holds test hooks: start a level, jump along the track, set balls, place obstacles, read state.
- A station clip: put `minis/<id>.mp4` (640 px wide, no sound, letterbox cut away) and its first frame as
  `minis/<id>.clip.jpg`; the build picks them up.
