#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FORGED frontend restructuring — split monolithic styles.css + app.js into
per-component / per-page files, rewrite the 8 HTML pages, delete monoliths.
Anchors are content-verified (regex) so the split fails loudly if code drifts.
"""
import re, os, shutil

ROOT = '/home/z/my-project/download/forged-full-project/frontend'
BAK = '/home/z/my-project/scripts/_split_backup'
os.makedirs(BAK, exist_ok=True)

js_path, css_path = f'{ROOT}/app.js', f'{ROOT}/styles.css'
if not os.path.exists(js_path) and os.path.exists(f'{BAK}/app.js'):
    shutil.copy(f'{BAK}/app.js', js_path)
    shutil.copy(f'{BAK}/styles.css', css_path)
    print('>> monoliths restored from backup for re-split')

js_src = open(js_path, encoding='utf-8').read().split('\n')
css_src = open(css_path, encoding='utf-8').read().split('\n')

def find(src, pattern, start=0, what=''):
    rx = re.compile(pattern)
    for i in range(start, len(src)):
        if rx.search(src[i]):
            return i  # 0-indexed
    raise SystemExit(f'ANCHOR NOT FOUND: {what or pattern} (from line {start+1})')

def hdr_start(src, text_idx):
    """walk back from a section-title line to the opening /* == line"""
    i = text_idx
    while i > 0 and not src[i].startswith('/* =='):
        i -= 1
    return i

def slice_inc(src, a, b):
    """inclusive 0-indexed slice, trailing/leading blanks trimmed"""
    out = src[a:b+1]
    while out and not out[-1].strip(): out.pop()
    while out and not out[0].strip(): out.pop(0)
    return out

def section(src, text_pat, end_pat, name, start=0, drop_last=0):
    """grab a whole banner-comment section: from /* == above text_pat to end_pat (inclusive), minus drop_last trailing lines"""
    t = find(src, text_pat, start, name)
    a = hdr_start(src, t)
    b = find(src, end_pat, t, name + ' end')
    out = slice_inc(src, a, b)
    for _ in range(drop_last):
        if out and not out[-1].strip(): out.pop()
        else: out.pop()
    return out

def between(src, a_pat, b_pat, name, a_off=0, b_off=0, start=0):
    """lines from a_pat+a_off to b_pat+b_off inclusive (0-indexed offsets)"""
    a = find(src, a_pat, start, name + ' A') + a_off
    b = find(src, b_pat, a, name + ' B') + b_off
    return slice_inc(src, a, b)

made = {}
def emit(path, header, lines):
    lines = [l for l in lines]
    out = ([header] if header else []) + lines + ['']
    p = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write('\n'.join(out))
    made[path] = len('\n'.join(out))

# ================================================================ JS ====
J = {}

# ---- data ----
J['js/data/fallback-catalog.js'] = between(js_src, r'catalog \(bundled offline mirror', r'^\];', 'FALLBACK')
J['js/data/journal.js']          = between(js_src, r'^/\* -+ BLOG / GUIDES -+ \*/', r'^\];', 'POSTS')

# ---- core ----
J['js/core/api.js']     = section(js_src, r'BACKEND API LAYER', r'^}$', 'api()')
J['js/core/config.js']  = between(js_src, r'^/\* live config', r'^\}\)\(\);', 'config')
J['js/core/utils.js']   = between(js_src, r'^/\* -+ utils -+ \*/', r'^const firstStock', 'utils')
cat_a = find(js_src, r'^let PRODUCTS = FALLBACK_PRODUCTS', 0, 'catstate')
cat_b = find(js_src, r'^let FREE_SHIP', 0, 'freeship')
J['js/core/catalog.js'] = (slice_inc(js_src, cat_a, cat_b)
    + ['']
    + section(js_src, r'CATALOG FROM API', r'^/\* -+ state -+ \*/', 'adapt', drop_last=1))
J['js/core/orders.js']  = between(js_src, r'server order \(publicView\)', r'raw:o\};\}$', 'adaptOrder')
J['js/core/store.js'] = (
    between(js_src, r'^/\* -+ state -+ \*/', r'^const persist', 'state')
    + slice_inc(js_src, find(js_src, r'^const persist', 0, 'persist')+1,
                        find(js_src, r'^/\* -+ utils -+ \*/', 0, 'u2')-1)
    + between(js_src, r'^/\* -+ cart -+ \*/', r'^/\* -+ wishlist -+ \*/', 'cart', b_off=-1)
    + between(js_src, r'^/\* -+ wishlist -+ \*/', r'^/\* -+ drawers -+ \*/', 'wish', b_off=-1)
    + slice_inc(js_src, find(js_src, r'ACCOUNT .+ JWT', 0, 'acct')+1,
                        find(js_src, r'^const ordStatusClass', 0, 'ordc')-1)
    + ['',
       '/* renderCheckout is fully implemented in js/pages/checkout.js; this no-op stub keeps',
       '   shared cart/wishlist actions safe on pages that do not load the checkout module. */',
       'var renderCheckout=function(){return{sum:0,shipCost:0,disc:0,total:0};};'])

# ---- components ----
J['js/components/product-card.js'] = between(js_src, r'^/\* -+ card renderer -+ \*/', r'^function renderCarousel', 'card', b_off=-1)
J['js/components/search.js']       = between(js_src, r'^/\* -+ search autocomplete -+ \*/', r'^/\* -+ cart -+ \*/', 'search', b_off=-1)
J['js/components/drawers.js']      = between(js_src, r'^/\* -+ drawers -+ \*/', r'^/\* -+ global click delegation -+ \*/', 'drawers', b_off=-1)
J['js/components/mobile-panel.js'] = between(js_src, r'^/\* -+ mobile panel -+ \*/', r'^/\* =+$', 'mobile', b_off=-1)
J['js/components/pdp.js']          = section(js_src, r'^   PDP$', r'^\}\)\(\);', 'pdp')
pdp_start = find(js_src, r'^   PDP$', 0, 'pdp for escape')
J['js/components/global-events.js'] = (
    between(js_src, r'^/\* -+ global click delegation -+ \*/', r'^/\* -+ mobile panel -+ \*/', 'clickde', b_off=-1)
    + ['']
    + between(js_src, r"^document\.addEventListener\('keydown',e=>\{", r'^\}\);', 'escape', start=pdp_start))
J['js/components/hero.js']     = section(js_src, r'HERO REEL', r"^on\('#heroMedia'", 'hero')
rg_end = hdr_start(js_src, find(js_src, r'SCROLL FX', 0, 'sf'))  # carousel runs until the SCROLL FX banner
J['js/components/carousel.js'] = (
    between(js_src, r'^function renderCarousel\(\)\{', r'^}$', 'renderCarousel')
    + ['']
    + slice_inc(js_src, hdr_start(js_src, find(js_src, r'^   CAROUSEL ', 0, 'car')), rg_end - 1))
J['js/components/scroll-fx.js']    = section(js_src, r'SCROLL FX', r"\$\$\('\[data-reveal\]", 'scrollfx')
J['js/components/site-content.js'] = section(js_src, r'SITE CONTENT FROM ADMIN', r'^/\* =+$', 'sitecontent', start=1040, drop_last=1)
J['js/components/newsletter.js']   = between(js_src, r'^/\* newsletter \*/', r'^\}\);', 'newsletter')

# ---- pages ----
J['js/pages/home.js'] = (
    between(js_src, r'^function renderGear\(f\)\{', r'^/\* -+ search autocomplete -+ \*/', 'renderGear', b_off=-1)
    + ['']
    + section(js_src, r'HOMEPAGE SECTIONS', r'^}$', 'homesections'))
J['js/pages/shop.js']     = between(js_src, r'^/\* -+ SHOP ALL -+ \*/', r'^/\* -+ BLOG / GUIDES -+ \*/', 'shop', b_off=-1)
J['js/pages/checkout.js'] = section(js_src, r'^   CHECKOUT$', r"^\$\$\('\.co-block input", 'checkout')
J['js/pages/guides.js']   = (
    between(js_src, r'^let blogTag=', r"^on\('#page-blog'", 'blog', b_off=-1)
    + between(js_src, r"^on\('#page-blog'", r'^\}\);', 'pageblog'))
J['js/pages/contact.js']  = between(js_src, r'^/\* -+ CONTACT -+ \*/', r'ACCOUNT .+ JWT', 'contact', b_off=-1)
J['js/pages/account.js']  = ['/* ---------- ACCOUNT — JWT via the FORGED API ---------- */'] \
    + between(js_src, r'^const ordStatusClass=', r'^/\* -+ SUCCESS -+ \*/', 'account', b_off=-1)
J['js/pages/success.js']  = ['/* ---------- SUCCESS ---------- */'] \
    + between(js_src, r'^function renderSuccess\(\)\{', r'^/\* checkout email prefill', 'success', b_off=-1)

# ---- core router + entry ----
J['js/core/router.js'] = (
    section(js_src, r'MULTI-PAGE NAVIGATION', r'^/\* -+ SHOP ALL -+ \*/', 'router', drop_last=1)
    + between(js_src, r'^/\* checkout email prefill', r'^/\* about page images', 'notes'))
J['js/main.js'] = section(js_src, r'INIT .+ catalog loads first', r'^\}\)\(\);', 'boot')

# ================================================================ CSS ===
def cb(a, b):  # css block, 1-indexed inclusive
    return slice_inc(css_src, a-1, b-1)

C = {}
C['css/base.css'] = (
    cb(1, 78)
    + ['', '/* ---- shared primitives (used across components/pages) ---- */']
    + cb(201, 204) + cb(228, 230) + cb(265, 267) + cb(526, 528) + cb(692, 694)
    + ['', '/* multi-page shell (router pages) */']
    + cb(674, 676)
    + ['', '/* ---- shared responsive ---- */', '@media (max-width:900px){']
    + cb(651, 652) + ['}'])
C['css/components/header.css'] = (
    cb(79, 128)
    + ['', '/* active route marker (multi-page nav) */'] + cb(678, 681)
    + ['', '/* ---- header responsive ---- */', '@media (max-width:1100px){']
    + cb(632, 633) + ['}', '@media (max-width:900px){'] + cb(636, 638) + ['}'])
C['css/components/hero.css'] = (
    cb(129, 163)
    + ['', '/* ---- hero responsive ---- */', '@media (max-width:620px){']
    + cb(661, 661) + cb(669, 669) + ['}'])
C['css/components/ticker.css'] = cb(164, 173)
C['css/components/product-card.css'] = (
    cb(190, 200) + cb(205, 227) + cb(231, 234)
    + ['', '/* grid blowout guard — nowrap quick-add can exceed 1fr minimum */'] + cb(831, 831)
    + ['', '/* ---- product card responsive ---- */', '@media (max-width:620px){']
    + cb(658, 660) + ['}'])
C['css/components/carousel.css'] = cb(236, 250)
C['css/pages/home.css'] = (
    ['/* HOME — category tiles · goals · arsenal grid · athletes · stories */']
    + cb(174, 189) + cb(251, 264) + cb(268, 279) + cb(368, 412)
    + ['', '/* ---- home responsive ---- */', '@media (max-width:1100px){']
    + cb(630, 631) + cb(832, 832)
    + ['}', '@media (max-width:900px){']
    + cb(639, 642) + cb(648, 650)
    + ['}', '@media (max-width:620px){']
    + cb(655, 657) + cb(833, 833) + ['}'])
C['css/components/pdp.css'] = (
    cb(280, 367)
    + ['', '/* ---- pdp responsive ---- */', '@media (max-width:900px){']
    + cb(643, 643) + ['}', '@media (max-width:620px){'] + cb(664, 667) + ['}'])
C['css/components/forms.css'] = (
    ['/* FORMS — field rows, inputs/selects, shake, radio rows (checkout · account · contact) */']
    + cb(421, 431) + cb(439, 450)
    + ['', '/* ---- forms responsive ---- */', '@media (max-width:620px){']
    + cb(662, 662) + ['}'])
C['css/pages/checkout.css'] = (
    cb(413, 420) + cb(451, 525) + cb(529, 533) + cb(677, 677)
    + ['', '/* ---- checkout responsive ---- */', '@media (max-width:900px){']
    + cb(644, 645) + ['}'])
C['css/pages/account.css'] = (
    cb(432, 438) + cb(785, 802)
    + ['', '/* ---- account responsive ---- */', '@media (max-width:1000px){']
    + cb(823, 823) + ['}'])
C['css/components/footer.css'] = (
    cb(535, 563)
    + ['', '/* ---- footer responsive ---- */', '@media (max-width:900px){']
    + cb(646, 647) + ['}', '@media (max-width:620px){'] + cb(663, 663) + cb(668, 668) + ['}'])
C['css/components/drawers.css'] = cb(564, 614)
C['css/components/toast.css'] = cb(615, 625)
C['css/pages/shop.css'] = cb(683, 691) + cb(695, 706)
C['css/pages/about.css'] = (
    cb(707, 735)
    + ['', '/* ---- about responsive ---- */', '@media (max-width:1000px){']
    + cb(815, 819) + ['}', '@media (max-width:620px){'] + cb(827, 827) + ['}'])
C['css/pages/guides.css'] = (
    cb(736, 766)
    + ['', '/* ---- guides responsive ---- */', '@media (max-width:1000px){']
    + cb(820, 821) + ['}', '@media (max-width:620px){'] + cb(826, 826) + ['}'])
C['css/pages/contact.css'] = (
    cb(767, 784)
    + ['', '/* ---- contact responsive ---- */', '@media (max-width:1000px){']
    + cb(822, 822) + ['}'])
C['css/pages/success.css'] = (
    cb(803, 813)
    + ['', '/* ---- success responsive ---- */', '@media (max-width:620px){']
    + cb(828, 828) + ['}'])

JS_BANNERS = {
    'js/data/fallback-catalog.js': "/* FORGED data — bundled offline product mirror (fallback when API/cache unreachable) */",
    'js/data/journal.js': "/* FORGED data — journal/guides posts (overridable from Admin → Content) */",
    'js/core/api.js': "/* FORGED core — API layer: base URL resolution + fetch wrapper + live settings prefetch */",
    'js/core/config.js': "/* FORGED core — live config: payment numbers, shipping divisions, label maps (admin-driven) */",
    'js/core/utils.js': "/* FORGED core — DOM helpers, ৳ money formatting, escaping, star ratings, toasts */",
    'js/core/catalog.js': "/* FORGED core — catalog state + API adapter (GET /api/products → UI shape) */",
    'js/core/orders.js': "/* FORGED core — server order (publicView) → UI order adapter */",
    'js/core/store.js': "/* FORGED core — app state, persistence, session, cart & wishlist logic */",
    'js/core/router.js': "/* FORGED core — multi-page router: go(), PAGE detection, per-page init dispatch */",
    'js/components/product-card.js': "/* FORGED component — product card renderer (index carousel/arsenal + shop grid) */",
    'js/components/search.js': "/* FORGED component — header search autocomplete + keyboard shortcuts */",
    'js/components/drawers.js': "/* FORGED component — cart & wishlist drawers + scrim */",
    'js/components/mobile-panel.js': "/* FORGED component — mobile navigation panel */",
    'js/components/pdp.js': "/* FORGED component — product detail overlay: gallery, variants, urgency, zoom, sticky bar */",
    'js/components/global-events.js': "/* FORGED component — global click delegation (cards, swatches, chips) + Escape handling */",
    'js/components/hero.js': "/* FORGED component — hero reel slideshow + web-audio ambience (index) */",
    'js/components/carousel.js': "/* FORGED component — new-arrivals carousel: auto-advance, dots, drag physics (index) */",
    'js/components/scroll-fx.js': "/* FORGED component — scrolled header, grain parallax, scroll reveals */",
    'js/components/site-content.js': "/* FORGED component — admin-driven site content (footer, newsletter, about/contact/guides, FAQs, posts) */",
    'js/components/newsletter.js': "/* FORGED component — newsletter form (footer, every page) */",
    'js/pages/home.js': "/* FORGED page — home: arsenal grid + admin-driven homepage sections & hero banners */",
    'js/pages/shop.js': "/* FORGED page — shop all: filters (search, categories, price, sort) + grid render */",
    'js/pages/checkout.js': "/* FORGED page — checkout: totals, coupon, division shipping, manual payments (bKash/Nagad/Rocket/COD), place order */",
    'js/pages/guides.js': "/* FORGED page — guides/journal: tag filters, cards, article reader */",
    'js/pages/contact.js': "/* FORGED page — contact form (→ admin inbox) + FAQ accordion */",
    'js/pages/account.js': "/* FORGED page — account: JWT login/register, order history, public order tracking */",
    'js/pages/success.js': "/* FORGED page — order success summary */",
    'js/main.js': "/* FORGED entry — boot: catalog + site content load → paint → page init */",
}
CSS_BANNER = ("/* ============================================================\n"
              "   FORGED. — {name}\n"
              "   (split from styles.css — component/page-scoped stylesheet)\n"
              "   ============================================================ */")
for path, lines in J.items():
    emit(path, JS_BANNERS[path] + "\n'use strict';", lines)
for path, lines in C.items():
    name = path.split('/')[-1][:-4].replace('-', ' ').title()
    emit(path, CSS_BANNER.format(name=name), lines)

# ================================================================ HTML ===
CSS_COMMON = ['css/base.css', 'css/components/header.css', 'css/components/footer.css',
              'css/components/drawers.css', 'css/components/toast.css', 'css/components/pdp.css']
CSS_PAGE = {
    'index':    CSS_COMMON + ['css/components/hero.css', 'css/components/ticker.css',
                              'css/components/product-card.css', 'css/components/carousel.css', 'css/pages/home.css'],
    'shop':     CSS_COMMON + ['css/components/product-card.css', 'css/pages/shop.css'],
    'checkout': CSS_COMMON + ['css/components/forms.css', 'css/pages/checkout.css'],
    'contact':  CSS_COMMON + ['css/components/forms.css', 'css/pages/contact.css'],
    'account':  CSS_COMMON + ['css/components/forms.css', 'css/pages/account.css'],
    'about':    CSS_COMMON + ['css/pages/about.css'],
    'guides':   CSS_COMMON + ['css/pages/guides.css'],
    'success':  CSS_COMMON + ['css/pages/success.css'],
}
JS_SHARED = ['js/data/fallback-catalog.js', 'js/data/journal.js',
             'js/core/api.js', 'js/core/config.js', 'js/core/utils.js',
             'js/core/catalog.js', 'js/core/orders.js', 'js/core/store.js',
             'js/components/search.js', 'js/components/drawers.js', 'js/components/mobile-panel.js',
             'js/components/pdp.js', 'js/components/global-events.js', 'js/components/scroll-fx.js',
             'js/components/site-content.js', 'js/components/newsletter.js']
JS_PAGE = {
    'index':    JS_SHARED + ['js/components/product-card.js', 'js/components/hero.js',
                             'js/components/carousel.js', 'js/pages/home.js', 'js/core/router.js', 'js/main.js'],
    'shop':     JS_SHARED + ['js/components/product-card.js', 'js/pages/shop.js', 'js/core/router.js', 'js/main.js'],
    'checkout': JS_SHARED + ['js/pages/checkout.js', 'js/core/router.js', 'js/main.js'],
    'contact':  JS_SHARED + ['js/pages/contact.js', 'js/core/router.js', 'js/main.js'],
    'account':  JS_SHARED + ['js/pages/account.js', 'js/core/router.js', 'js/main.js'],
    'about':    JS_SHARED + ['js/core/router.js', 'js/main.js'],
    'guides':   JS_SHARED + ['js/pages/guides.js', 'js/core/router.js', 'js/main.js'],
    'success':  JS_SHARED + ['js/pages/success.js', 'js/core/router.js', 'js/main.js'],
}
PAGE_FILE = {'index':'index.html','shop':'shop.html','checkout':'checkout.html','contact':'contact.html',
             'account':'account.html','about':'about.html','guides':'guides.html','success':'success.html'}

for page, fname in PAGE_FILE.items():
    fp = os.path.join(ROOT, fname)
    html = open(fp, encoding='utf-8').read()
    # revert a previous split (idempotent re-run)
    html = re.sub(r'<!-- styles:[^>]*-->\n(?:<link rel="stylesheet" href="css/[^"]+">\n?)+',
                  '<link rel="stylesheet" href="styles.css">', html)
    html = re.sub(r'<!-- scripts:[^>]*-->\n(?:<script src="js/[^"]+"></script>\n?)+',
                  '<script src="app.js"></script>', html)
    assert '<link rel="stylesheet" href="styles.css">' in html, f'{fname}: styles.css link missing'
    assert '<script src="app.js"></script>' in html, f'{fname}: app.js tag missing'
    css_block = '\n'.join(f'<link rel="stylesheet" href="{h}">' for h in CSS_PAGE[page])
    js_block = '\n'.join(f'<script src="{s}"></script>' for s in JS_PAGE[page])
    html = html.replace('<link rel="stylesheet" href="styles.css">',
                        '<!-- styles: split per component/page (source of truth = css/) -->\n' + css_block)
    html = html.replace('<script src="app.js"></script>',
                        '<!-- scripts: split per component/page (source of truth = js/) -->\n' + js_block)
    open(fp, 'w', encoding='utf-8').write(html)

# delete monoliths (backup kept in scripts/_split_backup)
shutil.copy(f'{ROOT}/app.js', f'{BAK}/app.js')
shutil.copy(f'{ROOT}/styles.css', f'{BAK}/styles.css')
os.remove(f'{ROOT}/app.js')
os.remove(f'{ROOT}/styles.css')

print('--- files written ---')
for p in sorted(made):
    print(f'{made[p]:7d}  {p}')
print(f'\nHTML pages rewritten: {len(PAGE_FILE)} · monoliths removed (backup in scripts/_split_backup)')
