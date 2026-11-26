# stdin: image bytes; argv: maxside quality fmt(jpg|png) ; stdout: bytes
import sys, io
from PIL import Image
data = sys.stdin.buffer.read()
maxside, q, fmt = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
im = Image.open(io.BytesIO(data))
im = im.convert('RGBA' if fmt == 'png' else 'RGB')
w, h = im.size
s = min(1.0, maxside / max(w, h))
if s < 1: im = im.resize((max(4, round(w * s)), max(4, round(h * s))), Image.LANCZOS)
out = io.BytesIO()
if fmt == 'png': im.save(out, 'PNG', optimize=True)
else: im.save(out, 'JPEG', quality=q, optimize=True, progressive=True)
sys.stdout.buffer.write(out.getvalue())
