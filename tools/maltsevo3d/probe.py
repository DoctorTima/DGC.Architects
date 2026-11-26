import sys, io
import numpy as np
from PIL import Image
im = Image.open(io.BytesIO(sys.stdin.buffer.read()))
if 'A' in im.getbands() or im.mode == 'P':
    a = np.asarray(im.convert('RGBA'))[:, :, 3]
    print(float((a < 230).mean()))
else:
    print(0.0)
