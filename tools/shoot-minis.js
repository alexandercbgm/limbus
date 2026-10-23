const { chromium } = require('playwright');
const fs = require('fs');
// Shoots every built level in the light and in the dark for the station sheets' miniatures.
// Serve the repo (python3 -m http.server 8766) and run: OUT=/some/dir THREE=/path/to/three.min.js node tools/shoot-minis.js
// then: python3 tools/compose-minis.py /some/dir
// ONLY=tao,lux shoots just those.
const OUT = process.env.OUT, THREE_JS = process.env.THREE;
// Each shot is taken on a straight run (just past a turn), the way ahead cleared, with a few of the level's own sights set
// down at middle distance: enough to tell the level by, not so many that the frame is crowded.
// at: the s to stand at (or 'hall', a little way into a hall of Labyrinthus or Carcer); put: what to set down ahead of the cart
const SCENE = {
  initium: { at: 262, put: r => { r.glassBar('sides', 30); r.glassBar('center', 46); r.crystalAhead(34, -1.2, 2.6); } },
  thesaurus: { at: 262, put: r => { r.crystalAhead(24, -1.6, 2.2); r.crystalAhead(30, 1.5, 3.0); r.glassBar('center', 44); } },
  vitrum: { at: 428, put: r => { r.hanger(30, 'gate'); r.glassBar('barfan', 50); } },
  labyrinthus: { at: 'hall', put: r => { r.glassBar('grams', 30); r.crystalAhead(22, 1.8, 2.6); } },
  hortus: { at: 262, put: r => { r.bough(24, 1); r.bough(36, -1); } },
  speculum: { at: 272, put: r => { r.prisms(36, 2); r.crystalAhead(24, -1.4, 2.6); } },
  abyssus: { at: 292, put: r => { r.gearsAt(40, true); r.crystalAhead(24, 0.8, 2.4); } },
  lux: { at: 302, put: r => { r.gate(40, 'iris'); } },
  rubinus: { at: 292, put: r => { r.gate(36); } },
  tao: { at: 532, put: r => { r.gate(38, 'taiji'); } }, // where the yin-yang sign hangs in the sky ahead
  carcer: { at: 'hall', put: r => { r.carcer('grate1', 24); r.carcer('top', 40); } },
};
// SCENES='{"tao":{"at":282,"put":"r => { ... }"}}' tries other scenes, without touching the ones above
if (process.env.SCENES) for (const [id, sc] of Object.entries(JSON.parse(process.env.SCENES))) SCENE[id] = { at: sc.at, put: sc.put };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(THREE_JS), contentType: 'application/javascript' }));
  await pg.route('https://fonts.**', r => r.abort());
  await pg.goto('http://127.0.0.1:8766/index.html#all');
  await pg.waitForTimeout(800);
  for (const id of (process.env.ONLY ? process.env.ONLY.split(',') : Object.keys(SCENE))) {
    for (const [alt, tag] of [[0.5, 'L'], [-0.95, 'D']]) {
      await pg.evaluate(id => window.__rails.level(id), id);
      await pg.waitForTimeout(3000);
      let at = SCENE[id].at;
      if (at === 'hall') at = await hallStart(pg, id);
      // stand there in the light or the dark a moment, the track and its decor built round the cart
      await pg.evaluate(([at, alt]) => { const r = window.__rails; r.setBalls(80); r.setAlt(alt); r.jump(at); }, [at, alt]);
      for (let i = 0; i < 10; i++) { await pg.waitForTimeout(100); await pg.evaluate(a => { window.__rails.setAlt(a); window.__rails.setBalls(80); }, alt); }
      // then clear the way where the cart now is, and set the sights down
      await pg.evaluate(f => { const r = window.__rails; r.jump(r.branchInfo().sC); (new Function('r', 'return (' + f + ')(r)'))(r); }, SCENE[id].put.toString());
      await pg.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; }' });
      for (let i = 0; i < 4; i++) { await pg.waitForTimeout(100); await pg.evaluate(a => window.__rails.setAlt(a), alt); }
      await pg.locator('canvas').first().screenshot({ path: `${OUT}/${id}_${tag}.png` });
    }
  }
  console.log('errs', JSON.stringify(errs));
  await b.close();
})();
// a little way into a hall: Carcer plans its halls up front; Labyrinthus's open halls are found by looking down the track
async function hallStart(pg, id) {
  if (id === 'carcer') return pg.evaluate(() => { const h = window.__rails.carcerPlan().halls.find(([a, b]) => a > 150 && b - a > 50); return h ? h[0] + 4 : 300; });
  for (let s = 270; s < 1400; s += 30) {
    await pg.evaluate(s => window.__rails.jump(s), s); await pg.waitForTimeout(250);
    const h = await pg.evaluate(s => window.__rails.halls().filter(x => x > s + 10 && x < s + 40), s);
    if (h.length >= 3) return Math.min(...h) - 6;
  }
  return 296;
}
