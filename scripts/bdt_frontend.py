#!/usr/bin/env python3
"""FORGED. — swap USD ($) → BDT (৳) across all 8 storefront pages."""
import glob, re, sys

ROOT = '/home/z/my-project/download/forged-full-project/frontend'
total = 0

# repetitive replacements applied to every page
COMMON = [
    ('FREE SHIPPING OVER $150', 'FREE SHIPPING OVER ৳15,000'),
    ('Free shipping on orders over $150', 'Free shipping on orders over ৳15,000'),
    ('Free shipping over <i>$150</i>', 'Free shipping over <i>৳15,000</i>'),
    ('id="cartSubtotal">$0.00</b>', 'id="cartSubtotal">৳0</b>'),
]

# per-file replacements
SPECIFIC = {
    'checkout.html': [
        ('Dhaka — $2.50 · free over $150 · 2–4 working days', 'Dhaka — ৳60 · free over ৳15,000 · 2–4 working days'),
        ('id="payAmt">$0.00</b>', 'id="payAmt">৳0</b>'),
        ('id="codAmt">$0.00</b>', 'id="codAmt">৳0</b>'),
        ('id="coSubtotal">$0.00</b>', 'id="coSubtotal">৳0</b>'),
        ('id="coTotal">$0.00</b>', 'id="coTotal">৳0</b>'),
    ],
    'shop.html': [
        ('min="20" max="150" step="1" value="150"', 'min="500" max="15000" step="100" value="15000"'),
        ('id="shopRangeLab">$150</b>', 'id="shopRangeLab">৳15,000</b>'),
    ],
    'contact.html': [
        ('free over $150;', 'free over ৳15,000;'),
    ],
    'index.html': [
        ('Free shipping over $150 <i>//</i>', 'Free shipping over ৳15,000 <i>//</i>'),
        ('<i>$129</i>', '<i>৳12,490</i>'),
        ('<i>$89</i>', '<i>৳8,490</i>'),
        ('<i>$64</i>', '<i>৳6,490</i>'),
        ('<i>$42</i>', '<i>৳3,990</i>'),
        ('<i>$24</i>', '<i>৳1,990</i>'),
        ('<i>$36</i>', '<i>৳3,290</i>'),
        ('<i>$48</i>', '<i>৳4,490</i>'),
        ('<i>$54</i>', '<i>৳5,190</i>'),
    ],
}

for path in sorted(glob.glob(ROOT + '/*.html')):
    name = path.split('/')[-1]
    with open(path, encoding='utf-8') as f:
        src = f.read()
    n = 0
    for old, new in COMMON + SPECIFIC.get(name, []):
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
# safety sweep — any dollar sign left that looks like money?
left = []
for path in sorted(glob.glob(ROOT + '/*.html')):
    with open(path, encoding='utf-8') as f:
        for i, line in enumerate(f, 1):
            for m in re.finditer(r'\$\s?\d', line):
                left.append(f'{path.split("/")[-1]}:{i}: {line.strip()[:110]}')
print('LEFTOVER $-money refs:' if left else 'No leftover $-money refs ✔')
for l in left:
    print(' ', l)
sys.exit(1 if left else 0)
