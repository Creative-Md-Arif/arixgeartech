#!/bin/bash
# FORGED — post-split per-page sweep: every page × (0 console errors + render + computed style)
set -u
B=http://127.0.0.1:5000
AB="agent-browser"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
curl -sf -m 2 $B/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }
$AB close >/dev/null 2>&1; sleep 1

chk(){ # page, name, js-expr, expect-substr
  local R=$($AB eval "$3" 2>/dev/null | tail -1 | tr -d '"')
  case "$R" in *"$4"*) ok "$2 → $R";; *) bad "$2 → got: $R";; esac
}
visit(){ $AB open "$B/$1" >/dev/null 2>&1; sleep 2.2; }

echo "== INDEX =="
visit index.html
chk index "hero slides" "document.querySelectorAll('#hero .hero-slide').length" "3"
chk index "ticker filled" "document.querySelectorAll('#tickerTrack span').length>=1 && getComputedStyle(document.querySelector('.ticker-track')).animationName" "tick"
chk index "carousel cards (admin CAR_LIMIT=6)" "document.querySelectorAll('#carTrack .card').length" "6"
chk index "arsenal grid" "document.querySelectorAll('#gearGrid .card').length" "8"
chk index "hero font" "getComputedStyle(document.querySelector('.hero-title')).fontFamily.includes('Anton')" "true"
chk index "catalog source" "CATALOG_SRC" "api"
chk index "PDP opens" "document.querySelector('#carTrack .card-media').click(); document.querySelector('#pdp').classList.contains('open')" "true"
chk index "PDP size chips" "document.querySelectorAll('#pdpSizes .size-chip').length" "5"
chk index "cart add+drawer" "document.querySelector('#pdpAdd').click(); document.querySelector('#cartDrawer').classList.contains('open')" "true"
chk index "drawer item price ৳" "document.querySelector('.di-price').textContent" "৳"
$AB eval "document.querySelector('#pdpBack').click()" >/dev/null 2>&1

echo "== SHOP =="
visit shop.html
chk shop "grid 8 cards" "document.querySelectorAll('#shopGrid .card').length" "8"
chk shop "count label" "document.querySelector('#shopCount').textContent" "8"
chk shop "card style applied" "getComputedStyle(document.querySelector('.card')).display" "flex"
$AB eval "const i=document.querySelector('#shopSearch'); i.value='whey'; i.dispatchEvent(new Event('input'))" >/dev/null 2>&1; sleep 0.5
chk shop "search filter → 1" "document.querySelectorAll('#shopGrid .card').length" "1"
$AB eval "document.querySelector('#shopClear').click()" >/dev/null 2>&1; sleep 0.4
chk shop "sort price-asc first=shaker ৳1,990" "document.querySelector('#shopSort').value='price-asc'; document.querySelector('#shopSort').dispatchEvent(new Event('change')); document.querySelector('#shopGrid .card').dataset.id" "shaker"

echo "== ABOUT =="
visit about.html
chk about "stat strip 4 cells" "document.querySelectorAll('.stat-cell').length" "4"
chk about "stat style applied" "getComputedStyle(document.querySelector('.stat-strip')).display" "grid"
chk about "timeline items" "document.querySelectorAll('.tl-item').length" "4"
chk about "search popup works" "const i=document.querySelector('#searchInput'); i.value='belt'; i.dispatchEvent(new Event('input')); document.querySelectorAll('.sp-item').length>=1" "true"

echo "== GUIDES =="
visit guides.html
chk guides "featured post" "!!document.querySelector('.blog-feat .post-title')" "true"
chk guides "grid 3 posts" "document.querySelectorAll('#blogGrid .post-card').length" "3"
chk guides "post card style" "getComputedStyle(document.querySelector('.post-card')).display" "flex"
chk guides "tag filter" "document.querySelector('#blogTags .scat[data-tag=Nutrition]').click(); (document.querySelector('#blogFeat .post-title')||{}).textContent||''" "Fuel the Grind"
$AB eval "document.querySelector('#blogTags .scat[data-tag=All]').click()" >/dev/null 2>&1; sleep 0.4
$AB eval "document.querySelector('.blog-feat[data-post]').click()" >/dev/null 2>&1; sleep 2.2
chk guides "article reader opens" "document.querySelector('#postReader').hidden===false" "true"
chk guides "article body renders" "document.querySelectorAll('#postReader .article h3').length>=2" "true"
chk guides "kit chips live prices" "document.querySelector('.kit-row .goal-chip i').textContent" "৳"
chk guides "breadcrumb back" "!!document.querySelector('#blogBack')" "true"
$AB eval "document.querySelector('#blogBack') && document.querySelector('#blogBack').click()" >/dev/null 2>&1; sleep 1.5

echo "== CONTACT =="
visit contact.html
chk contact "FAQ items from admin content" "document.querySelectorAll('#faqItems .faq-item').length" "5"
chk contact "faq style applied" "getComputedStyle(document.querySelector('.faq-item')).borderStyle" "solid"
chk contact "form fields styled" "getComputedStyle(document.querySelector('.field input')).borderColor" "rgb(43, 43, 48)"
chk contact "accordion opens" "document.querySelector('.faq-q').click(); document.querySelector('.faq-item').classList.contains('open')" "true"

echo "== ACCOUNT =="
visit account.html
chk account "acct style applied" "getComputedStyle(document.querySelector('.acct-card')).borderStyle" "solid"
chk account "login card visible" "document.querySelector('#lgCard').hidden" "false"
$AB fill "#lgEmail" "demo@forged.fit" >/dev/null; $AB fill "#lgPass" "forge2026" >/dev/null
$AB eval "document.querySelector('#lgForm button[type=submit]').click()" >/dev/null 2>&1; sleep 2.5
chk account "login → panel" "document.querySelector('#acctPanel').hidden" "false"
chk account "orders list renders" "document.querySelectorAll('#ordList .ord').length>=1 || document.querySelector('#ordList .shop-empty')!==null" "true"
$AB eval "localStorage.removeItem('forged_session')" >/dev/null 2>&1

echo "== CHECKOUT =="
visit checkout.html
chk checkout "summary style" "getComputedStyle(document.querySelector('.co-summary')).borderStyle" "solid"
chk checkout "empty-cart note" "document.querySelector('#coItems').textContent.length>3" "true"
chk checkout "pay methods 4" "document.querySelectorAll('#payMethods .pm').length" "4"
chk checkout "pay logo colors" "getComputedStyle(document.querySelector('.pm-logo.bkash')).backgroundColor" "rgb(226, 19, 110)"

echo "== SUCCESS =="
visit success.html
chk success "succ card style" "getComputedStyle(document.querySelector('.succ')).borderStyle" "solid"
chk success "graceful no-order state" "document.querySelector('#succNo').textContent" "FORGED-00000"

echo "== GLOBAL CHROME (on last page) =="
chk global "header fixed" "getComputedStyle(document.querySelector('#siteHeader')).position" "fixed"
chk global "toast container" "!!document.querySelector('#toasts')" "true"
chk global "footer pay-marks admin-driven" "document.querySelector('.pay-marks').textContent" "bKash"
chk global "newsletter form present" "!!document.querySelector('#nlForm')" "true"

echo "== CONSOLE ERRORS across all pages =="
ERRS=$($AB console 2>/dev/null | grep -ci error || true)
echo "  console error lines: $ERRS"
[ "$ERRS" = "0" ] && ok "0 console errors" || bad "$ERRS console errors"

echo; echo "RESULT: PASS=$PASS FAIL=$FAIL"
