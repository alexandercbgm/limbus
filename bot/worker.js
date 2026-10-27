// The Limbus bot, as a Cloudflare Worker (plain JavaScript, no build step: paste it into the dashboard as it is).
//
// What it does:
//   /start            greets the player with a Play button and remembers them for the news
//   /stop             takes them off the news; /start puts them back
//   /support, text    a message to the bot goes on to the owner; the owner replies to it in the bot's chat and the
//                     reply goes back to the player, from the bot
//                     (the owner can try it out: after their own /support his next message goes the player's way)
//   crystal packs     sold for Stars at the game's Emptio station: in Telegram the game asks /invoice for a pack and adds
//                     its crystals when Telegram says it is paid; outside Telegram (the APK, the page) a ?start=apk link
//                     brings the player here, the bot sells the one pack and sends a code the game redeems at /redeem
//   /broadcast        owner only: "/broadcast vitrum Text…" sends every subscriber the level's picture, the text and a
//                     Play button that opens that very level; it goes out ~45 a minute (a free Worker may make only
//                     50 outside calls at a time), so a cron trigger carries it on; /stats, /cancel
//   POST /hello       the game, opened in Telegram, says who is playing (checked against the bot's token), so players
//                     who never wrote to the bot get the news too, once they have allowed it
//   POST /way         the game, opened in Telegram, says which station the player is up to on the way from Initium to Lux:
//                     /start offers that one
//   POST /invoice     the game asks for a pack's Stars invoice link, to show with Telegram.WebApp.openInvoice
//   POST /redeem      the APK or the page trades a code for its crystals, once
//   GET  /bot         the bot's username, for the Emptio station outside Telegram
//   GET  /setup       sets the bot's webhook, its commands and its menu button, once: /setup?key=WEBHOOK_SECRET
//
// Settings (Worker → Settings → Variables and Secrets):
//   BOT_TOKEN       secret: the token from @BotFather
//   WEBHOOK_SECRET  secret: any long random word; Telegram sends it with every update, and /setup asks for it
//   OWNER_ID        your Telegram user ID (a number; @userinfobot tells it): support messages and /broadcast
//   GAME_URL        https://alexandercbgm.github.io/limbus/
// And a KV namespace bound as USERS (Worker → Settings → Bindings → KV namespace).

// the bot's own version, apart from the game's (VERSION in the repository): /version tells it, a command left off the menu
const BOT_VERSION = "1.4.0";
const PER_RUN = 45; // messages a run may send: a free Worker may make 50 outside requests per run
// the crystal packs: the prices live here, not in the game. Each holds a quarter more than what it covers costs, for additions to come
const PACKS = {
  t1: { stars: 40, crystals: 170, ru: "Арсенал I", en: "Armoury I" },
  t2: { stars: 70, crystals: 300, ru: "Арсенал II", en: "Armoury II" },
  t3: { stars: 110, crystals: 515, ru: "Арсенал III", en: "Armoury III" },
  guns: { stars: 90, crystals: 385, ru: "Пушки", en: "Cannons" },
  all: { stars: 200, crystals: 1345, ru: "Всё сразу", en: "Everything" },
  apk: { stars: 200, crystals: 1345, ru: "Всё сразу — код для игры", en: "Everything: a code for the game" }, // ~$3; outside Telegram
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return cors(new Response(null, { status: 204 }));
    if (url.pathname === "/tg" && req.method === "POST") {
      if (req.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("no", { status: 403 });
      const upd = await req.json();
      ctx.waitUntil(onUpdate(upd, env).catch(e => console.log("update failed", e && e.stack || e)));
      return new Response("ok");
    }
    if (url.pathname === "/hello" && req.method === "POST") return cors(await hello(req, env));
    if (url.pathname === "/way" && req.method === "POST") return cors(await way(req, env));
    if (url.pathname === "/invoice" && req.method === "POST") return cors(await invoice(req, env));
    if (url.pathname === "/redeem" && req.method === "POST") return cors(await redeem(req, env));
    if (url.pathname === "/setup") return setup(url, env);
    if (url.pathname === "/bot") { const me = await tg(env, "getMe"); return cors(Response.json({ username: me.ok ? me.result.username : "" })); } // the Emptio station links to the bot from outside Telegram
    return new Response("Limbus bot");
  },
  // the cron trigger carries a broadcast on, a batch a minute
  async scheduled(ev, env, ctx) { ctx.waitUntil(runBroadcast(env)); },
};

// ---------- Telegram ----------
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}),
  });
  return r.json();
}
const ru = from => !from || !from.language_code || /^(ru|uk|be|kk)/.test(from.language_code);
const T = (from, r, e) => ru(from) ? r : e;
const gameUrl = (env, level) => env.GAME_URL + (level ? `?level=${encodeURIComponent(level)}` : "");
const playKb = (env, from, level) => ({ inline_keyboard: [[{ text: T(from, "Играть", "Play"), web_app: { url: gameUrl(env, level) } }]] });

async function remember(env, user, sub = true) {
  const key = "u:" + user.id, old = JSON.parse(await env.USERS.get(key) || "null");
  if (old && old.sub === sub) return; // nothing new: spare the KV's daily writes
  await env.USERS.put(key, JSON.stringify({ ...(old || {}), name: user.first_name || "", lang: user.language_code || "", sub, t: Date.now() })); // what else it keeps (the language chosen, the last clip, the trailer seen) stays
}

// a user as the bot speaks to them: the language they chose with /language over their Telegram's own
async function speaker(env, user) {
  const rec = JSON.parse(await env.USERS.get("u:" + user.id) || "null");
  return rec && rec.choice ? { ...user, language_code: rec.choice } : user;
}
// the commands under the input field and the Play button beside it, in a language: for everyone by default, or for one chat
const commands = r => r
  ? [{ command: "play", description: "Играть" }, { command: "buy", description: "Кристаллы для Арсенала" }, { command: "support", description: "Написать автору" }, { command: "language", description: "Язык" }]
  : [{ command: "play", description: "Play" }, { command: "buy", description: "Crystals for Armamentarium" }, { command: "support", description: "Write to the author" }, { command: "language", description: "Language" }];
const menuButton = (env, r) => ({ type: "web_app", text: r ? "Играть" : "Play", web_app: { url: env.GAME_URL } });
async function onButton(q, env) {
  const m = /^lang:(ru|en)$/.exec(q.data || "");
  if (!m || !q.message) return tg(env, "answerCallbackQuery", { callback_query_id: q.id });
  const key = "u:" + q.from.id, rec = JSON.parse(await env.USERS.get(key) || "null") || { name: q.from.first_name || "", lang: q.from.language_code || "", sub: true, t: Date.now() };
  await env.USERS.put(key, JSON.stringify({ ...rec, choice: m[1] }));
  const r = m[1] === "ru", chat = q.message.chat.id;
  await tg(env, "setMyCommands", { commands: commands(r), scope: { type: "chat", chat_id: chat } });
  await tg(env, "setChatMenuButton", { chat_id: chat, menu_button: menuButton(env, r) });
  await tg(env, "editMessageText", { chat_id: chat, message_id: q.message.message_id, text: r ? "Язык: русский. /language — сменить." : "Language: English. /language to change it." });
  return tg(env, "answerCallbackQuery", { callback_query_id: q.id });
}
// the greeting (/start, /play): a clip of the level it opens, or of a level at random, its text and the Play button
// each level as its sheet in the game names and describes it (src/game.html), for the greeting on /play
const LEVEL_INFO = {
  initium: { latin: "Initium", ru: "Начало", en: "Beginning",
    descRu: "Знакомство с рельсами. Белые залы с квадратными арками, первые стёкла и первый спуск во Тьму.",
    descEn: "Getting to know the rails. White halls with square arches, the first panes of glass and the first descent into the Dark." },
  thesaurus: { latin: "Thesaurus", ru: "Сокровищница", en: "Treasury",
    descRu: "Тупиковая ветка от Rubinus. Золотые залы с круглыми арками и парящими монетами. Кристаллов здесь вдвое больше обычного: проезд платный, но можно вернуться с прибылью.",
    descEn: "A dead-end branch off Rubinus. Golden halls with round arches and floating coins. Twice the usual crystals: the ride costs a fare, but you can come back with a profit." },
  vitrum: { latin: "Vitrum", ru: "Стекло", en: "Glass",
    descRu: "Призматические галереи над пустотой. Шестигранные своды, стеклянные стены и монолиты на цепях: собьёте цепи — монолит улетит в пропасть. Поперёк пути вращаются стеклянные планки и кресты, поодиночке и вереницами.",
    descEn: "Prismatic galleries over the void. Hexagonal vaults, glass walls and monoliths on chains: shoot the chains and the monolith drops into the abyss. Glass bars and crosses turn across the track, alone and in sequences." },
  rubinus: { latin: "Rubinus", ru: "Рубин", en: "Ruby",
    descRu: "Нижний путь от Vitrum к Speculum сквозь огранённый рубин. Ворота с дверцами держат противовесы на цепях: собейте груз, и его дверца отъедет. Поперёк пути вращаются массивные стеклянные кресты и качаются на цепях стеклянные блоки.",
    descEn: "The lower way from Vitrum to Speculum through a cut ruby. Gates with doors are held by counterweights on chains: shoot a weight down and its door slides away. Solid glass crosses turn across the way and glass blocks swing on chains." },
  labyrinthus: { latin: "Labyrinthus", ru: "Лабиринт", en: "Labyrinth",
    descRu: "Замкнутые изумрудные коридоры. Перед каждой развилкой висит стрелка: выстрел переводит её, и рельсы уходят в другую ветку. Богатая ветка с бирюзовыми кристаллами даёт вдвое больше кристаллов, но в ней кресты и блоки. Тихая ветка с белым солнцем — только со стёклами, и она тянет к Свету. В коридорах вращаются массивные стеклянные кресты. В открытых залах на цепях качаются стеклянные блоки.",
    descEn: "Closed emerald corridors. Before each fork hangs a switch arrow — a shot flips it, and the rails turn into the other branch. The rich branch with turquoise crystals gives twice the crystals but holds crosses and blocks. The quiet branch with a white sun has plain glass only and draws you to the Light. Solid glass crosses turn in the corridors. In the open halls glass blocks swing on chains." },
  hortus: { latin: "Hortus", ru: "Сад", en: "Garden",
    descRu: "Тупиковая ветка от Initium с висячими садами. Со стен свисают ветви, и на них растут кристаллы. Ветви хлещут поперёк пути: заденет вагонетку — минус три шара. Попадание в ветку ломает её, но несобранные кристаллы падают вместе с ней.",
    descEn: "A dead-end branch off Initium with hanging gardens. Boughs hang from the walls with crystals growing on them. They lash across the track: one that catches the cart costs three balls. A hit breaks a bough, but its unpicked crystals fall with it." },
  speculum: { latin: "Speculum", ru: "Зеркало", en: "Mirror",
    descRu: "Зеркальные залы. За стеклянными стенами коридор повторяется, а рядом с каждым настоящим кристаллом может висеть его отражение. Отражение не даёт шаров, а выстрел по нему стоит шар. Поперёк пути призмы собирают свет в лучи, а парящие зеркала отражают их в сетку: разбейте призму или зеркало, чтобы проехать. Высокие ворота в клубах пара открываются попаданием в бегущие по створкам мишени; висят и монолиты на цепях.",
    descEn: "Mirror halls. Behind the glass walls the corridor repeats, and beside each real crystal its reflection may hang. A reflection gives no balls, and a shot at it costs a ball. Across the way prisms gather light into beams that hovering mirrors bounce into a web: break a prism or a mirror to get through. Tall gates in drifting steam open to hits on the targets running up and down their leaves; monoliths hang on chains." },
  tao: { latin: "Tao", ru: "Дао", en: "The Way",
    descRu: "Вершина верхней линии, откуда путь Дао уходит через Nox к Lux. Круглые лунные врата. Тушь и рисовая бумага: в Свете белое с алой печатью, во Тьме чёрная тушь с нефритовым свечением. Над путём плывёт туман и медленно вращается знак инь-ян.",
    descEn: "The top of the upper line, from where the Way of Tao runs through Nox to Lux. Round moon gates. Ink and rice paper: in the Light white with a scarlet seal, in the Dark black ink with a jade glow. Mist drifts over the track and a yin-yang sign slowly turns." },
  abyssus: { latin: "Nox", ru: "Тьма", en: "Dark",
    descRu: "Узкий мост над бездной, без стен и потолка. Поперёк моста встают стальные ворота, над рамой крутятся вертушки с чашками: попадите во все, и створки разъедутся. Стёкла и тени поднимаются снизу, из пустоты. Тьма здесь тянет сильнее. Над мостом вращаются лазерные мельницы и парят планки с тремя лазерами, огромные шестерни опускают зубья на рельсы и парят стеклянные блоки.",
    descEn: "A narrow bridge over the abyss, with no walls or ceiling. Steel gates rise across the bridge, with cup anemometers spinning over the frame: hit them all and the leaves slide apart. Glass and shades rise from the void below. The Dark pulls harder here. Over the bridge laser mills turn and bars of three lasers hover, great gears bring their teeth down over the rails, and glass blocks float." },
  carcer: { latin: "Carcer", ru: "Темница", en: "Dungeon",
    descRu: "Тупик глубоко во Тьме: средневековая темница, перестроенная в тюрьму для особо опасных. Короткие ржавые коридоры ведут из зала в зал. В залах стальные решётки на цепях, парящие лазерные балки и сетки и мельницы с топорами. Двери в залы надо открыть: сбить цепи откидной створки или выбить засов. В конце заперта пушка, которой нет на складе.",
    descEn: "A dead end deep in the Dark: a medieval dungeon rebuilt as a prison for the most dangerous. Short rusted corridors lead from hall to hall. In the halls hang steel grates on chains, floating laser bars and grids, and mills of axes. The doors into the halls must be opened: shoot the chains of a drop flap or break the bolt. At the end lies a cannon the depot doesn't sell." },
  lux: { latin: "Lux", ru: "Свет", en: "Light",
    descRu: "Конечная. Белые залы со стеклянными стенами. Путь стерегут красные лазеры: вертушки в разрывах стен, парящие блоки, балки на цепях. Луч через вагонетку стоит 3 шара. Переборки с диафрагмой открываются кнопками. Подъём к Свету здесь самый тяжёлый.",
    descEn: "The terminus. White halls with glass walls. Red lasers guard the way: spinners in gaps in the walls, floating blocks, beams on chains. A beam across the cart costs 3 balls. Iris bulkheads open with buttons. The climb to the Light is hardest here." },
};
// the words the bot and the Google Play listing share (android/GOOGLE_PLAY.md): what the game is, and where to tap
const ABOUT = { ru: "Limbus — рельсовый шутер между Светом и Тьмой: вагонетка мчится сама, а вы разбиваете стекло на пути. 11 уровней, и у каждого своя музыка и финал.",
  en: "Limbus is a rail shooter between the Light and the Dark — the cart rushes on by itself, and you smash the glass in its way. 11 levels, each with its own music and finale." };
// the empty chat's description, under which Telegram shows its own Start button ("СТАРТ" / "START")
const TAP = { ru: "Нажмите кнопку «Старт», и она откроет игру прямо в Telegram.", en: "Tap the Start button and it will open the game right in Telegram." };
const NEWS = { ru: "Новости о новых уровнях будут приходить сюда.\nПоддержка: /support", en: "News of new levels will come here.\nSupport — /support" };
// the greeting (/start, /play, and a player come in through the game): a level's card, its clip, its name and description,
// and the Play button opening that level. The level a link names (t.me/bot?start=nox), else the next in a round of them all,
// so each comes as often as the others. (What the bot is and where its support is: the empty chat's description, /setup.)
async function greet(env, chat, from, arg) {
  const all = [...new Set(Object.values(LEVEL_IDS))];
  let clip = LEVEL_IDS[arg];
  if (!clip) {
    const key = "u:" + from.id, rec = JSON.parse(await env.USERS.get(key) || "null");
    const n = rec && Number.isInteger(rec.clip) ? (rec.clip + 1) % all.length : Math.floor(Math.random() * all.length);
    clip = all[n];
    if (rec) await env.USERS.put(key, JSON.stringify({ ...rec, clip: n }));
  }
  const hi = { chat_id: chat, reply_markup: playKb(env, from, clip), caption: cardText(from, clip) };
  await tg(env, "setChatMenuButton", { chat_id: chat, menu_button: menuButton(env, ru(from)) }); // the Play button by the input field, in their language
  const r = await sendClip(env, hi, clip);
  if (r.ok) { await env.USERS.put("k:" + from.id, JSON.stringify({ id: r.result.message_id, level: clip })); return r; } // the card the game keeps fresh (way)
  const { caption, ...rest } = hi; return tg(env, "sendMessage", { ...rest, text: caption }); // the clip won't go: the text alone
}
const cardText = (from, id) => { const lv = LEVEL_INFO[id], r_ = ru(from); return `${lv.latin} — ${r_ ? lv.ru : lv.en}\n\n${r_ ? lv.descRu : lv.descEn}`; };
// the player's last level card, turned in place into the station they are now up to: its clip, name, description and Start
// button. No new message and no notice: whenever they open the chat, its last card leads on
async function freshCard(env, user, level) {
  const card = JSON.parse(await env.USERS.get("k:" + user.id) || "null");
  if (!card || card.level === level) return;
  const from = await speaker(env, user);
  const r = await tg(env, "editMessageMedia", { chat_id: user.id, message_id: card.id, reply_markup: playKb(env, from, level),
    media: { type: "video", media: `${env.GAME_URL}minis/${level}.bot.mp4?v=${CLIP_VERSION}`, caption: cardText(from, level), width: 640, height: 360, supports_streaming: true } });
  if (r.ok || /not modified/.test(r.description || "")) await env.USERS.put("k:" + user.id, JSON.stringify({ ...card, level }));
  else await env.USERS.delete("k:" + user.id); // gone, or no longer editable: the next card the bot sends takes its place
}
// a level's clip for the bot: 16:9 like the old pictures, with a silent sound track (so Telegram keeps it a video), sent as a video
// because a desktop Telegram shows a GIF no wider than 320 points and a video as wide as a picture; a GIF if the video won't go
const CLIP_VERSION = 2;
async function sendClip(env, msg, id) {
  // Telegram keeps a file it has fetched by its address, as the kind it was sent as: a new version is a new address
  const url = `${env.GAME_URL}minis/${id}.bot.mp4?v=${CLIP_VERSION}`;
  const r = await tg(env, "sendVideo", { ...msg, video: url, width: 640, height: 360, supports_streaming: true });
  return r.ok || r.error_code === 403 ? r : tg(env, "sendAnimation", { ...msg, animation: url, width: 640, height: 360 });
}

// the game's trailer (minis/trailer.<ru|en>.mp4, 1280x720, 40 s) in their language: fetched by Telegram from its address the
// first time, then sent again by the file_id Telegram gave back, kept in KV (a new trailer is a new TRAILER_VERSION)
const TRAILER_VERSION = 1;
async function sendTrailer(env, chat, from) {
  const lang = ru(from) ? "ru" : "en", key = `trailer:${lang}:${TRAILER_VERSION}`, known = await env.USERS.get(key);
  const msg = { chat_id: chat, width: 1280, height: 720, duration: 40, supports_streaming: true };
  if (known) { const r = await tg(env, "sendVideo", { ...msg, video: known }); if (r.ok) return r; }
  const r = await tg(env, "sendVideo", { ...msg, video: `${env.GAME_URL}minis/trailer.${lang}.mp4?v=${TRAILER_VERSION}` });
  if (r.ok && r.result.video) await env.USERS.put(key, r.result.video.file_id);
  return r;
}

async function onUpdate(u, env) {
  if (u.pre_checkout_query) return tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  if (u.callback_query) return onButton(u.callback_query, env);
  const msg = u.message; if (!msg || !msg.from || msg.chat.type !== "private") return;
  const chat = msg.chat.id, text = msg.text || "", owner = String(msg.from.id) === String(env.OWNER_ID);
  const from = await speaker(env, msg.from); // in the language they chose with /language, else their Telegram's

  if (msg.successful_payment) {
    const sp = msg.successful_payment, pk = PACKS[sp.invoice_payload] || {};
    if (sp.invoice_payload === "apk") { // bought outside the game: a code to enter in it
      const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), b => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");
      await env.USERS.put("c:" + code, String(pk.crystals), { expirationTtl: 60 * 60 * 24 * 365 });
      await tg(env, "sendMessage", { chat_id: chat, parse_mode: "HTML", text: T(from,
        `Спасибо! Ваш код: <code>${code}</code>\nВ игре откройте станцию Emptio и введите его — придёт ◆ ${pk.crystals}. Код одноразовый.`,
        `Thank you! Your code: <code>${code}</code>\nIn the game open the Emptio station and enter it for ◆ ${pk.crystals}. The code works once.`) });
    } else await tg(env, "sendMessage", { chat_id: chat, text: T(from, `Спасибо! ◆ ${pk.crystals || ""} уже в игре.`, `Thank you! ◆ ${pk.crystals || ""} are in the game.`) });
    return tg(env, "sendMessage", { chat_id: env.OWNER_ID, text: `⭐ ${sp.total_amount} · ${sp.invoice_payload} — ${from.first_name || ""} ${from.username ? "@" + from.username : ""} (${from.id})` });
  }
  // the owner answering a forwarded message: the reply goes back to that player
  if (owner && msg.reply_to_message) {
    const to = await env.USERS.get("m:" + msg.reply_to_message.message_id);
    if (to) { await tg(env, "copyMessage", { chat_id: to, from_chat_id: chat, message_id: msg.message_id }); return tg(env, "sendMessage", { chat_id: chat, text: "✓ отправлено" }); }
  }
  // the player allowed the bot to write to them from the game: Telegram tells the bot with a service message, which is
  // nobody's question; they go on the news list and get the greeting, as on /start
  if (msg.write_access_allowed) { // they came in through the game, never pressed Start: they get the greeting all the same
    await remember(env, from, true);
    return greet(env, chat, from, "");
  }
  // other service messages (a pinned message, a payment's refund and the like) are not messages for the author either
  const CONTENT = ["text", "photo", "video", "document", "voice", "audio", "sticker", "animation", "video_note", "location", "contact"];
  if (!CONTENT.some(k => msg[k])) return;
  const [cmd, ...rest] = text.split(/\s+/); const arg = rest.join(" ");
  switch (cmd.replace(/@.*/, "")) {
    case "/start": {
      await remember(env, from, true);
      if (arg === "apk") { // from the Emptio station outside Telegram: the one pack, paid here, its code sent back
        await tg(env, "sendMessage", { chat_id: chat, text: T(from, "Кристаллы для Арсенала: вход на склад, все пушки (кроме Ferrum) и все улучшения до третьего уровня +25% бонус.\nПосле оплаты придёт код — введите его в игре на станции Emptio.",
          "Crystals for Armamentarium: the depot's entry, every cannon (but Ferrum) and every upgrade to the third level, +25% bonus.\nOnce paid, a code comes: enter it in the game at the Emptio station.") });
        return tg(env, "sendInvoice", { chat_id: chat, ...invoiceBody({ language_code: from.language_code }, "apk") });
      }
      const key = "u:" + from.id, rec = JSON.parse(await env.USERS.get(key) || "null");
      if (!rec || !rec.trailer) { // the trailer once, on their first /start, before the level card with its Start button
        const r = await sendTrailer(env, chat, from);
        if (r.ok && rec) await env.USERS.put(key, JSON.stringify({ ...rec, trailer: true }));
      }
      // the station they are up to on the way to the Light, as the game last told (Initium for a newcomer); a link's own level first
      return greet(env, chat, from, arg || await env.USERS.get("w:" + from.id) || "initium");
    }
    case "/play": return greet(env, chat, from, await env.USERS.get("w:" + from.id) || "initium"); // as /start: the station they are up to
    case "/version": return tg(env, "sendMessage", { chat_id: chat, text: `v${BOT_VERSION}` });
    case "/language": return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Выберите язык:", "Choose a language:"),
      reply_markup: { inline_keyboard: [[{ text: "Русский", callback_data: "lang:ru" }, { text: "English", callback_data: "lang:en" }]] } });
    case "/stop":
      await remember(env, from, false);
      return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Вы отписаны от новостей. /start — подписаться снова.", "You are unsubscribed from the news. /start to subscribe again.") });
    case "/support":
      if (owner) await env.USERS.put("selftest", "1", { expirationTtl: 600 }); // the owner trying it out: the next message goes the player's way
      return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Напишите вопрос одним сообщением — я передам его автору, ответ придёт сюда.", "Write your question in a message: it goes to the author, and the answer comes here.") });
    case "/buy": return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Кристаллы для Арсенала — на станции Emptio в игре.", "Crystals for Armamentarium: at the Emptio station in the game."), reply_markup: playKb(env, from, "emptio") });
  }
  if (owner) switch (cmd) {
    case "/broadcast": return startBroadcast(env, chat, arg);
    case "/stats": {
      let n = 0, cursor;
      do { const l = await env.USERS.list({ prefix: "u:", cursor }); for (const k of l.keys) { n++; } cursor = l.list_complete ? null : l.cursor; } while (cursor);
      const job = JSON.parse(await env.USERS.get("job") || "null");
      return tg(env, "sendMessage", { chat_id: chat, text: `Пользователей: ${n}` + (job ? `\nРассылка идёт: отправлено ${job.sent}, ошибок ${job.failed}` : "") });
    }
    case "/cancel": await env.USERS.delete("job"); return tg(env, "sendMessage", { chat_id: chat, text: "Рассылка остановлена." });
  }
  if (cmd.startsWith("/")) return;
  // anything else is a message for the author
  if (owner && !(await env.USERS.get("selftest"))) return tg(env, "sendMessage", { chat_id: chat, text: "Чтобы ответить игроку, ответьте (Reply) на его пересланное сообщение." });
  if (owner) await env.USERS.delete("selftest");
  await remember(env, from, true);
  const f = await tg(env, "forwardMessage", { chat_id: env.OWNER_ID, from_chat_id: chat, message_id: msg.message_id });
  if (f.ok) {
    await env.USERS.put("m:" + f.result.message_id, String(chat), { expirationTtl: 60 * 60 * 24 * 60 });
    if (!f.result.forward_origin || f.result.forward_origin.type === "hidden_user") // a hidden sender: say who it was, so the reply has a target
      await tg(env, "sendMessage", { chat_id: env.OWNER_ID, reply_to_message_id: f.result.message_id, text: `от ${from.first_name || ""} (${from.id})` });
  }
  return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Сообщение передано автору. Ответ придёт сюда.", "Your message went to the author. The answer will come here.") });
}

// ---------- Stars ----------
const invoiceBody = (from, id) => { const pk = PACKS[id]; return { title: "Limbus",
  description: T(from, `💎 ${pk.crystals} кристаллов для Арсенала +25% бонус.`, `💎 ${pk.crystals} crystals for Armamentarium +25% bonus.`),
  payload: id, currency: "XTR", prices: [{ label: `◆ ${pk.crystals}`, amount: pk.stars }] }; };
async function invoice(req, env) {
  const { product, lang } = await req.json().catch(() => ({}));
  if (!PACKS[product] || product === "apk") return Response.json({ error: "no such pack" }, { status: 400 });
  const r = await tg(env, "createInvoiceLink", invoiceBody({ language_code: lang || "ru" }, product));
  return Response.json(r.ok ? { link: r.result } : { error: r.description }, { status: r.ok ? 200 : 500 });
}
// a code bought in the bot, traded once for its crystals
async function redeem(req, env) {
  const { code } = await req.json().catch(() => ({}));
  const key = "c:" + String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12), n = await env.USERS.get(key);
  if (!n) return Response.json({ error: "no such code" }, { status: 404 });
  await env.USERS.delete(key);
  return Response.json({ crystals: +n });
}

// ---------- the game says who is playing ----------
async function hello(req, env) {
  const { initData } = await req.json().catch(() => ({}));
  const user = await checkInitData(initData || "", env.BOT_TOKEN);
  if (!user) return Response.json({ ok: false }, { status: 403 });
  if (user.allows_write_to_pm) await remember(env, user, true);
  return Response.json({ ok: true, sub: !!user.allows_write_to_pm });
}
// the station the player is up to on the way from Initium to Lux, for /start: kept only when it changes (the game sends it so)
const WAY = ["initium", "vitrum", "labyrinthus", "rubinus", "speculum", "tao", "abyssus", "lux"];
async function way(req, env) {
  const { initData, level } = await req.json().catch(() => ({}));
  const user = await checkInitData(initData || "", env.BOT_TOKEN);
  if (!user || !WAY.includes(level)) return Response.json({ ok: false }, { status: 400 });
  if (await env.USERS.get("w:" + user.id) !== level) { await env.USERS.put("w:" + user.id, level); await freshCard(env, user, level); }
  return Response.json({ ok: true });
}
// Telegram signs the Mini App's initData with a key made from the bot's token: anything else is refused
async function checkInitData(initData, token) {
  const p = new URLSearchParams(initData), hash = p.get("hash"); if (!hash) return null;
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a < b ? -1 : 1).map(([k, v]) => `${k}=${v}`).join("\n");
  const enc = new TextEncoder(), hmac = async (key, data) => new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), enc.encode(data)));
  const secret = await hmac(enc.encode("WebAppData"), token), sig = await hmac(secret, check);
  if ([...sig].map(b => b.toString(16).padStart(2, "0")).join("") !== hash) return null;
  if (Date.now() / 1000 - +p.get("auth_date") > 86400 * 7) return null; // a week old at most
  try { return JSON.parse(p.get("user")); } catch (e) { return null; }
}

// ---------- broadcast ----------
// a level as the owner may name it in /broadcast: by its station's name (Nox) or by its id in the game (abyssus)
const LEVEL_IDS = { initium: "initium", thesaurus: "thesaurus", vitrum: "vitrum", rubinus: "rubinus", labyrinthus: "labyrinthus", hortus: "hortus",
  speculum: "speculum", tao: "tao", nox: "abyssus", abyssus: "abyssus", carcer: "carcer", lux: "lux" };
async function startBroadcast(env, chat, arg) {
  const m = /^(\S+)\s+([\s\S]+)$/.exec(arg.trim()), level = m && LEVEL_IDS[m[1].toLowerCase()];
  if (!level) return tg(env, "sendMessage", { chat_id: chat, text: `${m ? `Нет уровня «${m[1]}». ` : ""}Формат: /broadcast <уровень> <текст>\nНапример: /broadcast vitrum Новый уровень уже на линии!\nУровни: initium thesaurus vitrum rubinus labyrinthus hortus speculum tao nox carcer lux` });
  if (await env.USERS.get("job")) return tg(env, "sendMessage", { chat_id: chat, text: "Уже идёт рассылка. /stats — сколько отправлено, /cancel — остановить." });
  await env.USERS.put("job", JSON.stringify({ level, text: m[2], cursor: null, keys: [], sent: 0, failed: 0, by: chat }));
  await tg(env, "sendMessage", { chat_id: chat, text: `Рассылка началась: по ${PER_RUN} сообщений в минуту. /stats — ход, /cancel — остановить.` });
  return runBroadcast(env);
}
async function runBroadcast(env) {
  const job = JSON.parse(await env.USERS.get("job") || "null"); if (!job) return;
  let budget = PER_RUN;
  while (budget > 0) {
    if (!job.keys.length) {
      if (job.cursor === "done") break;
      const l = await env.USERS.list({ prefix: "u:", cursor: job.cursor || undefined, limit: 200 }); budget--;
      job.keys = l.keys.map(k => k.name); job.cursor = l.list_complete ? "done" : l.cursor;
      if (!job.keys.length) continue;
    }
    const key = job.keys.shift(), id = key.slice(2);
    const u = JSON.parse(await env.USERS.get(key) || "null"); budget--; // reads count against the limit too
    if (!u || !u.sub) continue;
    const from = { language_code: u.choice || u.lang };
    // the level's clip; its picture if the clip won't go
    const msg = { chat_id: id, caption: job.text, reply_markup: playKb(env, from, job.level) };
    let r = await sendClip(env, msg, job.level); budget -= 2;
    if (!r.ok && r.error_code !== 403) { r = await tg(env, "sendPhoto", { ...msg, photo: `${env.GAME_URL}minis/${job.level}.jpg` }); budget--; }
    if (r.ok) job.sent++; else { job.failed++; job.error = r.description || String(r.error_code); if (r.error_code === 403) await env.USERS.delete(key); } // blocked the bot: off the list
  }
  if (job.cursor === "done" && !job.keys.length) {
    await env.USERS.delete("job");
    await tg(env, "sendMessage", { chat_id: job.by, text: `Рассылка закончена: отправлено ${job.sent}, ошибок ${job.failed}.${job.error ? `\nПоследняя ошибка: ${job.error}` : ""}` });
  } else await env.USERS.put("job", JSON.stringify(job));
}

// ---------- once: the webhook, the commands and the menu button ----------
async function setup(url, env) {
  if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return new Response("key?", { status: 403 });
  const out = {};
  // pending updates are kept: whoever wrote to the bot in the last day before this is not lost
  out.webhook = await tg(env, "setWebhook", { url: `${url.origin}/tg`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "pre_checkout_query"] });
  // English for everyone by default, Russian for Russian-speaking profiles (as the bot's own replies go)
  const RU = ["ru", "uk", "be", "kk"];
  const DESC = { ru: ABOUT.ru + "\n\n" + TAP.ru + "\n\n" + NEWS.ru, en: ABOUT.en + "\n\n" + TAP.en + "\n\n" + NEWS.en }; // the greeting's own words
  const SHORT = { ru: "Рельсовый шутер между Светом и Тьмой. Играйте прямо в Telegram.", en: "A rail shooter between the Light and the Dark. Play right in Telegram." };
  out.commands = await tg(env, "setMyCommands", { commands: commands(false) });
  out.description = await tg(env, "setMyDescription", { description: DESC.en });
  out.short = await tg(env, "setMyShortDescription", { short_description: SHORT.en });
  for (const lc of RU) {
    out["commands_" + lc] = await tg(env, "setMyCommands", { language_code: lc, commands: commands(true) });
    out["description_" + lc] = await tg(env, "setMyDescription", { language_code: lc, description: DESC.ru });
    out["short_" + lc] = await tg(env, "setMyShortDescription", { language_code: lc, short_description: SHORT.ru });
  }
  for (const lc of ["en"]) out["commands_" + lc] = await tg(env, "setMyCommands", { language_code: lc, commands: commands(false) }); // over the old Russian-default list
  out.menu = await tg(env, "setChatMenuButton", { menu_button: menuButton(env, false) }); // a chat that has spoken to the bot gets its own, in its language
  return Response.json(out, { headers: { "content-type": "application/json; charset=utf-8" } });
}

function cors(r) {
  const h = new Headers(r.headers);
  h.set("Access-Control-Allow-Origin", "*"); h.set("Access-Control-Allow-Methods", "POST, OPTIONS"); h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(r.body, { status: r.status, headers: h });
}
