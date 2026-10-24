// The Limbus bot, as a Cloudflare Worker (plain JavaScript, no build step: paste it into the dashboard as it is).
//
// What it does:
//   /start            greets the player with a Play button and remembers them for the news
//   /stop             takes them off the news; /start puts them back
//   /support, text    a message to the bot goes on to the owner; the owner replies to it in the bot's chat and the
//                     reply goes back to the player, from the bot
//   crystal packs     sold for Stars at the game's Emptio station: in Telegram the game asks /invoice for a pack and adds
//                     its crystals when Telegram says it is paid; outside Telegram (the APK, the page) a ?start=apk link
//                     brings the player here, the bot sells the one pack and sends a code the game redeems at /redeem
//   /broadcast        owner only: "/broadcast vitrum Text…" sends every subscriber the level's picture, the text and a
//                     Play button that opens that very level; it goes out ~45 a minute (a free Worker may make only
//                     50 outside calls at a time), so a cron trigger carries it on; /stats, /cancel
//   POST /hello       the game, opened in Telegram, says who is playing (checked against the bot's token), so players
//                     who never wrote to the bot get the news too, once they have allowed it
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
  await env.USERS.put(key, JSON.stringify({ name: user.first_name || "", lang: user.language_code || "", sub, t: Date.now() }));
}

async function onUpdate(u, env) {
  if (u.pre_checkout_query) return tg(env, "answerPreCheckoutQuery", { pre_checkout_query_id: u.pre_checkout_query.id, ok: true });
  if (u.callback_query) return tg(env, "answerCallbackQuery", { callback_query_id: u.callback_query.id });
  const msg = u.message; if (!msg || !msg.from || msg.chat.type !== "private") return;
  const from = msg.from, chat = msg.chat.id, text = msg.text || "", owner = String(from.id) === String(env.OWNER_ID);

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
  const [cmd, ...rest] = text.split(/\s+/); const arg = rest.join(" ");
  switch (cmd.replace(/@.*/, "")) {
    case "/start": {
      await remember(env, from, true);
      if (arg === "apk") { // from the Emptio station outside Telegram: the one pack, paid here, its code sent back
        await tg(env, "sendMessage", { chat_id: chat, text: T(from, "Кристаллы для Арсенала: вход на склад, все пушки (кроме Ferrum) и все улучшения до третьего уровня +25% бонус. После оплаты придёт код — введите его в игре на станции Emptio.",
          "Crystals for Armamentarium: the depot's entry, every cannon (but Ferrum) and every upgrade to the third level, +25% bonus. Once paid, a code comes: enter it in the game at the Emptio station.") });
        return tg(env, "sendInvoice", { chat_id: chat, ...invoiceBody({ language_code: from.language_code }, "apk") });
      }
      const level = /^[a-z]+$/.test(arg) ? arg : ""; // t.me/bot?start=vitrum
      return tg(env, "sendMessage", { chat_id: chat, reply_markup: playKb(env, from, level),
        text: T(from, "Limbus — рельсы между Светом и Тьмой. Жмите «Играть».\n\nНовости о новых уровнях будут приходить сюда; /stop — отписаться. Вопросы — просто напишите сообщение.",
          "Limbus: rails between the Light and the Dark. Tap Play.\n\nNews of new levels will come here; /stop to unsubscribe. Questions? Just write a message.") });
    }
    case "/play": return tg(env, "sendMessage", { chat_id: chat, text: "Limbus", reply_markup: playKb(env, from) });
    case "/stop":
      await remember(env, from, false);
      return tg(env, "sendMessage", { chat_id: chat, text: T(from, "Вы отписаны от новостей. /start — подписаться снова.", "You are unsubscribed from the news. /start to subscribe again.") });
    case "/support":
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
  if (owner) return tg(env, "sendMessage", { chat_id: chat, text: "Чтобы ответить игроку, ответьте (Reply) на его пересланное сообщение." });
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
async function startBroadcast(env, chat, arg) {
  const m = /^([a-z]+)\s+([\s\S]+)$/.exec(arg.trim());
  if (!m) return tg(env, "sendMessage", { chat_id: chat, text: "Формат: /broadcast <уровень> <текст>\nНапример: /broadcast vitrum Новый уровень уже на линии!\nУровни: initium vitrum labyrinthus hortus thesaurus rubinus speculum tao abyssus carcer lux" });
  if (await env.USERS.get("job")) return tg(env, "sendMessage", { chat_id: chat, text: "Уже идёт рассылка. /stats — сколько отправлено, /cancel — остановить." });
  await env.USERS.put("job", JSON.stringify({ level: m[1], text: m[2], cursor: null, keys: [], sent: 0, failed: 0, by: chat }));
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
    const from = { language_code: u.lang };
    const r = await tg(env, "sendPhoto", { chat_id: id, photo: `${env.GAME_URL}minis/${job.level}.jpg`, caption: job.text, reply_markup: playKb(env, from, job.level) }); budget--;
    if (r.ok) job.sent++; else { job.failed++; if (r.error_code === 403) await env.USERS.delete(key); } // blocked the bot: off the list
  }
  if (job.cursor === "done" && !job.keys.length) {
    await env.USERS.delete("job");
    await tg(env, "sendMessage", { chat_id: job.by, text: `Рассылка закончена: отправлено ${job.sent}, ошибок ${job.failed}.` });
  } else await env.USERS.put("job", JSON.stringify(job));
}

// ---------- once: the webhook, the commands and the menu button ----------
async function setup(url, env) {
  if (url.searchParams.get("key") !== env.WEBHOOK_SECRET) return new Response("key?", { status: 403 });
  const out = {};
  // pending updates are kept: whoever wrote to the bot in the last day before this is not lost
  out.webhook = await tg(env, "setWebhook", { url: `${url.origin}/tg`, secret_token: env.WEBHOOK_SECRET, allowed_updates: ["message", "callback_query", "pre_checkout_query"] });
  out.commands = await tg(env, "setMyCommands", { commands: [
    { command: "play", description: "Играть" }, { command: "support", description: "Написать автору" },
    { command: "buy", description: "Кристаллы для Арсенала" }, { command: "stop", description: "Отписаться от новостей" }] });
  out.commandsEn = await tg(env, "setMyCommands", { language_code: "en", commands: [
    { command: "play", description: "Play" }, { command: "support", description: "Write to the author" },
    { command: "buy", description: "Crystals for Armamentarium" }, { command: "stop", description: "Unsubscribe from the news" }] });
  out.menu = await tg(env, "setChatMenuButton", { menu_button: { type: "web_app", text: "Играть", web_app: { url: env.GAME_URL } } });
  return Response.json(out, { headers: { "content-type": "application/json; charset=utf-8" } });
}

function cors(r) {
  const h = new Headers(r.headers);
  h.set("Access-Control-Allow-Origin", "*"); h.set("Access-Control-Allow-Methods", "POST, OPTIONS"); h.set("Access-Control-Allow-Headers", "content-type");
  return new Response(r.body, { status: r.status, headers: h });
}
