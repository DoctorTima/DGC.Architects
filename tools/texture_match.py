import json, sys, io, os, math, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from PIL import Image, ImageDraw, ImageFont
# Подбор PBR-текстур Poly Haven + ambientCG по цвету образца. Запуск в песочнице Higgsfield (там есть интернет).
# TARGET — средний sRGB образца со скрина SketchUp (считать локально по вырезке), QUERIES — ключевые слова.
OUT = "out"; os.makedirs(OUT, exist_ok=True)
UA = {"User-Agent": "DGC-texture-match/1.0 (Powered by Poly Haven)"}
TARGET = {"wall": [195.9, 180.8, 161.3], "floor": [213.9, 200.7, 182.5], "wardrobe": [125.4, 109.7, 94.3], "seat": [141.5, 116.5, 84.0]}
QUERIES = {
 "wall": {"ph": ["plaster"], "acg": ["plaster"], "title": "Wall: plaster"},
 "floor": {"ph": ["tiles", "marble", "travertine", "limestone"], "acg": ["tiles", "travertine", "marble"], "title": "Floor: large tiles / stone"},
 "wardrobe": {"ph": ["veneer", "oak"], "acg": ["wood veneer", "oak"], "title": "Wardrobe: oak veneer"},
 "seat": {"ph": ["wicker", "rattan"], "acg": ["wicker", "rattan"], "title": "Seat: rattan"}}
def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r: d = r.read()
    return d if binary else json.loads(d)
def lab(rgb):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(float(x)) for x in rgb)
    X = (0.4124*r + 0.3576*g + 0.1805*b) / 0.95047; Y = 0.2126*r + 0.7152*g + 0.0722*b; Z = (0.0193*r + 0.1192*g + 0.9505*b) / 1.08883
    f = lambda t: t ** (1/3) if t > 0.008856 else 7.787*t + 16/116
    fx, fy, fz = f(X), f(Y), f(Z)
    return (116*fy - 16, 500*(fx - fy), 200*(fy - fz))
def mean_rgb(im):
    w, h = im.size; c = im.crop((w//5, h//5, w*4//5, h*4//5)).resize((32, 32)); px = list(c.getdata())
    return [sum(p[i] for p in px)/len(px) for i in range(3)]
def dist(a, b): return math.sqrt(0.25*(a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2)  # L весит меньше: тени SketchUp
ph_all = get("https://api.polyhaven.com/assets?t=textures")
def ph_cands(keys):
    out = []
    for aid, a in ph_all.items():
        hay = " ".join([aid, a.get("name", "")] + a.get("categories", []) + a.get("tags", [])).lower()
        if any(k in hay for k in keys):
            out.append({"src": "PolyHaven", "id": aid, "thumb": f"https://cdn.polyhaven.com/asset_img/thumbs/{aid}.png?width=256&height=256"})
    return out
def acg_cands(qs):
    out, seen = [], set()
    for q in qs:
        try: d = get("https://ambientcg.com/api/v2/full_json?type=Material&include=imageData&limit=40&q=" + urllib.parse.quote(q))
        except Exception as e: print("acg fail", q, e); continue
        for a in d.get("foundAssets", []):
            aid = a["assetId"]
            if aid in seen: continue
            seen.add(aid); pv = a.get("previewImage", {})
            t = pv.get("256-PNG") or pv.get("128-PNG") or next(iter(pv.values()), None)
            if t: out.append({"src": "ambientCG", "id": aid, "thumb": t})
    return out
def fetch(c):
    try:
        im = Image.open(io.BytesIO(get(c["thumb"], binary=True))).convert("RGB"); c["im"] = im; c["lab"] = lab(mean_rgb(im))
    except Exception: c["im"] = None
    return c
font = ImageFont.load_default()
try: font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
except Exception: pass
report = {}; sheets = []
for key, q in QUERIES.items():
    tl = lab(TARGET[key])
    cands = ph_cands(q["ph"]) + acg_cands(q["acg"])
    with ThreadPoolExecutor(16) as ex: cands = [c for c in ex.map(fetch, cands) if c.get("im")]
    for c in cands: c["d"] = dist(c["lab"], tl)
    cands.sort(key=lambda c: c["d"]); top = cands[:6]
    report[key] = [[c["src"], c["id"], round(c["d"], 1)] for c in cands[:12]]
    S, P = 200, 8
    sh = Image.new("RGB", (P + 7*(S+P), S + 56), "white"); d = ImageDraw.Draw(sh)
    d.rectangle((P, 28, P+S, 28+S), fill=tuple(int(v) for v in TARGET[key])); d.text((P, 6), q["title"] + "  | swatch = SketchUp sample", fill="black", font=font)
    for i, c in enumerate(top):
        x = P + (i+1)*(S+P); sh.paste(c["im"].resize((S, S)), (x, 28)); d.text((x, S+32), (c["src"][:3] + ": " + c["id"])[:28], fill="black", font=font)
    sheets.append(sh)
json.dump(report, open(OUT + "/report.json", "w"), indent=1)
W = max(s.width for s in sheets); H = sum(s.height for s in sheets); a = Image.new("RGB", (W, H), "white"); y = 0
for s in sheets: a.paste(s, (0, y)); y += s.height
a.thumbnail((1400, 1400)); a.save(OUT + "/all.jpg", quality=68)   # <=512 КиБ, чтобы вернуть через image_paths
