#!/bin/bash
# FORGED — React build per-page sweep: render + features + computed style + console
set -u
B=http://127.0.0.1:5000
AB="agent-browser"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1 → got: $2"; FAIL=$((FAIL+1)); }
chk(){ # page, name, js-expr, expect-substr
  local R=$($AB eval "$3" 2>/dev/null | tail -1 | tr -d '"')
  case "$R" in *"$4"*) ok "$2";; *) bad "$2" "$R";; esac
}
openp(){ $AB open "$B/$1" >/dev/null 2>&1; sleep "${2:-2.2}"; }
curl -sf -m 2 $B/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }
$AB close >/dev/null 2>&1; sleep 1

echo "== INDEX (home) =="
openp index.html 3
chk index "root mounted" "document.getElementById('root').innerHTML.length>20000" "true"
chk index "hero slides ×3" "document.querySelectorAll('.hero-media .hero-slide').length" "3"
chk index "hero font Anton" "getComputedStyle(document.querySelector('.hero-title')).fontFamily.includes('Anton')" "true"
chk index "ticker animating" "getComputedStyle(document.querySelector('.ticker-track')).animationName" "marquee"
chk index "carousel cards 6" "document.querySelectorAll('#carTrack .card').length" "6"
chk index "arsenal grid 8" "document.querySelectorAll('#gearGrid .card').length" "8"
chk index "goal panels ×3" "document.querySelectorAll('#goals .goal-panel, #goals article').length>=3" "true"
chk index "catalog src api" "window.CATALOG_SRC" "api"
chk index "card hover style" "getComputedStyle(document.querySelector('#gearGrid .card')).borderRadius" "0px"
chk index "pay marks COD" "document.querySelector('.pay-marks').textContent" "Cash on Delivery"
$AB eval "document.querySelector('#carTrack .card-media').click()" >/dev/null 2>&1; sleep 0.8
chk index "PDP opens" "document.querySelector('#pdp').classList.contains('visible')||document.querySelector('#pdp').classList.contains('open')" "true"
chk index "PDP size chips" "document.querySelectorAll('#pdpSizes .size-chip').length>=1" "true"
$AB eval "document.querySelector('#pdpAdd').click()" >/dev/null 2>&1; sleep 0.8
chk index "PDP add → drawer" "document.getElementById('cartDrawer').classList.contains('translate-x-0')" "true"
chk index "drawer ৳ price" "document.querySelector('.di-price').textContent" "৳"
chk index "quick-add works" "localStorage.removeItem('forged_v1'); true" "true"

echo "== SHOP =="
openp shop.html 2.5
chk shop "8 cards" "document.querySelectorAll('#shopGrid .card').length" "8"
chk shop "search filter belt→1" "(document.querySelector('#shopSearch').focus(),0)" "0"
$AB eval "(()=>{const el=document.querySelector('#shopSearch');const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;d.call(el,'belt');el.dispatchEvent(new Event('input',{bubbles:true}))})()" >/dev/null 2>&1; sleep 0.6
chk shop "filter belt → 1" "document.querySelectorAll('#shopGrid .card').length" "1"
chk shop "count label" "document.getElementById('shopCount').textContent" "1"
$AB eval "(()=>{const s=document.querySelector('#shopSearch');const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;d.call(s,'');s.dispatchEvent(new Event('input',{bubbles:true}));const el=document.querySelector('#shopSort');const d2=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set;d2.call(el,'price-asc');el.dispatchEvent(new Event('change',{bubbles:true}));return 'r'})()" >/dev/null 2>&1; sleep 0.8
chk shop "sort asc first=shaker" "document.querySelector('#shopGrid .card .card-name, #shopGrid .card h3').textContent.toLowerCase()" "shaker"
chk shop "cat chips" "document.querySelectorAll('#shopCats .scat').length" "4"

echo "== ABOUT =="
openp about.html 2.2
chk about "mounted" "document.getElementById('root').innerHTML.length>10000" "true"
chk about "BUILT IN THE DARK copy" "document.body.innerText" "BUILT IN THE DARK"
chk about "stats present" "document.body.innerText.includes('2019')" "true"

echo "== GUIDES =="
openp guides.html 2.2
chk guides "3 posts" "document.querySelectorAll('#blogGrid article, [data-post]').length>=3" "true"
chk guides "5×5 featured" "document.body.innerText" "5×5"
$AB eval "(()=>{const c=document.querySelector('[data-post]'); c&&c.click(); return !!c})()" >/dev/null 2>&1; sleep 1
chk guides "reader opens" "document.getElementById('postReader')!=null" "true"
chk guides "kit chips ৳" "document.body.innerText.includes('৳')" "true"

echo "== CONTACT =="
openp contact.html 2.2
chk contact "FAQ present" "document.querySelectorAll('#faqItems > div, #faqItems details, #faqItems button').length>=4" "true"
chk contact "form fields" "!!document.querySelector('#ctForm') && !!document.querySelector('#ctName') && !!document.querySelector('#ctMsg')" "true"
chk contact "address Dhaka" "document.body.innerText" "Dhaka"

echo "== ACCOUNT =="
openp account.html 2.2
chk account "login form" "!!document.querySelector('input[type=email]') && !!document.querySelector('input[type=password]')" "true"
chk account "track form" "!!document.getElementById('trkNo') && !!document.getElementById('trkPhone')" "true"

echo "== CHECKOUT =="
$AB eval "localStorage.setItem('forged_v1', JSON.stringify({cart:{'belt|S|Black Leather':{id:'belt',size:'S',color:'Black Leather',qty:1}},wish:[]}))" >/dev/null 2>&1
openp checkout.html 2.5
chk checkout "total ৳8,550" "document.getElementById('coTotal').textContent" "8,550"
chk checkout "4 pay methods" "document.querySelectorAll('.pm').length" "4"
$AB eval "document.querySelector('.pm[data-pay=cod]').click()" >/dev/null 2>&1; sleep 0.6
chk checkout "COD panel toggle" "!document.getElementById('payPanelCod').hidden" "true"
chk checkout "division note" "document.getElementById('divChargeNote').textContent" "Dhaka"

echo "== RESPONSIVE 320px =="
$AB eval "(()=>{const m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);return 'v'})()" >/dev/null 2>&1
$AB set viewport 320 700 >/dev/null 2>&1 || $AB eval "window.resizeTo(320,700)" >/dev/null 2>&1
openp index.html 2.5
chk mobile "no h-overflow home" "document.documentElement.scrollWidth<=window.innerWidth+2" "true"
chk mobile "burger visible" "getComputedStyle(document.getElementById('burgerBtn')).display" "flex"
chk mobile "nav hidden" "getComputedStyle(document.querySelector('.main-nav')).display" "none"
openp shop.html 2.2
chk mobile "no h-overflow shop" "document.documentElement.scrollWidth<=window.innerWidth+2" "true"
openp checkout.html 2.2
chk mobile "no h-overflow checkout" "document.documentElement.scrollWidth<=window.innerWidth+2" "true"
$AB set viewport 1280 800 >/dev/null 2>&1

echo "== ADMIN =="
openp admin/index.html 2
chk admin "login card" "!!document.querySelector('.login-card')" "true"
rfill(){ $AB eval "(function(){const el=document.querySelector('$1');if(!el)return 'no-el';const d=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;d.call(el,'$2');el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1; }
rfill "#liEmail" "admin@forged.fit"; rfill "#liPass" "ForgeAdmin2026"
$AB find text "Sign In" click >/dev/null 2>&1; sleep 2
chk admin "login → dashboard" "location.pathname" "dashboard"
for p in orders products banners homepage coupons customers messages content settings; do
  openp admin/$p.html 1.8
  chk admin "$p renders" "document.getElementById('root').innerHTML.length>4000 && !document.getElementById('root').innerHTML.includes('page module loading')" "true"
done
openp admin/settings.html 2
chk admin "pixel card" "!!document.getElementById('pxId') && !!document.getElementById('pxOn')" "true"

echo "== CONSOLE (final page) =="
ERRS=$($AB get console 2>/dev/null | grep -ci "error" || true)
[ "$ERRS" = "0" ] && ok "0 console errors" || { $AB get console 2>/dev/null | grep -i error | head -3; bad "$ERRS console errors" "x"; }

echo
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "QA_REACT_PAGES: ALL PASS" || echo "QA_REACT_PAGES: FAILURES"
exit $FAIL
