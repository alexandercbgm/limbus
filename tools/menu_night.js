// Draws the menu's background loops: a neon grid floor running toward the viewer under a tunnel of light streaks and glass
// shards flying out of the vanishing point; every motion has the loop's period, so the last frame runs into the first.
// node tools/menu_night.js        the night's: minis/menu.night.mp4 and its first frame (.jpg)
// node tools/menu_night.js day    the day's, the same in light: minis/menu.bg.mp4 and .jpg
// Needs Playwright and ffmpeg.
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const W = 960, H = 540, FPS = 30, SECS = 6, N = FPS * SECS;
const DAY = process.argv[2] === "day";
const P = DAY ? { bg0: "#f7fcfe", bg1: "#cfe0e8", ray: "rgba(29,111,143,0.22)", cross: "rgba(29,111,143,", crossK: 0.28, hz: "255,255,255", hzA: 0.9, core: "rgba(255,255,255,0.7)", coreEnd: "rgba(255,255,255,0)",
    streaks: ["#1d8fb0", "#7a6cff", "#4fb8d8"], streakOp: 0.55, fill: "rgba(255,255,255,", fillK: 0.5, edge: "rgba(29,111,143," }
  : { bg0: "#0e1d3a", bg1: "#03060d", ray: "rgba(42,143,208,0.32)", cross: "rgba(122,92,255,", crossK: 0.32, hz: "79,216,240", hzA: 0.35, core: "rgba(60,201,236,0.32)", coreEnd: "rgba(60,201,236,0)",
    streaks: ["#4fd8f0", "#7a6cff", "#9fe8ff"], streakOp: 1, fill: "rgba(159,232,255,", fillK: 0.13, edge: "rgba(216,246,255," };
const root = path.resolve(__dirname, ".."), work = fs.mkdtempSync(path.join(os.tmpdir(), "night-"));

const page = `<script>const P = ${JSON.stringify(P)};</script><canvas id="c" width="${W}" height="${H}"></canvas><script>
const c = document.getElementById("c"), g = c.getContext("2d"), W = ${W}, H = ${H}, VX = W / 2, VY = H * 0.42;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const streaks = Array.from({ length: 110 }, () => ({ a: rnd() * 6.283, ph: rnd(), len: 0.25 + rnd() * 0.5, w: 0.6 + rnd() * 1.6,
  col: P.streaks[Math.floor(rnd() * 3)], op: (0.25 + rnd() * 0.5) * P.streakOp }));
const shards = Array.from({ length: 34 }, () => { const n = 3 + Math.floor(rnd() * 3);
  return { a: rnd() * 6.283, ph: rnd(), spin: (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2)), rot: rnd() * 6.283, size: 0.6 + rnd() * 0.8,
    pts: Array.from({ length: n }, (_, i) => [i / n * 6.283 + (rnd() - 0.5) * 0.9, 0.5 + rnd() * 0.7]) }; });
const ease = p => p * p * p; // slow out of the distance, quick past the viewer
window.draw = t => { // t: 0..1 round the loop
  const bg = g.createRadialGradient(VX, VY, 10, VX, VY, W * 0.75); bg.addColorStop(0, P.bg0); bg.addColorStop(1, P.bg1);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // the floor: rays to the vanishing point, and cross lines running toward the viewer
  g.lineWidth = 1;
  for (let i = -16; i <= 16; i++) { g.strokeStyle = P.ray; g.beginPath(); g.moveTo(VX, VY); g.lineTo(VX + i * 95, H); g.stroke(); }
  for (let k = 0; k < 14; k++) { const q = ((k + t * 2) % 14) / 14, y = VY + (H - VY) * q * q * q;
    g.strokeStyle = P.cross + (0.06 + P.crossK * q).toFixed(3) + ")"; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // the horizon's glow
  const hz = g.createLinearGradient(0, VY - 30, 0, VY + 30); hz.addColorStop(0, "rgba(" + P.hz + ",0)"); hz.addColorStop(0.5, "rgba(" + P.hz + "," + P.hzA + ")"); hz.addColorStop(1, "rgba(" + P.hz + ",0)");
  g.fillStyle = hz; g.fillRect(0, VY - 30, W, 60);
  const core = g.createRadialGradient(VX, VY, 0, VX, VY, 120); core.addColorStop(0, P.core); core.addColorStop(1, P.coreEnd);
  g.fillStyle = core; g.fillRect(0, 0, W, H);
  // streaks of light out of the centre
  for (const s of streaks) { const p = (t + s.ph) % 1, r1 = 30 + ease(p) * W * 0.9, r2 = r1 + 40 + ease(p) * W * s.len, fade = Math.sin(p * Math.PI);
    g.strokeStyle = s.col; g.globalAlpha = s.op * fade; g.lineWidth = s.w * (0.5 + p);
    g.beginPath(); g.moveTo(VX + Math.cos(s.a) * r1, VY + Math.sin(s.a) * r1 * 0.62); g.lineTo(VX + Math.cos(s.a) * r2, VY + Math.sin(s.a) * r2 * 0.62); g.stroke(); }
  g.globalAlpha = 1;
  // glass shards flying past
  for (const s of shards) { const p = (t + s.ph) % 1, r = 20 + ease(p) * W * 0.85, sz = (4 + ease(p) * 70) * s.size, fade = Math.min(1, p * 4) * Math.min(1, (1 - p) * 3);
    const x = VX + Math.cos(s.a) * r, y = VY + Math.sin(s.a) * r * 0.62, rot = s.rot + p * 6.283 * s.spin;
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
    s.pts.forEach(([a, k], i) => { const px = Math.cos(a) * sz * k * 1.3, py = Math.sin(a) * sz * k; i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.closePath();
    g.fillStyle = P.fill + (P.fillK * fade).toFixed(3) + ")"; g.fill();
    g.strokeStyle = P.edge + (0.75 * fade).toFixed(3) + ")"; g.lineWidth = 1.2; g.stroke(); g.restore(); }
};
</script>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(page);
  for (let i = 0; i < N; i++) {
    const data = await p.evaluate(t => { draw(t); return document.getElementById("c").toDataURL("image/png"); }, i / N);
    fs.writeFileSync(path.join(work, `f${String(i).padStart(4, "0")}.png`), Buffer.from(data.split(",")[1], "base64"));
  }
  await b.close();
  const out = path.join(root, "minis", DAY ? "menu.bg.mp4" : "menu.night.mp4");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(FPS), "-i", path.join(work, "f%04d.png"), "-c:v", "libx264", "-preset", "slow", "-crf", "24",
    "-g", String(FPS * 2), "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", out, "-frames:v", "1", "-q:v", "4", out.replace(/\.mp4$/, ".jpg")]);
  console.log(out, (fs.statSync(out).size / 1e6).toFixed(2), "MB");
})();
