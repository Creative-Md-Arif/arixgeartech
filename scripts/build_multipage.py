#!/usr/bin/env python3
"""FORGED. multi-page build (Option A).

Takes scripts/deembedded.html (base64 already restored to assets/*.png paths) and produces:
  forged-store/index.html        home
  forged-store/shop.html         shop all (?cat= preselect)
  forged-store/about.html        brand story
  forged-store/guides.html       blog/guides (?post= reader)
  forged-store/contact.html      contact + FAQ
  forged-store/account.html      auth + order history
  forged-store/checkout.html     manual payment checkout
  forged-store/success.html      order confirmation
  forged-store/styles.css        shared stylesheet
  forged-store/app.js            shared engine (multi-page aware)

Every page ships the shared shell: grain, header, mobile panel, PDP overlay,
newsletter, footer, drawers, toasts — plus ONLY its own main section.
"""
import re, os, sys

SRC   = "/home/z/my-project/scripts/deembedded.html"
OUTD  = "/home/z/my-project/download/forged-store"
FAIL  = []

def check(cond, msg):
    print(("  OK  " if cond else "  FAIL") + " | " + msg)
    if not cond:
        FAIL.append(msg)

with open(SRC, encoding="utf-8") as f:
    S = f.read()

def between(s, a, b):
    i, j = s.index(a), s.index(b)
    return s[i:j]

# ============================================================ 1. slice components
print("== slicing components ==")
HEADER = between(S, '<!-- ==================== HEADER', '<!-- ==================== HERO')
HOME_A = between(S, '<!-- ==================== HERO', '<!-- ==================== PDP OVERLAY')
PDP    = between(S, '<!-- ==================== PDP OVERLAY', '<!-- ==================== ATHLETES')
HOME_B = between(S, '<!-- ==================== ATHLETES', '<!-- ==================== CHECKOUT')
CO     = between(S, '<!-- ==================== CHECKOUT', '<!-- ==================== PAGE: SHOP ALL')
P_SHOP = between(S, '<!-- ==================== PAGE: SHOP ALL', '<!-- ==================== PAGE: ABOUT')
P_ABOUT= between(S, '<!-- ==================== PAGE: ABOUT', '<!-- ==================== PAGE: BLOG')
P_BLOG = between(S, '<!-- ==================== PAGE: BLOG', '<!-- ==================== PAGE: CONTACT')
P_CONT = between(S, '<!-- ==================== PAGE: CONTACT', '<!-- ==================== PAGE: MY ACCOUNT')
P_ACCT = between(S, '<!-- ==================== PAGE: MY ACCOUNT', '<!-- ==================== PAGE: ORDER SUCCESS')
P_SUCC = between(S, '<!-- ==================== PAGE: ORDER SUCCESS', '<!-- ==================== NEWSLETTER')
NEWS   = between(S, '<!-- ==================== NEWSLETTER', '<!-- ==================== FOOTER')
FOOT   = between(S, '<!-- ==================== FOOTER', '<!-- ==================== CART / WISHLIST DRAWERS')
DRAWERS= between(S, '<!-- ==================== CART / WISHLIST DRAWERS', '<script>')

for name, part in [("HEADER",HEADER),("HOME_A",HOME_A),("PDP",PDP),("HOME_B",HOME_B),("CO",CO),
                   ("P_SHOP",P_SHOP),("P_ABOUT",P_ABOUT),("P_BLOG",P_BLOG),("P_CONT",P_CONT),
                   ("P_ACCT",P_ACCT),("P_SUCC",P_SUCC),("NEWS",NEWS),("FOOT",FOOT),("DRAWERS",DRAWERS)]:
    check(len(part) > 100, f"slice {name}: {len(part)//1024} KB")

# ============================================================ 2. styles.css
print("== styles.css ==")
m = re.search(r"<style>\n(.*?)\n</style>", S, re.S)
check(bool(m), "style block found")
css = m.group(1)
# strip single-file route-switching CSS, keep .page padding for standalone pages
pat = re.compile(
    r'body\[data-route\]:not\(\[data-route="home"\]\) \.hsec\{display:none!important\}\n'
    r'\.page\{display:none;padding:calc\(var\(--header-h\) \+ 3rem\) 0 6\.5rem;min-height:72vh\}\n'
    r'body\[data-route="shop"\] #page-shop,body\[data-route="about"\] #page-about,\n'
    r'body\[data-route="blog"\] #page-blog,body\[data-route="contact"\] #page-contact,\n'
    r'body\[data-route="account"\] #page-account,body\[data-route="success"\] #page-success,\n'
    r'body\[data-route="checkout"\] #checkout\{display:block\}\n'
    r'body\[data-route="checkout"\] #checkout\{padding-top:calc\(var\(--header-h\) \+ 2\.6rem\)\}')
css2, n = pat.subn(
    '/* multi-page build: each .html file ships only its own section,\n'
    '   so the old route-switching CSS is not needed */\n'
    '.page{padding:calc(var(--header-h) + 3rem) 0 6.5rem;min-height:72vh}\n'
    '#checkout{padding-top:calc(var(--header-h) + 2.6rem)}', css)
check(n == 1, f"route-switch CSS replaced (n={n})")
check("body[data-route" not in css2, "no route selectors left in CSS")
with open(os.path.join(OUTD, "styles.css"), "w", encoding="utf-8") as f:
    f.write(css2)
print(f"  styles.css written: {len(css2)//1024} KB")

# ============================================================ 3. app.js
print("== app.js ==")
js = S[S.index("<script>") + len("<script>"):S.rindex("</script>")].strip()
check("'use strict'" in js, "script body extracted")

# 3a. guarded binding helpers
js = js.replace(
    "const $$ = (s,c)=> [...(c||document).querySelectorAll(s)];",
    "const $$ = (s,c)=> [...(c||document).querySelectorAll(s)];\n"
    "/* guarded binding helpers — multi-page build: some elements exist only on some pages */\n"
    "const on=(s,e,f,o)=>{const el=document.querySelector(s);if(el)el.addEventListener(e,f,o);};\n"
    "const onAll=(s,e,f,o)=>{document.querySelectorAll(s).forEach(el=>el.addEventListener(e,f,o));};", 1)

# 3b. mechanical: $('#x').addEventListener('ev', -> on('#x','ev',
js, n_listeners = re.subn(r"\$\(('(?:[^'\\]|\\.)*'|\"(?:[^\"\\]|\\.)*\")\)\.addEventListener\(", r"on(\1,", js)
check(n_listeners > 30, f"listener rewrites: {n_listeners}")

def rep(old, new, label, count=1):
    global js
    c = js.count(old)
    check(c == count, f"{label} (found {c}, expected {count})")
    if c:
        js = js.replace(old, new, count)

# 3c. drawer / mobile bindings
rep("$$('[data-close]').forEach(b=>b.addEventListener('click',closeDrawers));",
    "onAll('[data-close]','click',closeDrawers);", "data-close -> onAll")
rep("$$('a',mobilePanel).forEach(a=>a.addEventListener('click',closeMobile));",
    "onAll('#mobilePanel a','click',closeMobile);", "mobile panel links -> onAll")

# 3d. FAQ accordion (context-aware rewrite)
rep("""$$('.faq-item').forEach(item=>{
  item.querySelector('.faq-q').addEventListener('click',()=>{
    const open=item.classList.contains('open');
    $$('.faq-item.open').forEach(o=>{o.classList.remove('open');o.querySelector('.faq-a').style.maxHeight='0px';});
    if(!open){item.classList.add('open');const a=item.querySelector('.faq-a');a.style.maxHeight=a.scrollHeight+'px';}
  });
});""",
"""onAll('.faq-q','click',function(){
  const item=this.closest('.faq-item');
  const open=item.classList.contains('open');
  $$('.faq-item.open').forEach(o=>{o.classList.remove('open');o.querySelector('.faq-a').style.maxHeight='0px';});
  if(!open){item.classList.add('open');const a=item.querySelector('.faq-a');a.style.maxHeight=a.scrollHeight+'px';}
});""", "FAQ accordion rewrite")

# 3e. payment upload bindings — elements exist only on checkout.html
rep("""const shotInput=$('#coPayShot'),payUp=$('#payUpload');
payUp.addEventListener('click',()=>shotInput.click());
payUp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();shotInput.click();}});
['dragover','dragenter'].forEach(ev=>payUp.addEventListener(ev,e=>{e.preventDefault();payUp.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>payUp.addEventListener(ev,e=>{e.preventDefault();payUp.classList.remove('drag');}));
payUp.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)acceptShot(f);});
shotInput.addEventListener('change',()=>{const f=shotInput.files&&shotInput.files[0];if(f)acceptShot(f);});""",
"""const shotInput=$('#coPayShot'),payUp=$('#payUpload');
if(payUp&&shotInput){
payUp.addEventListener('click',()=>shotInput.click());
payUp.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();shotInput.click();}});
['dragover','dragenter'].forEach(ev=>payUp.addEventListener(ev,e=>{e.preventDefault();payUp.classList.add('drag');}));
['dragleave','drop'].forEach(ev=>payUp.addEventListener(ev,e=>{e.preventDefault();payUp.classList.remove('drag');}));
payUp.addEventListener('drop',e=>{const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(f)acceptShot(f);});
shotInput.addEventListener('change',()=>{const f=shotInput.files&&shotInput.files[0];if(f)acceptShot(f);});
}""", "payment upload guard")

# 3f. hero slideshow — home only
rep("""idxBars.forEach((b,i)=>b.addEventListener('click',()=>{showSlide(i);heroPlay();}));
heroPlay();
document.addEventListener('visibilitychange',()=>{document.hidden?clearInterval(state.heroTimer):heroPlay();});""",
"""if(slides.length){
idxBars.forEach((b,i)=>b.addEventListener('click',()=>{showSlide(i);heroPlay();}));
heroPlay();
document.addEventListener('visibilitychange',()=>{document.hidden?clearInterval(state.heroTimer):heroPlay();});
}""", "hero guard")

# 3g. carousel — home only
rep("const carStep=()=>{const card=carTrack.firstElementChild;return card?card.getBoundingClientRect().width+18:300;};",
    "const carStep=()=>{const card=carTrack&&carTrack.firstElementChild;return card?card.getBoundingClientRect().width+18:300;};",
    "carStep null guard")
rep("function carIndex(){return Math.round(carTrack.scrollLeft/carStep());}",
    "function carIndex(){return carTrack?Math.round(carTrack.scrollLeft/carStep()):0;}",
    "carIndex null guard")
rep("""resetCarTimer();
carTrack.addEventListener('pointerenter',()=>state.carHold=true);""",
"""if(carTrack){
resetCarTimer();
carTrack.addEventListener('pointerenter',()=>state.carHold=true);""", "carousel guard open")
rep("""  carTrack.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
})();""",
"""  carTrack.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;}},true);
})();
}""", "carousel guard close")

# 3h. renderCheckout guard (called from cart handlers on every page)
rep("""function renderCheckout(){
  const {sum}=cartTotals();""",
"""function renderCheckout(){
  if(!document.getElementById('coItems'))return {sum:0,shipCost:0,disc:0,total:0};
  const {sum}=cartTotals();""", "renderCheckout guard")

# 3i. router block -> multi-page navigation
i = js.index("/* ============================================================\n   ROUTER + PAGES ENGINE")
j = js.index("/* ---------- SHOP ALL ---------- */")
NEW_ROUTER = """/* ============================================================
   MULTI-PAGE NAVIGATION — real files (index / shop / about / ...)
   go('shop?cat=X') -> shop.html?cat=X ; PAGE drives per-page init
   ============================================================ */
function go(t){
  t=(t||'').replace(/^#\\/?/,'');
  const parts=t.split('?');
  const FILE_MAP={blog:'guides.html'};
  let file=(!parts[0]||parts[0]==='home')?'index.html':(FILE_MAP[parts[0]]||parts[0]+'.html');
  if(parts[1])file+='?'+parts[1];
  location.href=file;
}
const PAGE=document.body.dataset.page||'home';
function initPage(){
  const NAV_MAP={shop:'shop.html',about:'about.html',blog:'guides.html',contact:'contact.html'};
  const cur=NAV_MAP[PAGE];
  if(cur)$$('.main-nav a').forEach(a=>a.classList.toggle('rt-on',(a.getAttribute('href')||'')===cur));
  if(PAGE==='shop'){applyShopQuery();renderShopAll();}
  if(PAGE==='blog'){renderBlog(new URLSearchParams(location.search).get('post'));}
  if(PAGE==='account')renderAccount();
  if(PAGE==='success')renderSuccess();
  if(PAGE==='checkout'){renderCheckout();syncPayUI();const s=getSession();if(s){const em=$('#coEmail');if(em&&!em.value)em.value=s.email;}}
}

"""
js = js[:i] + NEW_ROUTER + js[j:]
print("  OK   | router block replaced")

# 3j. navigate() call sites -> go()
rep("navigate('#/success');", "go('success');", "navigate success")
rep("navigate('#/checkout');", "go('checkout');", "navigate checkout")
rep("navigate('#/account')", "go('account')", "navigate account")
rep("navigate('#/blog');", "go('blog');", "navigate blog")
rep("navigate('#/blog/'+c.dataset.post);", "go('blog?post='+c.dataset.post);", "navigate blog post")
check("navigate(" not in js, "no navigate() left")

# 3k. shop query from real URL
rep("""function applyShopQuery(){
  const qm=location.hash.split('?')[1];
  if(qm&&/^cat=/.test(qm)){
    const cat=decodeURIComponent(qm.slice(4));
    if(PRODUCTS.some(p=>p.cat===cat))shopState.cats=[cat];
  }else{
    shopState.cats=['Apparel','Equipment','Accessories','Supplements'];
  }
  $$('#shopCats .scat').forEach(b=>b.classList.toggle('on',shopState.cats.includes(b.dataset.cat)));
}""",
"""function applyShopQuery(){
  const cat=new URLSearchParams(location.search).get('cat');
  if(cat&&PRODUCTS.some(p=>p.cat===cat))shopState.cats=[cat];
  else shopState.cats=['Apparel','Equipment','Accessories','Supplements'];
  $$('#shopCats .scat').forEach(b=>b.classList.toggle('on',shopState.cats.includes(b.dataset.cat)));
}""", "applyShopQuery -> location.search")

# 3l. post images — direct asset paths (hero/story DOM lives on index.html only)
rep("""function postImg(k){
  if(k==='chalk')return (document.querySelector('.hero-slide:nth-child(3) img')||{src:''}).src;
  if(k==='deadlift')return (document.querySelector('.hero-slide:nth-child(2) img')||{src:''}).src;
  if(k==='wheyimg')return BY_ID.whey.img;
  if(k==='story2')return (document.querySelectorAll('.story-media img')[1]||{src:''}).src;
  return (document.querySelector('.hero-slide img')||{src:''}).src;
}""",
"""function postImg(k){
  if(k==='chalk')return 'assets/hero-3.png';
  if(k==='deadlift')return 'assets/hero-2.png';
  if(k==='wheyimg')return BY_ID.whey.img;
  if(k==='story2')return 'assets/story-2.png';
  return 'assets/hero-1.png';
}""", "postImg direct paths")

# 3m. drop single-file IIFEs
rep("""/* prefill checkout email from session */
(function(){const s=getSession();if(s){const em=document.getElementById('coEmail');if(em&&!em.value)em.value=s.email;}})();""",
"/* checkout email prefill happens in initPage() on checkout.html */", "prefill IIFE removed")
rep("""/* about page images — reuse existing embedded assets */
(function(){
  const a1=document.getElementById('abImg'),a2=document.getElementById('abImg2');
  if(a1&&!a1.getAttribute('src'))a1.src=(document.querySelector('.hero-slide:nth-child(3) img')||{src:''}).src;
  if(a2&&!a2.getAttribute('src'))a2.src=(document.querySelectorAll('.story-media img')[0]||{src:''}).src;
})();""",
"/* about page images are hardcoded in about.html (multi-page build) */", "about IIFE removed")

# 3m-bis. success page — real navigation means a fresh JS context: fall back to saved orders
rep("""function renderSuccess(){
  const o=state.lastOrder;""",
"""function renderSuccess(){
  let o=state.lastOrder;
  if(!o){try{const arr=JSON.parse(localStorage.getItem('forged_orders')||'[]');o=arr.length?arr[0]:null;}catch(e){}}""",
"renderSuccess localStorage fallback")

# 3n. init block
rep("""renderCarousel();renderGear('All');updateCounts();renderCart();renderWish();renderCheckout();
(function(){const t=$('#tickerTrack');t.innerHTML=t.innerHTML+t.innerHTML;})();
applyRoute();""",
"""updateCounts();renderCart();renderWish();
if(PAGE==='home'){
  renderCarousel();renderGear('All');
  const tk=$('#tickerTrack');if(tk)tk.innerHTML=tk.innerHTML+tk.innerHTML;
}
initPage();""", "INIT block rewritten")

# 3o. hash links inside JS-generated HTML
rep('href="#/shop"', 'href="shop.html"', "JS empty-orders link")

# 3p. final asserts
for bad in ["location.hash", "applyRoute", "hashchange", "ROUTE_KEYS", "curRoute", 'href="#/']:
    check(bad not in js, f"no '{bad}' left in app.js")
check("function go(" in js and "const PAGE=" in js, "go()/PAGE present")

with open(os.path.join(OUTD, "app.js"), "w", encoding="utf-8") as f:
    f.write(js + "\n")
print(f"  app.js written: {len(js)//1024} KB")

# ============================================================ 4. HTML pages
print("== html pages ==")
def links(html, page):
    """rewrite hash links to real files; in-page anchors point home"""
    html = html.replace('href="#/shop?cat=', 'href="shop.html?cat=')
    html = html.replace('href="#/shop"',    'href="shop.html"')
    html = html.replace('href="#/about"',   'href="about.html"')
    html = html.replace('href="#/blog"',    'href="guides.html"')
    html = html.replace('href="#/contact"', 'href="contact.html"')
    html = html.replace('href="#/account"', 'href="account.html"')
    if page != "home":
        for a in ["new", "goals", "athletes", "stories", "gear", "hero"]:
            html = html.replace(f'href="#{a}"', f'href="index.html#{a}"')
    return html

PAGES = [
 ("index",    "home",     "FORGED. — Premium Fitness Gear | Apparel, Equipment & Supplements",
  "FORGED. Premium fitness gear engineered for people who show up. Shop apparel, equipment, accessories and supplements.",
  HOME_A + HOME_B),
 ("shop",     "shop",     "Shop All — FORGED. | The Full Arsenal",
  "Browse the complete FORGED. arsenal — apparel, equipment, accessories and supplements. Filter by category, price, rating and reviews.",
  P_SHOP),
 ("about",    "about",    "About the Forge — FORGED. | Built in the Dark",
  "Built in the dark, proven under load. The FORGED. story — from a garage gym to 2,400+ wear-testing athletes.",
  P_ABOUT),
 ("guides",   "blog",     "Training Guides — FORGED. | The Forge Journal",
  "Training, nutrition, recovery and mindset guides written by lifters, for lifters. No fluff — just what works.",
  P_BLOG),
 ("contact",  "contact",  "Contact Support — FORGED.",
  "Questions about orders, sizing or wholesale? We answer like training partners — within one working day.",
  P_CONT),
 ("account",  "account",  "My Account — FORGED.",
  "Log in or create your FORGED. account to track orders, wishlists and verification status.",
  P_ACCT),
 ("checkout", "checkout", "Checkout — FORGED.",
  "One-page checkout. Pay manually with bKash, Nagad, Rocket (TrxID + screenshot) or cash on delivery.",
  CO),
 ("success",  "success",  "Order Confirmed — FORGED.",
  "Your order is locked in. Payment verification and dispatch details inside.",
  P_SUCC),
]

SHELL_PRE  = '<div class="grain" id="grain"></div>\n\n'
SCRIPT_TAG = '<script src="app.js"></script>\n</body>\n</html>\n'

for fname, page, title, desc, content in PAGES:
    head = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Archivo:wght@500;600;700;800;900&family=Barlow+Condensed:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles.css">
</head>
<body data-page="{page}">
"""
    body = SHELL_PRE + links(HEADER, page) + links(PDP, page) + links(content, page) \
         + links(NEWS, page) + links(FOOT, page) + links(DRAWERS, page) + SCRIPT_TAG
    if fname == "about":
        body = body.replace('<img id="abImg" src="" alt="Chalked hands gripping a barbell in a dark gym">',
                            '<img id="abImg" src="assets/hero-3.png" alt="Chalked hands gripping a barbell in a dark gym">')
        body = body.replace('<img id="abImg2" src="" alt="Athlete mid-training wearing FORGED gear">',
                            '<img id="abImg2" src="assets/story-1.png" alt="Athlete mid-training wearing FORGED gear">')
    path = os.path.join(OUTD, fname + ".html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(head + body)
    print(f"  {fname+'.html':<15} data-page={page:<9} {os.path.getsize(path)//1024} KB")

# ============================================================ 5. global asserts
print("== global checks ==")
leftover = []
for fname, _, _, _, _ in PAGES:
    with open(os.path.join(OUTD, fname + ".html"), encoding="utf-8") as f:
        h = f.read()
    if 'href="#/' in h: leftover.append((fname, "hash route link"))
    if "data:image/" in h: leftover.append((fname, "base64 uri"))
    if "<style>" in h: leftover.append((fname, "inline style"))
    if "assets/" not in h and fname == "index": leftover.append((fname, "no asset refs"))
check(not leftover, f"leftover issues: {leftover}")

print()
if FAIL:
    print(f"BUILD FAILED — {len(FAIL)} problem(s):")
    for m in FAIL: print(" -", m)
    sys.exit(1)
print("BUILD OK")
