# stdin: image bytes; argv: maxside quality [tint_r tint_g tint_b contrast]
import sys, io
import numpy as np
from PIL import Image
data = sys.stdin.buffer.read()
maxside, q = int(sys.argv[1]), int(sys.argv[2])
im = Image.open(io.BytesIO(data)).convert('RGB')
if len(sys.argv) > 3:
    t = np.array([float(v) for v in sys.argv[3:6]], np.float32); c = float(sys.argv[6])
    a = np.asarray(im, dtype=np.float32); m = a.mean()
    lum = a.mean(2, keepdims=True) / m
    im = Image.fromarray(np.clip(t[None, None, :] * (1 + c * (lum - 1)), 0, 255).astype(np.uint8))
w, h = im.size
s = min(1.0, maxside / max(w, h))
if s < 1: im = im.resize((max(4, round(w * s)), max(4, round(h * s))), Image.LANCZOS)
out = io.BytesIO(); im.save(out, 'JPEG', quality=q, optimize=True, progressive=True)
sys.stdout.buffer.write(out.getvalue())
