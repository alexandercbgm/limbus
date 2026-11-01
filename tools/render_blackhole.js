// Renders sky/blackhole.webp, the black hole over Speculum, once (it's too heavy to trace on every frame of a phone):
// each ray from the eye is bent round the hole step by step (a photon about a Schwarzschild hole, its pull 1.5 h^2 / r^5)
// and gathers the disk's light where it crosses the disk's plane. RGB is the light, A how much of the sky behind it
// is hidden (all of it in the shadow). Seen from 24 hole-radii off, 0.4 rad each way of its middle (tan 0.42); the game
// maps it back by the same projection. Needs Playwright with a Chromium:  node tools/render_blackhole.js
const { chromium } = require("playwright"); const fs = require("fs"), path = require("path");
const SIZE = 1024, TAN = 0.42;
const FS = `precision highp float; varying vec2 vUv; uniform float pass;
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }
const float TILT = 0.22, ROLL = -0.3, GAIN = 1.7; const vec3 HOT = vec3(1.0, 0.94, 0.86), WARM = vec3(0.95, 0.5, 0.22);
void main() {
  vec3 D = vec3(0.0, 0.0, -1.0), X = vec3(1.0, 0.0, 0.0), Yv = vec3(0.0, 1.0, 0.0);
  vec3 n = normalize(D + X * vUv.x * ${TAN} + Yv * vUv.y * ${TAN});
  float L = 24.0, rin = 1.75, rout = 9.5;
  vec3 N = normalize(Yv * cos(TILT) - D * sin(TILT)); N = normalize(N * cos(ROLL) + X * sin(ROLL));
  vec3 p = -D * L, v = n; float h2 = dot(cross(p, v), cross(p, v));
  vec3 col = vec3(0.0); float a = 0.0; bool hole = false;
  for (int i = 0; i < 400; i++) {
    float r = length(p); if (r < 1.0) { hole = true; break; }
    if (r > L * 1.3 && dot(p, v) > 0.0) break;
    float dt = clamp(0.03 * r, 0.01, 1.0);
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    vec3 q0 = p; v += acc * dt; p += v * dt;
    float s0 = dot(q0, N), s1 = dot(p, N);
    if (s0 * s1 < 0.0) {
      vec3 q = mix(q0, p, s0 / (s0 - s1)); float rq = length(q);
      if (rq > rin && rq < rout) {
        vec3 qx = normalize(q - N * dot(q, N)); float ang = atan(dot(qx, Yv), dot(qx, X));
        vec2 cs = vec2(cos(ang), sin(ang)); // round the disk without a seam
        float streak = 0.4 + 0.45 * vn(vec3(rq * 6.0, cs * 1.3)) + 0.3 * vn(vec3(rq * 21.0, cs * 2.5 + 7.0)) + 0.18 * vn(vec3(rq * 60.0, cs * 4.0 + 13.0));
        float fall = pow(rin / rq, 1.5) * smoothstep(rin, rin * 1.05, rq) * smoothstep(rout, rout * 0.45, rq) + 0.04 * smoothstep(rout, rout * 0.4, rq);
        float dop = pow(clamp(1.0 + 0.35 * dot(cross(N, qx), -normalize(v)), 0.3, 2.0), 1.6);
        vec3 hot = mix(HOT, WARM, smoothstep(rin, rin * 3.5, rq));
        float k = fall * streak * dop;
        col += (1.0 - a) * hot * k * GAIN; a += (1.0 - a) * clamp(k * 0.6, 0.0, 0.9);
      }
    }
    if (a > 0.99) break;
  }
  if (hole) a = 1.0;
  float th = acos(clamp(dot(n, D), -1.0, 1.0));
  col += WARM * 0.05 * exp(-th * 9.0) * (1.0 - a);
  col *= smoothstep(1.0, 0.86, max(abs(vUv.x), abs(vUv.y))); // fade at the image's edge
  gl_FragColor = pass < 0.5 ? vec4(min(col, vec3(1.0)), 1.0) : vec4(vec3(a), 1.0);
}`;
(async () => {
  const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] }); const p = await b.newPage();
  const url = await p.evaluate(([FS, SIZE]) => {
    const c = document.createElement("canvas"); c.width = c.height = SIZE; const gl = c.getContext("webgl", { preserveDrawingBuffer: true });
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, "attribute vec2 a; varying vec2 vUv; void main(){ vUv = a; gl_Position = vec4(a, 0.0, 1.0); }")); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr); gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, "a"); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const read = ps => { gl.uniform1f(gl.getUniformLocation(pr, "pass"), ps); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); const px = new Uint8Array(SIZE * SIZE * 4); gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    const rgb = read(0), al2 = read(1);
    const o = document.createElement("canvas"); o.width = o.height = SIZE; const g = o.getContext("2d"), im = g.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) { const s = ((SIZE - 1 - y) * SIZE + x) * 4, d = (y * SIZE + x) * 4; // readPixels is bottom up
      const A = Math.max(al2[s], rgb[s], rgb[s + 1], rgb[s + 2]); // its light shows even where it hides nothing: kept by alpha, the colour scaled up to match
      im.data[d + 3] = A; for (let k = 0; k < 3; k++) im.data[d + k] = A ? Math.min(255, Math.round(rgb[s + k] * 255 / A)) : 0; }
    g.putImageData(im, 0, 0); return o.toDataURL("image/webp", 0.88);
  }, [FS, SIZE]);
  const out = path.join(__dirname, "..", "sky", "blackhole.webp"); fs.writeFileSync(out, Buffer.from(url.split(",")[1], "base64"));
  console.log(out, fs.statSync(out).size); await b.close();
})();
