// Renders the menu's background loops in three.js: a flight down a neon grid through a storm of glass shards, solid
// shards (thick, bevelled, lit, with bright edges) tumbling past the camera. Everything moves by a whole period over the
// loop, so its last frame runs into its first.
// It is drawn for smoothness at 60 fps: every frame is the average of SUB moments across half its time (a film camera's
// shutter), so a streak or a shard rushing past leaves a short smear rather than jumping from place to place. (SS draws
// it larger and scales it down; at 2 the one-pixel lines of the grid and the shards' edges come out half as bright.)
// node tools/menu_night.js        the night's: minis/menu.night.mp4 and its first frame (.jpg)
// node tools/menu_night.js day    the day's, the same in light: minis/menu.bg.mp4 and .jpg
// Needs Playwright and ffmpeg; three.js is the one the Android build ships (android/three.min.js).
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const W = 960, H = 540, SS = 1, FPS = 60, SECS = 4, N = FPS * SECS, SUB = 6, SHUTTER = 0.5;
const DAY = process.argv[2] === "day";
const P = DAY
  ? { bg: "#e9f2f6", fog: "#e9f2f6", glass: "#ffffff", glassOp: 0.55, edge: "#1d8fb0", edgeOp: 0.9, grid: "#1d6f8f", gridOp: 0.28, streak: ["#1d8fb0", "#7a6cff", "#4fb8d8"], streakOp: 0.55, hemi: ["#ffffff", "#9fb8c4", 1.0], sun: 0.9, glow: "rgba(255,255,255,0.85)" }
  : { bg: "#04070f", fog: "#04070f", glass: "#6fb7e6", glassOp: 0.32, edge: "#9fe8ff", edgeOp: 0.95, grid: "#2a8fd0", gridOp: 0.45, streak: ["#4fd8f0", "#7a6cff", "#9fe8ff"], streakOp: 0.8, hemi: ["#9fd8ff", "#1a1040", 0.9], sun: 1.1, glow: "rgba(60,201,236,0.35)" };
const root = path.resolve(__dirname, ".."), work = fs.mkdtempSync(path.join(os.tmpdir(), "menu-"));

const page = `<body style="margin:0;background:${P.bg}"><canvas id="c" width="${W * SS}" height="${H * SS}"></canvas><script>${fs.readFileSync(path.join(root, "android", "three.min.js"), "utf8")}</script><script>
const P = ${JSON.stringify(P)}, W = ${W * SS}, H = ${H * SS};
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setClearColor(P.bg);
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(P.fog, 12, 62);
const cam = new THREE.PerspectiveCamera(72, W / H, 0.1, 100); cam.position.set(0, 0.4, 0);
scene.add(new THREE.HemisphereLight(P.hemi[0], P.hemi[1], P.hemi[2]));
const sun = new THREE.DirectionalLight(0xffffff, P.sun); sun.position.set(3, 6, 4); scene.add(sun);
const L = 60, CELL = 2; // the stretch the loop flies through, and the grid's cell (a whole number of them in it)
// the grid floor, and a lit horizon
const grid = new THREE.Group(); scene.add(grid);
const gm = new THREE.LineBasicMaterial({ color: P.grid, transparent: true, opacity: P.gridOp, fog: true });
const pts = [];
for (let x = -40; x <= 40; x += CELL) pts.push(x, -3, 2, x, -3, -L - 4);
for (let z = 2; z >= -L - 4; z -= CELL) pts.push(-40, -3, z, 40, -3, z);
const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
grid.add(new THREE.LineSegments(gg, gm));
// solid shards: an irregular flat outline, extruded and bevelled, lit glass with bright edges
const shards = [];
for (let i = 0; i < 70; i++) {
  const sh = new THREE.Shape(), n = 3 + Math.floor(rnd() * 3), s = 0.35 + rnd() * 0.9;
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2 + (rnd() - 0.5) * 0.8, r = s * (0.55 + rnd() * 0.7); k ? sh.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r * 1.4, Math.sin(a) * r); }
  const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.08 + rnd() * 0.12, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); geo.center();
  const mat = new THREE.MeshStandardMaterial({ color: P.glass, metalness: 0.2, roughness: 0.15, transparent: true, opacity: P.glassOp, side: THREE.DoubleSide });
  const em = new THREE.LineBasicMaterial({ color: P.edge, transparent: true, opacity: P.edgeOp });
  const m = new THREE.Mesh(geo, mat); m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), em)); scene.add(m);
  const ang = rnd() * Math.PI * 2, rad = 1.6 + rnd() * 8;
  shards.push({ m, mat, em, x: Math.cos(ang) * rad * 1.3, y: Math.max(-2.4, Math.sin(ang) * rad * 0.7 + 0.6), z0: -rnd() * L,
    r0: [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28], spin: [1 + Math.floor(rnd() * 2), Math.floor(rnd() * 2), 1].map(v => (rnd() < 0.5 ? -v : v)) });
}
// light streaks rushing past
const streaks = [];
for (let i = 0; i < 46; i++) {
  const len = 2 + rnd() * 5, g = new THREE.BoxGeometry(0.03, 0.03, len);
  const mt = new THREE.MeshBasicMaterial({ color: P.streak[Math.floor(rnd() * 3)], transparent: true, opacity: P.streakOp * (0.4 + rnd() * 0.6), fog: true });
  const m = new THREE.Mesh(g, mt); scene.add(m);
  const ang = rnd() * Math.PI * 2, rad = 3 + rnd() * 9;
  streaks.push({ m, mt, op: mt.opacity, x: Math.cos(ang) * rad * 1.4, y: Math.max(-2.8, Math.sin(ang) * rad * 0.6 + 0.5), z0: -rnd() * L });
}
const wrap = z => -(((-z) % L + L) % L) - 1; // into (-L-1, -1]
window.draw = t => {
  const d = t * L;
  grid.position.z = d % CELL;
  for (const s of shards) {
    const z = wrap(s.z0 + d); s.m.position.set(s.x, s.y, z);
    s.m.rotation.set(s.r0[0] + t * 6.283 * s.spin[0], s.r0[1] + t * 6.283 * s.spin[1], s.r0[2] + t * 6.283 * s.spin[2]);
    const near = Math.min(1, (-z - 1) / 3); s.mat.opacity = P.glassOp * near; s.em.opacity = P.edgeOp * near;
  }
  for (const s of streaks) { const z = wrap(s.z0 + d * 1.6); s.m.position.set(s.x, s.y, z); s.mt.opacity = s.op * Math.min(1, (-z - 1) / 4); }
  renderer.render(scene, cam);
};
// one frame of the video: the average of n moments from t across span (in loops)
const gl = renderer.getContext(), px = new Uint8Array(W * H * 4), acc = new Float32Array(W * H * 4);
const out = document.createElement("canvas"); out.width = W; out.height = H; const og = out.getContext("2d"), img = og.createImageData(W, H);
window.frame = (t, span, n) => {
  acc.fill(0);
  for (let k = 0; k < n; k++) { draw(t + span * (k + 0.5) / n); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px); for (let i = 0; i < px.length; i++) acc[i] += px[i]; }
  for (let y = 0; y < H; y++) { const src = (H - 1 - y) * W * 4, dst = y * W * 4; for (let i = 0; i < W * 4; i++) img.data[dst + i] = i % 4 === 3 ? 255 : Math.round(acc[src + i] / n); } // read bottom up
  og.putImageData(img, 0, 0); return out.toDataURL("image/png");
};
</script>`;

(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: W * SS, height: H * SS } });
  fs.writeFileSync(path.join(work, "page.html"), page);
  await p.goto("file://" + path.join(work, "page.html"));
  for (let i = 0; i < N; i++) {
    const data = await p.evaluate(([t, span, n]) => frame(t, span, n), [i / N, SHUTTER / N, SUB]);
    fs.writeFileSync(path.join(work, `f${String(i).padStart(4, "0")}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
  await b.close();
  const out = path.join(root, "minis", DAY ? "menu.bg.mp4" : "menu.night.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(work, "f%04d.png"), "-vf", `scale=${W}:${H}:flags=lanczos,gblur=sigma=0.6`, "-c:v", "libx264", "-preset", "slow", "-crf", "24",
    "-g", String(FPS * 2), "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-frames:v", "1", "-q:v", "4", out.replace(/\.mp4$/, ".jpg")]);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
})();
