#!/usr/bin/env python3
"""FORGED. — legacy trees BDT patch: swap USD ($) → BDT (৳) in
   download/forged-store/*.html + app.js  and  download/forged-store-single-file.html
   Mirrors the conversion already applied to forged-full-project/frontend (Task 9)."""
import glob, re, sys

DL = '/home/z/my-project/download'
TARGETS = sorted(glob.glob(DL + '/forged-store/*.html')) + \
          [DL + '/forged-store/app.js', DL + '/forged-store-single-file.html']
total = 0

# applied to every target (HTML + JS)
COMMON = [
    ('FREE SHIPPING OVER $150', 'FREE SHIPPING OVER ৳15,000'),
    ('Free shipping on orders over $150 · dispatched in 24h', 'Free shipping on orders over ৳15,000 · dispatched in 24h'),
    ('free over $150;', 'free over ৳15,000;'),
    ('Free shipping over <i>$150</i>', 'Free shipping over <i>৳15,000</i>'),
    ('>$0.00</b>', '>৳0</b>'),
    # goal chips / product price tags
    ('<i>$129</i>', '<i>৳12,490</i>'),
    ('<i>$89</i>',  '<i>৳8,490</i>'),
    ('<i>$64</i>',  '<i>৳6,490</i>'),
    ('<i>$42</i>',  '<i>৳3,990</i>'),
    ('<i>$24</i>',  '<i>৳1,990</i>'),
    ('<i>$36</i>',  '<i>৳3,290</i>'),
    ('<i>$48</i>',  '<i>৳4,490</i>'),
    ('<i>$54</i>',  '<i>৳5,190</i>'),
]

# JS replacements (legacy app.js + inline copy inside single-file)
JS = [
    ('const FREE_SHIP = 150;', 'const FREE_SHIP = 15000; /* ৳ */'),
    ("const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));",
     "const money = n => { n=+n||0; return '৳' + (Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})); };"),
    ('price:48,compare:null',  'price:4490,compare:null'),
    ('price:42,compare:58',    'price:3990,compare:5490'),
    ('price:89,compare:null',  'price:8490,compare:null'),
    ('price:54,compare:null',  'price:5190,compare:null'),
    ('price:129,compare:null', 'price:12490,compare:null'),
    ('price:24,compare:null',  'price:1990,compare:null'),
    ('price:36,compare:null',  'price:3290,compare:null'),
    ('price:64,compare:null',  'price:6490,compare:null'),
    ('const base=express?12.9:0;', 'const base=express?120:60;'),
    ("'#stdPrice').textContent=(sum>=FREE_SHIP)?'FREE':'$6.90';",
     "'#stdPrice').textContent=(sum>=FREE_SHIP)?'FREE':'৳60';"),
    ("shopState.max=150;", "shopState.max=15000;"),
    ("shopState.max=+e.target.value;$('#shopRangeLab').textContent='$'+shopState.max;",
     "shopState.max=+e.target.value;$('#shopRangeLab').textContent='৳'+shopState.max.toLocaleString('en-US');"),
    ("$('#shopRange').value=150;$('#shopRangeLab').textContent='$150';",
     "$('#shopRange').value=15000;$('#shopRangeLab').textContent='৳15,000';"),
]

# HTML-only replacements
HTML = [
    ('data-cost="12.9"', 'data-cost="120"'),
    ('<span class="rprice">$12.90</span>', '<span class="rprice">৳120</span>'),
    ('min="20" max="150" step="1" value="150"', 'min="500" max="15000" step="100" value="15000"'),
    ('<b id="shopRangeLab">$150</b>', '<b id="shopRangeLab">৳15,000</b>'),
]

for path in TARGETS:
    name = path.replace(DL + '/', '')
    with open(path, encoding='utf-8') as f:
        src = f.read()
    rules = COMMON + HTML if path.endswith('.html') else COMMON + JS
    if path == DL + '/forged-store-single-file.html':
        rules = COMMON + JS + HTML          # single file contains both DOM and inline JS
    n = 0
    for old, new in rules:
        c = src.count(old)
        if c:
            src = src.replace(old, new)
            n += c
    if n:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(src)
    print(f'{name}: {n} replacement(s)')
    total += n

print(f'\nTOTAL: {total}')
left = []
for path in TARGETS:
    with open(path, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            for m in re.finditer(r'\$\s?[0-9][0-9,.]*', line):
                left.append(f'{path.replace(DL + "/", "")}:{i}: {m.group(0)} :: {line.strip()[:100]}')
print('LEFTOVER $-money refs:' if left else 'No leftover $-money refs ✔')
for l in left:
    print(' ', l)
sys.exit(1 if left else 0)
