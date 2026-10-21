const { chromium } = require('playwright');
const fs = require('fs');
// Shoots every built level in the light and in the dark for the station sheets' miniatures.
// Serve the repo (python3 -m http.server 8766) and run: OUT=/some/dir THREE=/path/to/three.min.js node tools/shoot-minis.js
// then: python3 tools/compose-minis.py /some/dir
const OUT = process.env.OUT, THREE_JS = process.env.THREE;
const FEAT = {
  initium: r => { r.jump(240); },
  thesaurus: r => { r.jump(200); },
  vitrum: r => { r.jump(300); r.hanger(20, 'gate'); },
  labyrinthus: r => { r.jump(296); },
  hortus: r => { r.jump(300); r.bough(20, 1); },
  speculum: r => { r.jump(300); r.crystalAhead(14, 1.6, 2.6); },
  abyssus: r => { r.jump(300); r.gate(22, 'v'); },
  lux: r => { r.jump(300); r.spinner(16, 1, 1); r.lblock(24, 'h'); },
  carcer: r => { r.jump(240); r.bars(22); },
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.route('**/three.min.js', r => r.fulfill({ body: fs.readFileSync(THREE_JS), contentType: 'application/javascript' }));
  await pg.route('https://fonts.**', r => r.abort());
  await pg.goto('http://127.0.0.1:8766/index.html#all');
  await pg.waitForTimeout(800);
  for (const id of Object.keys(FEAT)) {
    for (const [alt, tag] of [[0.5, 'L'], [-0.95, 'D']]) {
      await pg.evaluate(id => window.__rails.level(id), id);
      await pg.waitForTimeout(3600);
      await pg.evaluate(([id, alt, f]) => { const r = window.__rails; r.setBalls(80); r.setAlt(alt); (new Function('r', 'return (' + f + ')(r)'))(r); }, [id, alt, FEAT[id].toString()]);
      await pg.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; }' });
      for (let i = 0; i < 16; i++) { await pg.waitForTimeout(100); await pg.evaluate(a => { window.__rails.setAlt(a); window.__rails.setBalls(80); }, alt); }
      await pg.locator('canvas').first().screenshot({ path: `${OUT}/${id}_${tag}.png` });
    }
  }
  console.log('errs', JSON.stringify(errs));
  await b.close();
})();
