# the regression page from an index.html (default: the current one): the cart can be held still, the random numbers seeded at
# each level's start (its plan the same run to run), draw counts readable
import sys, re
src = sys.argv[1] if len(sys.argv) > 1 else '/home/user/limbus/index.html'
out = sys.argv[2] if len(sys.argv) > 2 else '/home/user/work/reg/t.html'
s = open(src).read()
s = s.replace('let sp = BASE_SPEED *', 'let sp = (window.__still ? 0 : 1) * BASE_SPEED *', 1)
a = '  const RAIL_CLEAR = 0.42;\n'
s = s.replace(a, a + '''  window.__ri = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles });
  window.__seed = n => { let x = n >>> 0; Math.random = () => { x = (x + 0x6D2B79F5) | 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
''', 1)
mm = re.search(r"const raw = Math\.min\(0\.05, \(now - last\) / 1000\)", s); assert mm
s = s.replace(mm.group(0), "const raw = window.__dtfix !== undefined ? window.__dtfix : Math.min(0.05, (now - last) / 1000)", 1)
open(out, 'w').write(s)
