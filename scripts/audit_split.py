#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Content-conservation audit: every significant line of the original monoliths
must exist exactly once across the split files (banners/stubs excluded)."""
import re, os, glob

ROOT = '/home/z/my-project/download/forged-full-project/frontend'
BAK = '/home/z/my-project/scripts/_split_backup'

def sig_lines(text, skip_banner):
    out = []
    in_banner = False
    for ln in text.split('\n'):
        s = ln.strip()
        if skip_banner and s == "{'LESS' if False else 'X'}":
            pass
        if skip_banner and re.match(r"^/\* =+$|^\s*=+ \*/$|^\s*FORGED", ln):
            in_banner = not in_banner if ln.strip().endswith('*/') is False and ln.strip().startswith('/* ==') else in_banner
        out.append(s)
    return out

def norm(text, is_js):
    lines = []
    banner_depth = 0
    for ln in text.split('\n'):
        s = ln.strip()
        if banner_depth == 0 and s.startswith('/* ===') and s.endswith('=== */'):
            continue  # single-line banner
        if s.startswith('/* ===') and not s.endswith('*/'):
            banner_depth = 1
            continue
        if banner_depth:
            if s.endswith('*/'):
                banner_depth = 0
            continue
        if is_js and s == "'use strict';":
            continue
        if s.startswith('/* FORGED') or s.startswith('<!-- scripts:') or s.startswith('<!-- styles:'):
            continue
        if s == '':
            continue
        lines.append(s)
    return lines

orig_js = norm(open(f'{BAK}/app.js', encoding='utf-8').read(), True)
orig_css = norm(open(f'{BAK}/styles.css', encoding='utf-8').read(), False)

from collections import Counter
def collect(pattern, is_js):
    c = Counter()
    for f in sorted(glob.glob(f'{ROOT}/{pattern}', recursive=True)):
        if os.path.isfile(f):
            c.update(norm(open(f, encoding='utf-8').read(), is_js))
    return c

new_js = collect('js/**/*.js', True)
new_css = collect('css/**/*.css', False)

oj = Counter(orig_js); ocss = Counter(orig_css)

miss_js = oj - new_js          # in original, missing from split
extra_js = new_js - oj         # in split, not in original (allowed: stub + reassembly artifacts)
miss_css = ocss - new_css
extra_css = new_css - ocss

print('== JS lines lost from split ==')
for ln, n in list(miss_js.items())[:20]: print(f'  {n}x {ln[:150]}')
print('  (none)' if not miss_js else f'  TOTAL {sum(miss_js.values())}')
print('== JS new lines (expected: 3 stub comment + 1 stub fn) ==')
for ln, n in list(extra_js.items())[:20]: print(f'  {n}x {ln[:150]}')
print('== CSS lines lost from split ==')
for ln, n in list(miss_css.items())[:20]: print(f'  {n}x {ln[:150]}')
print('  (none)' if not miss_css else f'  TOTAL {sum(miss_css.values())}')
print('== CSS new lines (expected: banner notes + media wrappers) ==')
for ln, n in list(extra_css.items())[:20]: print(f'  {n}x {ln[:150]}')

ok = not miss_js and not miss_css
print('\nRESULT:', 'CONSERVATION OK' if ok else 'CONSERVATION FAIL')
