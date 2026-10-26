# Посты «Я сделал игру»

К каждому посту прикладывайте трейлер: горизонтальный (`limbus-trailer-*-16x9.mp4`) для Pikabu, Habr, VK и Reddit, вертикальный (`*-9x16.mp4`) для сторис, Shorts и Reels. Места в [квадратных скобках] заполните сами: это ваша история, я её не знаю.

Главная ссылка везде одна, бот: <https://t.me/limbus_game_bot>. Он работает и в Telegram на компьютере. Ссылку на Google Play добавьте, когда игра выйдет из закрытого теста.

---

## Pikabu

**Заголовок:** Сделал рельсовый шутер, в который играют прямо в Telegram

**Теги:** моё, игры, разработка игр, инди, telegram, gamedev

**Текст:**

Привет, Пикабу! [Сколько времени] я делал игру Limbus и наконец могу её показать.

Это рельсовый шутер: вагонетка мчится сама, а вы стреляете стальными шарами по стеклу на пути. Шары — это и патроны, и жизнь: голубые кристаллы дают новые, удары о стекло отнимают.

Главная идея — Свет и Тьма. Очки поднимают к Свету: мир светлеет, препятствий меньше, но подняться трудно. Ошибки тянут во Тьму: шипы, чёрно-красные кристаллы и ловушки, зато каждый голубой кристалл там стоит почти вдвое больше. Так что иногда выгодно специально нырнуть во Тьму.

Что внутри:
- 11 уровней на схеме, как в метро, с тупиковыми ветками;
- у каждого уровня своя музыка и свой финал на 20 секунд со своими правилами;
- тараны на цепях, молоты-мельницы, лазерные вертушки, шестерни;
- Арсенал из пушек и улучшений, кристаллы на них зарабатываются в игре.

Рекламы нет. Ничего скачивать не нужно: игра открывается прямо в Telegram, на телефоне и на компьютере.

Сыграть: https://t.me/limbus_game_bot

Наденьте наушники, музыка тут — половина игры. Буду рад любой критике в комментариях, особенно о сложности: я её настраивал на себе.

[трейлер]

---

## Habr

На Хабре чисто рекламный пост снимут или заминусуют: нужна техническая статья. Подходящий хаб для рассказа о своём проекте — «Я пиарюсь», а с технической частью можно в «Разработка игр», «WebGL», «JavaScript».

**Заголовок:** Как я сделал 3D-игру для Telegram одним HTML-файлом: three.js, Mini Apps и Android-обёртка

**План статьи:**

1. **Что за игра.** Рельсовый шутер Limbus, два абзаца из поста для Pikabu и трейлер.
2. **Почему Telegram Mini App.** Не нужно устанавливать, игроки уже в Telegram, оплата через Telegram Stars без своего платёжного шлюза.
3. **Вся игра — один HTML-файл.** three.js r128, процедурная геометрия уровней, музыка и клипы подключаются при сборке (`build.py`). Плюсы и минусы такого подхода.
4. **Свет и Тьма как механика.** Одна шкала кармы меняет и правила (препятствия, цена кристаллов), и картинку (освещение, цвета мира).
5. **Подводные камни Telegram.**
   - полноэкранный режим и безопасные зоны (`safeAreaInset`, `contentSafeAreaInset`);
   - горизонтальная ориентация на телефоне (`lockOrientation`);
   - первое касание на Android, которое съедает система;
   - кэш файлов по URL в Bot API (отсюда `?v=` в ссылках).
6. **Бот на Cloudflare Workers.** Приветствие с клипом уровня, рассылки новостей по cron, хранение в KV, бесплатный тариф.
7. **Android.** WebView-обёртка, Google Play Billing, сборка AAB через Gradle, требование 12 тестировщиков на 14 дней для новых аккаунтов.
8. **Что дальше.** Ссылка на бота, просьба об отзывах.

Хабр в 2025–2026 годах строго относится к текстам, написанным нейросетью. Если код или тексты делались с ИИ, лучше прямо сказать об этом в статье и написать её своими словами.

---

## VK

**Текст:**

Я сделал игру! 🎮

Limbus — рельсовый шутер между Светом и Тьмой. Вагонетка мчится сама, а вы разбиваете стекло на пути стальными шарами. Набираете очки — поднимаетесь к Свету, ошибаетесь — падаете во Тьму, где опаснее, но кристаллы ценнее.

11 уровней, у каждого своя музыка и свой финал. Без рекламы, играется прямо в Telegram, ничего скачивать не надо.

👉 https://t.me/limbus_game_bot

Буду рад, если попробуете и напишете, как вам 🙌

[трейлер]

---

## Reddit — r/WebGames

**Внимание:** r/WebGames принимает только игры, в которые можно сыграть прямо в браузере, без скачивания и регистрации. Ссылка на Telegram-бота туда не подходит. Нужна браузерная ссылка (например, страница на itch.io). Проверьте правила сабреддита перед публикацией.

**Title:** Limbus — a rail shooter between the Light and the Dark (browser, no ads)

**Body:**

The cart rushes on by itself, and you smash the glass in its way with steel balls. Balls are both your ammo and your life — blue crystals give more, crashing into glass takes some away.

Points lift you to the Light, where the world brightens and obstacles thin out. Mistakes drag you into the Dark, with spikes and decoys, but every crystal there is worth almost twice as much.

11 levels on a metro-like map, each with its own music and a 20-second finale with its own rules. Headphones recommended.

Play: [browser link]

Feedback on the difficulty is very welcome!

---

## Reddit — r/indiegaming

Видео загрузите прямо в пост (не ссылкой). Посты о своей игре здесь разрешены, но проверьте правила сабреддита: обычно не чаще раза в неделю и с флером о своей игре.

**Title:** I made a rail shooter where your mistakes drag you into the Dark — but the Dark pays better

**Body:**

Hi! This is Limbus, my [first] game. [A sentence about how long you've worked on it.]

The cart moves by itself, you shoot steel balls at the glass ahead. Balls are both ammo and life. A single Light–Dark meter changes both the rules and the look of the world — the Light is calmer, the Dark is dangerous but crystals there are worth almost double. So sometimes diving into the Dark on purpose is the right call.

- 11 levels, each with its own music and a 20-second finale with its own rules
- rams on chains, hammer mills, laser spinners, gears
- an armoury of cannons and upgrades, all earned in the game
- no ads

It runs right inside Telegram (phone or desktop): https://t.me/limbus_game_bot

I'd love to hear what you think, especially about the difficulty curve.

---

## Telegram-каналы об играх и инди-разработке

Админам каналов пишите в личку коротко и по-человечески. Массовая рассылка одинакового текста в десятки каналов — это спам, за неё Telegram ограничивает аккаунт.

**Сообщение админу:**

Здравствуйте! Я сделал игру для Telegram — Limbus, рельсовый шутер между Светом и Тьмой: 11 уровней, у каждого своя музыка, без рекламы. Возможно, она подойдёт вашему каналу. Прикладываю трейлер (40 секунд), сама игра: https://t.me/limbus_game_bot. Если интересно, могу ответить на вопросы или прислать скриншоты. Спасибо!

**Пост для канала (если попросят готовый текст):** тот же, что для VK.
