// Renders Vitrum's thunderstorm once, offline: a few cumulonimbus with anvils, raymarched through 3D noise and lit by the
// sun with their own shadow, seen from far off across the horizon. The sky (src/game.html, mode 8) lays the picture at
// the storm's side, bigger and darker as the Dark nears, and lights it with its lightning.
//   node tools/storm_cloud.js     -> minis/storm.jpg (its colour) and minis/storm.a.jpg (its cover, grey), 1024x400
// Needs Playwright and ffmpeg; three.js is the one the Android build ships (android/three.min.js).
// The picture spans STORM_W radians of the horizon and STORM_H radians up from it (the sky shader must use the same).
const { chromium } = require("playwright");
const { execFileSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const W = 1024, H = 400, STORM_W = 1.6, STORM_H = 0.625;
const root = path.resolve(__dirname, ".."), work = fs.mkdtempSync(path.join(os.tmpdir(), "storm-"));

const frag = `
precision highp float;
varying vec2 vUv; uniform float pass; // pass 0: colour, 1: cover
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
// the cells, in km: x across, z away, their radius and the height of their tops; the anvils sheared to +x
const int N = 5;
vec4 cell(int i) {
  if (i == 0) return vec4(-14.0, -47.0, 8.5, 9.5);
  if (i == 1) return vec4(-3.0, -52.0, 12.5, 14.0);
  if (i == 2) return vec4(8.0, -46.0, 8.5, 11.0);
  if (i == 3) return vec4(19.0, -55.0, 9.0, 12.0);
  return vec4(-25.0, -58.0, 7.5, 8.0);
}
float envelope(vec3 p) {
  // a broad dark body all along the front, from the base up some 5 km, the towers rising out of it
  vec3 q = (p - vec3(-2.0, 2.4, -52.0)) / vec3(30.0, 3.4, 11.0);
  float e = smoothstep(1.0, 0.55, length(q)) * smoothstep(1.2, 1.7, p.y);
  for (int i = 0; i < N; i++) {
    vec4 c = cell(i); float base = 1.4, top = c.w, y = p.y;
    if (y < base - 0.2 || y > top + 1.6) continue;
    float k = clamp((y - base) / (top - base), 0.0, 1.2);
    // the tower: wide at the foot, narrowing, then the anvil spreading out at its top, downwind
    float r = c.z * (1.0 - 0.3 * k) * (0.9 + 0.2 * sin(y * 0.9 + float(i))); // a tower, a little narrower up, its sides heaving
    vec2 d = p.xz - c.xy;
    float dome = sqrt(max(0.0, 1.0 - pow(max(0.0, y - top * 0.8) / (top * 0.24), 2.0))); // a rounded head, up into the anvil
    float tower = smoothstep(r * dome + 0.01, r * dome * 0.35, length(d)) * smoothstep(base - 0.2, base + 0.3, y);
    float big = step(13.0, top); // only the tallest carries the anvil
    float an = big * smoothstep(top * 0.88, top * 0.96, y) * smoothstep(top + 0.7, top + 0.15, y);
    float ar = c.z * (0.9 + 1.4 * smoothstep(top * 0.88, top + 0.4, y));
    vec2 da = d - vec2(c.z * 1.1 * smoothstep(top * 0.86, top + 0.4, y), 0.0);
    float anvil = an * smoothstep(ar, ar * 0.45, length(da * vec2(0.85, 1.4)));
    e = max(e, max(tower, anvil));
  }
  return e;
}
float density(vec3 p) {
  float e = envelope(p); if (e < 0.01) return 0.0;
  float n = fbm(p * 0.24 + vec3(0.0, -0.08 * p.y, 0.0)); // great lumps a few km across
  float b = 1.0 - abs(fbm(p * 0.75 + 7.0) * 2.0 - 1.0); // and billows on them
  float d = e * 1.25 - 0.62 + (n - 0.5) * 1.9 + (b - 0.5) * 0.7;
  return clamp(d, 0.0, 1.0) * 2.2;
}
void main() {
  float az = (vUv.x - 0.5) * ${STORM_W}, el = vUv.y * ${STORM_H};
  vec3 rd = normalize(vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el)));
  vec3 sun = normalize(vec3(sin(1.75) * cos(0.4), sin(0.4), -cos(1.75) * cos(0.4))); // off to the right and a little behind: dark masses, bright rims
  float T = 1.0; vec3 col = vec3(0.0);
  float t = 20.0;
  for (int i = 0; i < 140; i++) {
    vec3 p = rd * t; float dt = 0.45 + t * 0.006;
    if (p.y > 16.0 || t > 95.0) break;
    float d = density(p);
    if (d > 0.001) {
      float sh = 0.0; for (int j = 1; j <= 6; j++) sh += density(p + sun * float(j) * 0.7);
      float light = exp(-sh * 0.85) + 0.1 * exp(-sh * 0.15), pow1 = 1.0 - exp(-d * 2.0); // shadowed by itself, a little light scattered on
      float hgt = clamp((p.y - 1.4) / 12.0, 0.0, 1.0);
      vec3 sunC = vec3(1.0, 0.96, 0.88) * 3.6 * light * (0.45 + 0.55 * pow1);
      vec3 amb = mix(vec3(0.035, 0.045, 0.07), vec3(0.32, 0.38, 0.52), hgt * hgt) * 0.8;
      vec3 c = (sunC * mix(0.6, 1.0, hgt) + amb * 0.7) * mix(0.45, 1.0, sqrt(hgt)); // the lower, the darker: a heavy foot
      float a = 1.0 - exp(-d * dt * 0.9);
      col += T * a * c; T *= 1.0 - a;
      if (T < 0.01) break;
    }
    t += dt;
  }
  float cover = 1.0 - T;
  vec3 c = cover > 0.001 ? col / cover : vec3(0.0);
  c = pow(c / (1.0 + c), vec3(1.0 / 1.6)); // tone mapped
  gl_FragColor = pass < 0.5 ? vec4(c, 1.0) : vec4(vec3(cover), 1.0);
}`;
const page = `<body style="margin:0"><canvas id="c" width="${W}" height="${H}"></canvas><script>${fs.readFileSync(path.join(root, "android", "three.min.js"), "utf8")}</script><script>
const r = new THREE.WebGLRenderer({ canvas: document.getElementById("c"), preserveDrawingBuffer: true }), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const U = { pass: { value: 0 } };
sc.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: U, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: ${JSON.stringify(frag)} })));
window.shot = p => { U.pass.value = p; r.render(sc, cam); return document.getElementById("c").toDataURL("image/png"); };
</script>`;

(async () => {
  fs.writeFileSync(path.join(work, "page.html"), page);
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
  const p = await b.newPage({ viewport: { width: W, height: H } });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("file://" + path.join(work, "page.html"));
  for (const [i, name] of [[0, "storm.jpg"], [1, "storm.a.jpg"]]) {
    const d = await p.evaluate(i => shot(i), i);
    const png = path.join(work, name + ".png"); fs.writeFileSync(png, Buffer.from(d.split(",")[1], "base64"));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-i", png, ...(i ? ["-pix_fmt", "gray"] : []), "-q:v", "3", path.join(root, "minis", name)]);
  }
  if (errs.length) console.log(errs.join("\n"));
  await b.close();
  for (const n of ["storm.jpg", "storm.a.jpg"]) console.log(n, (fs.statSync(path.join(root, "minis", n)).size / 1e3).toFixed(0), "kB");
})();
