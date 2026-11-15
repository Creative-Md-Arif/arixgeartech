#!/usr/bin/env python3
"""FORGED Task 24 — wire useSEO into all storefront pages + PDP."""
import re, pathlib

PAGES = pathlib.Path('/home/z/my-project/download/forged-full-project/frontend/src/pages')
IMP = "import { useSEO } from '../lib/seo.jsx';"

plain = {
    'index.jsx': 'home', 'shop.jsx': 'shop', 'about.jsx': 'about', 'guides.jsx': 'guides',
    'contact.jsx': 'contact', 'membership.jsx': 'membership', 'account.jsx': 'account',
    'checkout.jsx': 'checkout', 'success.jsx': 'success',
}

for fname, key in plain.items():
    f = PAGES / fname
    src = f.read_text()
    if 'useSEO(' in src:
        print(f'skip {fname} (already wired)'); continue
    marker = 'export default function Page() {'
    assert marker in src, f'{fname}: marker missing'
    src = src.replace(marker, IMP + '\n\n' + marker, 1)
    src = src.replace(marker, marker + f'\n  useSEO({key!r});', 1)
    f.write_text(src)
    print(f'wired {fname} → {key}')

# PDP — dynamic product head
pdp = PAGES.parent / 'components' / 'PDP.jsx'
src = pdp.read_text()
if 'usePdpSEO(' not in src:
    anchor = "import { fbTrack } from '../lib/pixel.js';"
    assert anchor in src, 'PDP import anchor missing'
    src = src.replace(anchor, anchor + "\nimport { usePdpSEO } from '../lib/seo.jsx';", 1)
    anchor2 = 'const p = pdpId ? BY_ID[pdpId] : null;'
    assert anchor2 in src, 'PDP const anchor missing'
    src = src.replace(anchor2, anchor2 + '\n  usePdpSEO(p, !!pdpId);', 1)
    pdp.write_text(src)
    print('wired PDP.jsx → usePdpSEO')
else:
    print('skip PDP.jsx (already wired)')
