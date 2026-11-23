#!/usr/bin/env python3
"""Собирает wabi-sabi/index.html из данных ниже: комнаты, выводы электрики, визуализации, мебель.
Запуск: python3 tools/build_wabi_sabi.py"""
import json, html, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'wabi-sabi', 'index.html')
E = html.escape

TYPE = {'socket': 'Розетка', 'switch': 'Выключатель', 'light': 'Свет'}

ROOMS = [
    dict(key='kitchen', num='01', title='Кухня', url='models/kitchen.glb', prefix='KITCHEN',
         hx=1.475, hz=2.015, size='2,95 × 4,03 м · потолок 3,2 м', iso=[1.0, 2.4, 0.45],
         walls=dict(N='стена с окном', S='проход из прихожей', E='барная стойка', W='стена с мойкой и зеркалом'),
         lead='Тёплая известковая штукатурка, фасады из шпона дуба, столешница из акрилового камня и пол «ёлочкой». '
              'Латунь — смеситель, подвесная система над столешницей и тонкая кромка арки — со временем потемнеет и станет только красивее.',
         views=[dict(id='v1', label='Вид 1', look='-x', at=0.02, back=-0.45, fov=70),
                dict(id='v2', label='Вид 2', look='-z', at=-0.15, back=-0.3, fov=64),
                dict(id='v3', label='Вид 3', look='+x', at=-0.12, back=-0.7, fov=64)],
         markers=[
             dict(id='Р1', type='socket', what='Розетка двойная', wall='N', h=1080, n=2, p=[-1.09, 1.08, -2.0175]),
             dict(id='Р2', type='socket', what='Розетка двойная', wall='E', h=1210, n=2, p=[1.477, 1.21, 0.6645]),
             dict(id='Р3', type='socket', what='Розетка двойная', wall='W', h=1080, n=2, p=[-1.457, 1.08, 0.2276]),
             dict(id='В1', type='switch', what='Выключатель', wall='E', h=1000, n=1, p=[1.4705, 1.0, -1.9514]),
             dict(id='В2', type='switch', what='Выключатель', wall='W', h=1080, n=1, p=[-1.4508, 1.08, 0.3476]),
             dict(id='С1', type='light', what='Вывод под бра', wall='W', h=2200, n=1, p=[-1.475, 2.2, -1.47]),
             dict(id='С2', type='light', what='Вывод под бра', wall='W', h=2200, n=1, p=[-1.475, 2.2, 1.4418]),
             dict(id='С3', type='light', what='Вывод под подвесную систему', wall=None, h=None, n=1, p=[-1.192, 3.2, 1.27]),
             dict(id='С4', type='light', what='Вывод под подвесную систему', wall=None, h=None, n=1, p=[-1.192, 3.2, -1.29]),
         ]),
    dict(key='hall', num='02', title='Прихожая', url='models/hall.glb', prefix='HALL',
         hx=1.31, hz=1.79, size='2,62 × 3,58 м · потолок 3,2 м', iso=[1.0, 2.4, 0.45],
         walls=dict(N='стена с входной дверью', S='шкаф', E='стена с зеркалом', W='арка в кухню'),
         lead='Та же штукатурка, что на кухне, светлый тёплый керамогранит на полу, шкаф во всю стену со шпоном дуба. '
              'Двери в коридор — скрытого монтажа, в цвет стены. Над аркой — бра, в потолке — четыре точечных светильника и люстра.',
         views=[dict(id='v1', label='Вид 1', look='+z', at=-0.11, back=-0.3, fov=64),
                dict(id='v2', label='Вид 2', look='+x', at=-0.23, back=-0.3, fov=64),
                dict(id='v3', label='Вид 3', look='-z', at=0.004, back=-0.7, fov=64),
                dict(id='v4', label='Вид 4', look='-x', at=-0.24, back=-0.4, fov=64)],
         markers=[
             dict(id='Р1', type='socket', what='Розетка', wall='N', h=300, n=1, p=[0.1396, 0.3, -1.7925]),
             dict(id='Р2', type='socket', what='Розетка двойная', wall='W', h=300, n=2, p=[-1.3125, 0.3, -1.2427]),
             dict(id='В1', type='switch', what='Блок из двух выключателей', wall='W', h=1000, n=2, p=[-1.306, 1.0, -0.8153]),
             dict(id='В2', type='switch', what='Блок из двух выключателей', wall='N', h=1000, n=2, p=[0.1396, 1.0, -1.786]),
             dict(id='С1', type='light', what='Точечный светильник', wall=None, h=None, n=1, p=[0.89, 3.2, 0.7422]),
             dict(id='С2', type='light', what='Точечный светильник', wall=None, h=None, n=1, p=[-0.92, 3.2, 0.7422]),
             dict(id='С3', type='light', what='Точечный светильник', wall=None, h=None, n=1, p=[0.89, 3.2, -1.3378]),
             dict(id='С4', type='light', what='Точечный светильник', wall=None, h=None, n=1, p=[-0.92, 3.2, -1.3378]),
             dict(id='С5', type='light', what='Вывод под бра над аркой', wall='W', h=2450, n=1, p=[-1.31, 2.4534, -0.1653]),
             dict(id='С6', type='light', what='Вывод под люстру', wall=None, h=None, n=1, p=[-0.0012, 3.2, -0.3007]),
         ]),
]

RENDERS = [
    ('k1', 1600, 1262, 'Кухня · вид 1', 'Стена с мойкой и зеркалом'),
    ('k2', 1184, 1600, 'Кухня · вид 2', 'Окно и угол со смесителем'),
    ('k3', 1600, 1268, 'Кухня · вид 3', 'Барная стойка'),
    ('h1', 1308, 1600, 'Прихожая · вид 1', 'Шкаф и скамья'),
    ('h2', 1494, 1600, 'Прихожая · вид 2', 'Зеркало и декор'),
    ('h3', 1296, 1600, 'Прихожая · вид 3', 'Входная дверь'),
    ('h4', 1490, 1600, 'Прихожая · вид 4', 'Арка в кухню'),
]

# status: ok — в продаже; wait — нет в наличии / уточняем; off — снят с производства; pick — подбираем
FURNITURE = [
    ('Кухня', [
        dict(name='Смеситель', model='Omoikiri Kanto-2 Plus-SB LG-BL', note='латунь, светлое золото, выдвижной излив',
             price='40 688 ₽', old='52 188 ₽', status='ok', st='в наличии, цена на 23.11.2026',
             url='https://hausdorf.ru/catalog/smesiteli/omoikiri/smesitel-omoikiri-kanto-2-plus-sb-lg-bl.html', shop='hausdorf.ru'),
        dict(name='Мойка', model='Omoikiri Taki 54-U/IF-LG', note='54 × 44 см, светлое золото; размер сверяем по чертежу',
             price='50 288 ₽', old='62 788 ₽', status='ok', st='цена на 19.10.2026',
             url='https://hausdorf.ru/catalog/moyki/omoikiri/moyka-omoikiri-taki-54-u-if-lg.html', shop='hausdorf.ru'),
        dict(name='Духовой шкаф с паром', model='Bosch HSG636XS6, Serie 8', note='встраиваемый',
             price=None, status='off', st='снят с производства — подберём замену той же серии'),
        dict(name='Микроволновая печь', model='Bosch BFL634GS1, Serie 8', note='встраиваемая',
             price=None, status='wait', st='сейчас нет в наличии — уточняем'),
        dict(name='Барные стулья, 2 шт.', model='Zendi Julieta', note='обивка — лён, тёмно-коричневый; чёрный металл',
             price=None, status='pick', st='бренд из Бразилии, в России не продаётся — подбираем аналог'),
        dict(name='Подвесная система над столешницей', model='латунная штанга, точечные светильники и подвесы', note='',
             price=None, status='pick', st='модель уточняется'),
        dict(name='Бра, 2 шт.', model='матовые плафоны-шары', note='', price=None, status='pick', st='модель уточняется'),
        dict(name='Зеркало', model='мягкая асимметричная форма, тонкая тёмная рама', note='', price=None, status='pick', st='модель уточняется'),
        dict(name='Кухонные фасады и шкафы', model='шпон дуба', note='', price=None, status='pick', st='изготовление по проекту'),
    ]),
    ('Прихожая', [
        dict(name='Точечные светильники, 4 шт.', model='Maytoni Alfa LED DL043-01-15W3K-RD-WB',
             note='15 Вт, 3000 K, CRI 90, Ø 85 мм', price=None, status='wait', st='цена уточняется у поставщика',
             url='https://maytoni.de/en/catalog/functional/recessed-luminaires/dl043-01-15w3k-rd-w/', shop='характеристики, maytoni.de'),
        dict(name='Люстра', model='латунь, лепестки-плафоны', note='', price=None, status='pick', st='модель уточняется'),
        dict(name='Бра над аркой', model='матовый шар', note='', price=None, status='pick', st='модель уточняется'),
        dict(name='Входная дверь', model='Aluprof MB-86', note='белая, со стеклом и латунной ручкой', price=None, status='wait', st='цена по запросу у производителя'),
        dict(name='Шкаф', model='шпон дуба, светлые вставки, круглые латунные ручки', note='', price=None, status='pick', st='изготовление по проекту'),
        dict(name='Скамья', model='массив дерева', note='', price=None, status='pick', st='подбираем'),
        dict(name='Консоль', model='тёмное дерево, точёные ножки', note='', price=None, status='pick', st='подбираем'),
        dict(name='Напольное зеркало', model='тонкая чёрная рама, опора', note='', price=None, status='pick', st='подбираем'),
        dict(name='Декор на стене', model='латунь, металл', note='', price=None, status='pick', st='подбираем'),
    ]),
]

STATUS_LABEL = {'ok': 'в продаже', 'wait': 'уточняем', 'off': 'снят', 'pick': 'подбор'}


def room_html(r):
    views = ''.join(f'<button type="button" class="chip" data-view="{v["id"]}" aria-pressed="false">{E(v["label"])}</button>' for v in r['views'])
    rows = []
    for m in r['markers']:
        where = r['walls'][m['wall']] if m['wall'] else 'потолок'
        h = f'{m["h"]:,}'.replace(',', ' ') if m['h'] else '—'
        rows.append(f'<tr data-pin="{m["id"]}"><td><span class="pin-dot pin-{m["type"]}">{m["id"]}</span></td>'
                    f'<td>{E(m["what"])}</td><td>{E(where)}</td><td class="num">{h}</td><td class="num">{m["n"]}</td></tr>')
    return f'''
<section class="room" id="{r['key']}" aria-labelledby="{r['key']}-h">
  <div class="wrap">
    <header class="sec-head">
      <span class="sec-num mono">{r['num']}</span>
      <h2 id="{r['key']}-h">{E(r['title'])}</h2>
      <p class="sec-meta mono">{E(r['size'])}</p>
    </header>
    <p class="room-lead">{E(r['lead'])}</p>
    <div class="viewer" data-room="{r['key']}">
      <div class="toolbar" role="group" aria-label="Управление моделью">
        <div class="tool-group">
          <button type="button" class="chip" data-view="iso" aria-pressed="true">3D</button>
          <button type="button" class="chip" data-view="plan" aria-pressed="false">План</button>
          {views}
        </div>
        <div class="tool-group">
          <button type="button" class="chip chip-strong" data-act="ceiling" aria-pressed="false"><span>Вернуть потолок</span></button>
        </div>
        <div class="tool-group layers">
          <button type="button" class="chip chip-layer" data-layer="socket" aria-pressed="true"><i class="pin-dot pin-socket"></i>Розетки</button>
          <button type="button" class="chip chip-layer" data-layer="switch" aria-pressed="true"><i class="pin-dot pin-switch"></i>Выключатели</button>
          <button type="button" class="chip chip-layer" data-layer="light" aria-pressed="true"><i class="pin-dot pin-light"></i>Свет</button>
        </div>
      </div>
      <div class="stage">
        <img class="stage-poster" src="img/{r['key']}-model.webp" width="1600" height="1000" alt="Модель: {E(r['title']).lower()} без потолка" decoding="async">
        <div class="stage-gl"></div>
        <div class="pins" aria-label="Метки выводов"></div>
        <p class="stage-status mono" aria-live="polite"></p>
        <button type="button" class="btn stage-start" hidden>Открыть 3D-модель</button>
        <p class="stage-hint mono">Крутите мышью или пальцем · приблизить: щелчок по модели и колесо, на телефоне — два пальца</p>
      </div>
      <p class="pin-info mono">Нажмите на метку на модели или на строку в таблице</p>
    </div>
    <div class="outputs-wrap">
      <h3 class="tool-label">Выводы электрики · {E(r['title']).lower()}</h3>
      <table class="outputs">
        <thead><tr><th>Метка</th><th>Что</th><th>Где</th><th class="num">Высота, мм</th><th class="num">Шт.</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
      <p class="small">Высота — от чистового пола до центра вывода. Данные сняты с 3D-модели; перед монтажом сверяйте с электропроектом.</p>
    </div>
  </div>
</section>'''


def gallery_html():
    out = []
    for room, pref in (('Кухня', 'k'), ('Прихожая', 'h')):
        items = []
        for (k, w, h, t, sub) in RENDERS:
            if k[0] != pref:
                continue
            ar = round(w / h, 4)
            items.append(f'''<figure class="shot" style="flex-grow:{ar};flex-basis:{round(ar * 220)}px">
  <a href="img/{k}.webp" data-full="img/{k}.webp" data-cap="{E(t)} — {E(sub)}" class="shot-link">
    <img src="img/{k}-900.webp" srcset="img/{k}-900.webp 900w, img/{k}.webp {w}w" sizes="(min-width: 1024px) 34vw, (min-width: 640px) 50vw, 100vw"
         width="{w}" height="{h}" alt="{E(t)}: {E(sub).lower()}" loading="lazy" decoding="async">
  </a>
  <figcaption><span class="mono">{E(t)}</span> {E(sub)}</figcaption>
</figure>''')
        out.append(f'<h3 class="furn-h gal-h">{room}</h3>\n<div class="gal-row">' + '\n'.join(items) + '</div>')
    return '\n'.join(out)


def furniture_html():
    out = []
    for room, items in FURNITURE:
        rows = []
        for it in items:
            price = f'<b class="price num">{it["price"]}</b>' + (f'<s class="num">{it["old"]}</s>' if it.get('old') else '') if it.get('price') else '<span class="price-none">—</span>'
            link = f'<a href="{it["url"]}" target="_blank" rel="noopener">{E(it["shop"])}<span class="ext" aria-hidden="true">↗</span></a>' if it.get('url') else ''
            note = f'<span class="f-note">{E(it["note"])}</span>' if it.get('note') else ''
            rows.append(f'''<tr>
  <td class="f-name">{E(it["name"])}</td>
  <td class="f-model"><span>{E(it["model"])}</span>{note}</td>
  <td class="f-price">{price}</td>
  <td class="f-status"><span class="tag tag-{it["status"]}">{STATUS_LABEL[it["status"]]}</span><span class="f-st">{E(it["st"])}</span>{link}</td>
</tr>''')
        out.append(f'''<div class="furn-room">
  <h3 class="furn-h">{E(room)}</h3>
  <table class="furn">
    <thead><tr><th>Позиция</th><th>Модель</th><th>Цена</th><th>Где купить</th></tr></thead>
    <tbody>{''.join(rows)}</tbody>
  </table>
</div>''')
    return '\n'.join(out)


CFG = {r['key']: dict(url=r['url'], prefix=r['prefix'], hx=r['hx'], hz=r['hz'], iso=r['iso'], views=r['views'],
                      markers=[dict(id=m['id'], type=m['type'], what=m['what'], wall=m['wall'], h=m['h'], p=m['p'],
                                    where=(r['walls'][m['wall']] if m['wall'] else 'потолок')) for m in r['markers']])
       for r in ROOMS}

PAGE = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<title>Wabi-Sabi. Кухня и прихожая | DGC Architects</title>
<meta name="description" content="Проект интерьера в стиле ваби-саби: 3D-модели кухни и прихожей, выводы электрики, визуализации и мебель.">
<meta property="og:title" content="Wabi-Sabi. Кухня и прихожая">
<meta property="og:description" content="3D-модели, выводы электрики, визуализации и мебель. DGC Architects.">
<meta property="og:image" content="https://doctortima.github.io/DGC.Architects/wabi-sabi/img/og.jpg">
<meta name="theme-color" content="#EFEEEA">
<link rel="preload" href="../assets/fonts/dela-gothic-one-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../css/fonts.css">
<link rel="stylesheet" href="wabi.css">
<script>document.documentElement.className += ' js';</script>
</head>
<body>
<a class="skip" href="#kitchen">К модели кухни</a>
<header class="site-head">
  <div class="wrap head-row">
    <a class="logo" href="#top"><span class="logo-dgc">DGC</span><span class="logo-rest">.Architects</span></a>
    <span class="head-kicker mono">Журнал · проект интерьера</span>
    <nav class="site-nav" aria-label="Разделы">
      <a class="nav-link" href="#kitchen">Кухня</a>
      <a class="nav-link" href="#hall">Прихожая</a>
      <a class="nav-link" href="#renders">Визуализации</a>
      <a class="nav-link" href="#furniture">Мебель</a>
    </nav>
  </div>
</header>

<main id="top">
<section class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
      <p class="kicker mono">Мальцево · кухня и прихожая · ноябрь 2026</p>
      <h1 class="hero-title">WABI-<br>SABI</h1>
      <p class="hero-lead">Ваби-саби — красота несовершенного: известковая штукатурка с живой фактурой, дерево с открытой текстурой, латунь, которая темнеет со временем. Ничего глянцевого и ничего лишнего.</p>
      <p class="hero-sub">Здесь обе комнаты в 3D. Их можно покрутить, снять и вернуть потолок и посмотреть, где будут розетки, выключатели и выводы под свет. Ниже — визуализации и мебель со ссылками и ценами.</p>
      <ul class="hero-index mono">
        <li><a href="#kitchen"><span>01</span>Кухня · 3D</a></li>
        <li><a href="#hall"><span>02</span>Прихожая · 3D</a></li>
        <li><a href="#renders"><span>03</span>Визуализации</a></li>
        <li><a href="#furniture"><span>04</span>Мебель и техника</a></li>
      </ul>
    </div>
    <figure class="hero-fig">
      <img src="img/k2.webp" width="1184" height="1600" alt="Кухня: окно, латунный смеситель, барные стулья" fetchpriority="high" decoding="async">
      <figcaption class="mono">Кухня · вид 2</figcaption>
    </figure>
  </div>
</section>

{''.join(room_html(r) for r in ROOMS)}

<section class="renders" id="renders" aria-labelledby="renders-h">
  <div class="wrap">
    <header class="sec-head">
      <span class="sec-num mono">03</span>
      <h2 id="renders-h">Визуализации</h2>
      <p class="sec-meta mono">7 видов · нажмите, чтобы открыть крупно</p>
    </header>
    <div class="gallery">
{gallery_html()}
    </div>
  </div>
</section>

<section class="furniture" id="furniture" aria-labelledby="furniture-h">
  <div class="wrap">
    <header class="sec-head">
      <span class="sec-num mono">04</span>
      <h2 id="furniture-h">Мебель и техника</h2>
      <p class="sec-meta mono">Откуда вещи и сколько стоят</p>
    </header>
    <p class="room-lead">Цены — из магазинов на дату в строке, со скидкой, если она есть; перед заказом их стоит проверить. Где написано «подбор», модель из проекта не продаётся в России или ещё не выбрана окончательно — мы предложим варианты.</p>
{furniture_html()}
  </div>
</section>
</main>

<footer class="site-foot">
  <div class="wrap foot-row mono">
    <span><span class="logo-dgc">DGC</span>.Architects · 2026</span>
    <span>Страница для заказчика. Не для публикации.</span>
  </div>
</footer>

<dialog class="lightbox" aria-label="Визуализация крупно">
  <button type="button" class="lb-close" aria-label="Закрыть">×</button>
  <img alt="">
  <p class="lb-cap mono"></p>
</dialog>

<script>window.WABI_ROOMS = {json.dumps(CFG, ensure_ascii=False)};</script>
<script src="page.js" defer></script>
</body>
</html>
'''

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(PAGE)
print('written', OUT, len(PAGE))
