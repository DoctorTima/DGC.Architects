import json, sys
from PIL import Image, ImageDraw
from collections import defaultdict
src, out, segs_path = sys.argv[1:4]
B = [-7.75, 7.75, -5.8, 5.8]
im = Image.open(src).convert('RGB')
W, H = im.size
S = 3  # суперсэмплинг для гладких линий
ov = Image.new('RGBA', (W * S, H * S), (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
def px(x, z): return ((x - B[0]) / (B[1] - B[0]) * W * S, (z - B[2]) / (B[3] - B[2]) * H * S)
segs = [s for s in json.load(open(segs_path)) if s[0] == 'BASE']
# стены: заливка по правилу чёт-нечет построчно (надёжно и для смежных коробок)
walls = [s for s in segs if s[1] == '_5']
import numpy as np
INK = (43, 42, 39, 255)
P = np.array([[*px(s[2], s[3]), *px(s[4], s[5])] for s in walls])
mask = np.zeros((H * S, W * S), dtype=bool)
for row in range(H * S):
    yc = row + 0.5
    y0, y1 = P[:, 1], P[:, 3]
    m = (np.minimum(y0, y1) <= yc) & (np.maximum(y0, y1) > yc)
    if not m.any(): continue
    q = P[m]
    xs = np.sort(q[:, 0] + (yc - q[:, 1]) * (q[:, 2] - q[:, 0]) / (q[:, 3] - q[:, 1]))
    for a, b in zip(xs[0::2], xs[1::2]):
        mask[row, max(0, int(a)):min(W * S, int(np.ceil(b)))] = True
fill = Image.fromarray((mask * 255).astype(np.uint8))
ov.paste(Image.new('RGBA', ov.size, INK), (0, 0), fill)
d = ImageDraw.Draw(ov)
for s in walls:
    d.line([px(s[2], s[3]), px(s[4], s[5])], fill=INK, width=2 * S)
for s in segs:
    if s[1] == '_5': continue
    d.line([px(s[2], s[3]), px(s[4], s[5])], fill=(90, 88, 82, 255), width=S)
ov = ov.resize((W, H), Image.LANCZOS)
im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
im = im.resize((600, round(600 * H / W)), Image.LANCZOS)
im.save(out, 'WEBP', quality=82, method=6)
print(out)
