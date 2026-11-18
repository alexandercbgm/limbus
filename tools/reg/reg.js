// node reg.js <page> <out dir> [levels]: each level from a seeded start, the cart held still at 180, 520 and 900 m, a shot of each
const { chromium } = require("playwright"), fs = require("fs");
(async () => { const page = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const lvs = (process.argv[4] || "initium,thesaurus,vitrum,labyrinthus,rubinus,tao,speculum,abyssus,carcer,lux").split(",");
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } }); let errs = 0; p.on("pageerror", e => { errs++; console.log("ERR", e.message); });
  await p.goto("file://" + page + "#all", { waitUntil: "domcontentloaded", timeout: 120000 }); await p.waitForTimeout(4000);
  const stats = {};
  for (const lv of lvs) for (const at of [180, 520, 900]) {
    await p.evaluate(([lv]) => { window.__dtfix = 0.02; window.__still = false; __seed(4242); __rails.level(lv); }, [lv]); await p.waitForTimeout(1200);
    await p.evaluate(at => { __rails.setBalls(30); __rails.jump(at - 60); window.__dtfix = 0.05; }, at);
    for (let t = 0; t < 400; t++) { const r = await p.evaluate(() => { __rails.setBalls(30); return __rails.branchInfo().sC; }); if (r >= at) break; await p.waitForTimeout(50); }
    await p.evaluate(() => { window.__still = true; window.__dtfix = 0.016; }); await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${lv}-${at}.png` }); stats[`${lv}-${at}`] = await p.evaluate(() => __ri());
  }
  fs.writeFileSync(`${out}/stats.json`, JSON.stringify(stats)); console.log("errors", errs); await b.close(); })();
