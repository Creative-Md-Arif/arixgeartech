#!/usr/bin/env python3
"""Fix pages that call context hooks in the outer Page component (outside Layout
providers). Restructure: Page renders <Layout><XInner/></Layout>; all hooks + JSX
move into XInner. Idempotent: skips files already structured correctly."""
import re, sys

BASE = '/home/z/my-project/download/forged-full-project/client/storefront/src/pages/'
FILES = {
    'shop.jsx': 'ShopInner',
    'about.jsx': 'AboutInner',
    'guides.jsx': 'GuidesInner',
    'contact.jsx': 'ContactInner',
    'account.jsx': 'AccountInner',
}

for fname, inner_name in FILES.items():
    path = BASE + fname
    src = open(path, encoding='utf-8').read()
    if 'function ' + inner_name in src:
        print(f'{fname}: already fixed, skip')
        continue
    # locate the Page function
    m = re.search(r'export default function Page\(\) \{', src)
    if not m:
        print(f'{fname}: no Page fn?! skip'); continue
    pos0 = m.end()
    # locate `  return (` after Page start
    m2 = re.search(r'\n  return \(', src[pos0:])
    if not m2:
        print(f'{fname}: no return?! skip'); continue
    posR = pos0 + m2.start()          # start of the line containing return
    head = src[pos0:posR]             # hooks + logic inside Page (before return)
    # find <Layout ...> open tag extent right after `return (`
    rest = src[posR:]
    mL = re.search(r'\(\s*\n?\s*(<Layout[^>]*>)', rest)
    if not mL:
        print(f'{fname}: no <Layout> in return?! skip'); continue
    layout_open = mL.group(1)
    inner_start = posR + mL.end()     # content right after <Layout…>
    # find matching </Layout> (first occurrence — one Layout per file)
    mC = re.search(r'</Layout>', src[inner_start:])
    if not mC:
        print(f'{fname}: no </Layout>?! skip'); continue
    inner = src[inner_start:inner_start + mC.start()]
    after = src[inner_start + mC.end():]     # `);` + closing } + mount block
    # `after` should start with `\n  );\n}` (possibly with comments) then mount
    mA = re.match(r'(\s*\);)', after)
    if not mA:
        print(f'{fname}: unexpected tail after </Layout>: {after[:40]!r}'); continue
    tail = after[mA.end():]
    # strip leading layout wrapper indentation artifact: keep inner as-is
    new_src = (
        src[:m.start()]
        + 'export default function Page() {\n  return (\n    <' + inner_name + ' />\n  );\n}\n\n'
        + 'function ' + inner_name + '() {'
        + head
        + '\n  return (\n    <>\n' + inner + '\n    </>\n  );\n}'
        + tail
    )
    open(path, 'w', encoding='utf-8').write(new_src)
    print(f'{fname}: restructured -> {inner_name}')
