# Тонировка текстуры как в SketchUp (материал type=2).
# stdin: картинка; argv: R G B mode(0 shift|1 tint) avgR avgG avgB ; stdout: PNG (с альфой, если была)
import sys, io
import numpy as np
from PIL import Image
r, g, b, mode, ar, ag, ab = [float(v) for v in sys.argv[1:8]]
im = Image.open(io.BytesIO(sys.stdin.buffer.read()))
has_a = 'A' in im.getbands() or im.mode == 'P'
im = im.convert('RGBA')
a = np.asarray(im).astype(np.float32) / 255.0
rgb, alpha = a[..., :3], a[..., 3:]

def rgb2hls(c):
    mx, mn = c.max(-1), c.min(-1)
    l = (mx + mn) / 2
    d = mx - mn
    s = np.where(d < 1e-6, 0, np.where(l < 0.5, d / np.maximum(mx + mn, 1e-6), d / np.maximum(2 - mx - mn, 1e-6)))
    R, G, B = c[..., 0], c[..., 1], c[..., 2]
    h = np.zeros_like(l)
    dd = np.maximum(d, 1e-6)
    h = np.where(mx == R, ((G - B) / dd) % 6, h)
    h = np.where(mx == G, (B - R) / dd + 2, h)
    h = np.where(mx == B, (R - G) / dd + 4, h)
    h = np.where(d < 1e-6, 0, h) / 6.0
    return h, l, s

def hls2rgb(h, l, s):
    q = np.where(l < 0.5, l * (1 + s), l + s - l * s)
    p = 2 * l - q
    def f(t):
        t = t % 1.0
        return np.where(t < 1 / 6, p + (q - p) * 6 * t, np.where(t < 1 / 2, q, np.where(t < 2 / 3, p + (q - p) * (2 / 3 - t) * 6, p)))
    return np.stack([f(h + 1 / 3), f(h), f(h - 1 / 3)], -1)

H, L, S = rgb2hls(rgb)
ht, lt, st = [float(v[0]) for v in rgb2hls(np.array([[r, g, b]], np.float32) / 255.0)]
ha, la, sa = [float(v[0]) for v in rgb2hls(np.array([[ar, ag, ab]], np.float32) / 255.0)]
if mode < 0.5:   # shift: сдвиг тона, светлоты и насыщенности на разницу «цвет материала − средний цвет текстуры»
    H2 = (H + (ht - ha)) % 1.0
    L2 = np.clip(L + (lt - la), 0, 1)
    S2 = np.clip(S + (st - sa), 0, 1)
else:            # tint: тон и насыщенность материала, светлота текстуры со сдвигом
    H2 = np.full_like(H, ht)
    S2 = np.full_like(S, st)
    L2 = np.clip(L + (lt - la), 0, 1)
out = np.concatenate([hls2rgb(H2, L2, S2), alpha], -1)
o = Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')
if not has_a: o = o.convert('RGB')
buf = io.BytesIO(); o.save(buf, 'PNG'); sys.stdout.buffer.write(buf.getvalue())
