# python3 cmp.py <base dir> <new dir>: mean colour difference of each shot (0-255) and the draw calls; << marks a big one
import json, sys, numpy as np
from PIL import Image
a, b = sys.argv[1], sys.argv[2]; sa = json.load(open(a + '/stats.json')); sb = json.load(open(b + '/stats.json'))
for k in sorted(set(sa) & set(sb)):
    x = np.asarray(Image.open(f'{a}/{k}.png').convert('RGB'), float); y = np.asarray(Image.open(f'{b}/{k}.png').convert('RGB'), float)
    d = abs(x - y).mean(); print(f"{k:22s} diff {d:5.1f} calls {sa[k]['calls']}->{sb[k]['calls']}" + ("  <<" if d > 3 else ""))
