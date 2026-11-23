#!/usr/bin/env python3
"""Older iOS (Safari/WKWebView before 15.4) and in-app browsers: add fallbacks into built CSS files.
  * every declaration using svh/dvh/lvh gets a vh copy placed before it (an unknown unit drops the whole
    declaration, and sticky stages with height calc(100svh - ...) collapse to nothing);
  * inset: ... gets top/right/bottom/left before it (iOS before 14.5).
Usage: compat_css.py file.css [...]  (rewrites in place; safe to run on a fresh copy only once)."""
import re, sys
MARK = '/* compat: vh and inset fallbacks */'
def expand_inset(v):
    p = v.split()
    if len(p) == 1: t = r = b = l = p[0]
    elif len(p) == 2: t, r = p; b, l = t, r
    elif len(p) == 3: t, r, b = p; l = r
    else: t, r, b, l = p[:4]
    return f'top: {t}; right: {r}; bottom: {b}; left: {l}; '
def fix(css):
    if MARK in css: return css
    decl = re.compile(r'(?P<pre>[{;]\s*)(?P<prop>--?[-a-zA-Z]+|[a-zA-Z-]+)\s*:\s*(?P<val>[^;{}]+?)(?P<end>(?=\s*[;}]))')
    def rep(m):
        pre, prop, val, end = m.group('pre', 'prop', 'val', 'end')
        out = ''
        if re.search(r'\d(?:svh|dvh|lvh)\b', val) and not prop.startswith('--'):
            out += f'{prop}: ' + re.sub(r'(\d)(?:svh|dvh|lvh)\b', r'\1vh', val) + '; '
        if prop == 'inset' and '(' not in val.replace('calc(', '').replace('var(', '').replace('max(', '').replace('min(', ''):
            out += expand_inset(val.strip())
        return pre + out + f'{prop}: {val}' + end
    css = decl.sub(rep, css)
    return MARK + '\n' + css
for f in sys.argv[1:]:
    s = open(f, encoding='utf-8').read(); t = fix(s)
    open(f, 'w', encoding='utf-8').write(t)
    print(f, 'vh fallbacks', len(re.findall(r'\d(?:svh|dvh)\b', s)), '-> added', t.count('vh') - s.count('vh') - 0)
