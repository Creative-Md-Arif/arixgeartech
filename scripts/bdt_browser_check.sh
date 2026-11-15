#!/bin/bash
# FORGED — boot stack + browser QA (admin multi-page + storefront ৳)
set -u
cd /home/z/my-project/download/forged-full-project/backend
pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1
node scripts/dev-mongo.js > /tmp/mongo.log 2>&1 &
for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
npm run seed > /tmp/seed.log 2>&1 && echo "✔ seeded"
node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 20); do curl -sf -m 2 localhost:5000/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf localhost:5000/api/health >/dev/null && echo "✔ api up" || { echo "✘ api down"; exit 1; }

AB="agent-browser"
SS=/home/z/my-project/scripts
pass=0; fail=0
ok(){ echo "  ✔ $1"; pass=$((pass+1)); }
bad(){ echo "  ✘ $1"; fail=$((fail+1)); }

echo "=== ADMIN: login page (separate file) ==="
$AB open "http://localhost:5000/admin/" >/dev/null 2>&1
$AB wait "#loginForm" >/dev/null 2>&1 && ok "login form visible at /admin/" || bad "login form missing"
$AB fill "#liEmail" "admin@forged.fit" >/dev/null 2>&1
$AB fill "#liPass" "ForgeAdmin2026" >/dev/null 2>&1
$AB click "#loginForm button[type=submit]" >/dev/null 2>&1
$AB wait "#statGrid, .stat-grid" >/dev/null 2>&1
sleep 1
URL=$($AB eval "location.pathname" 2>/dev/null | tr -d '"')
[ "$URL" = "/admin/dashboard.html" ] && ok "redirected to dashboard.html (URL: $URL)" || bad "expected /admin/dashboard.html got $URL"
REV=$($AB eval "document.querySelector('.stat-grid .stat:nth-child(2) .v')?.textContent" 2>/dev/null | tr -d '"')
echo "$REV" | grep -q '৳' && ok "dashboard revenue shows ৳ ($REV)" || bad "revenue not ৳: '$REV'"

echo "=== ADMIN: orders page (separate file) ==="
$AB open "http://localhost:5000/admin/orders.html" >/dev/null 2>&1
$AB wait "#ordersTableWrap table" >/dev/null 2>&1 && ok "orders table rendered" || bad "orders table missing"
TOT=$($AB eval "[...document.querySelectorAll('#ordersTableWrap tbody td.money')].slice(0,3).map(x=>x.textContent).join(' | ')" 2>/dev/null | tr -d '"')
echo "$TOT" | grep -q '৳' && ok "order totals ৳ ($TOT)" || bad "totals not ৳: $TOT"
$AB click "#ordersTableWrap tbody tr.row-click" >/dev/null 2>&1
$AB wait "#drawer.open .shot-thumb" >/dev/null 2>&1 && ok "order drawer opens with screenshot" || bad "drawer/screenshot missing"
GT=$($AB eval "document.querySelector('#drawer .tot-line.big .v')?.textContent" 2>/dev/null | tr -d '"')
echo "$GT" | grep -q '৳' && ok "drawer grand total ৳ ($GT)" || bad "drawer total not ৳: $GT"

echo "=== ADMIN: other separate pages ==="
for pg in products banners homepage coupons customers settings; do
  $AB open "http://localhost:5000/admin/$pg.html" >/dev/null 2>&1
  sleep 0.8
  N=$($AB eval "document.querySelector('#view')?.children.length||0" 2>/dev/null | tr -d '"')
  T=$($AB eval "document.querySelector('#pageTitle')?.textContent" 2>/dev/null | tr -d '"')
  [ "$N" -gt 0 ] && ok "$pg.html renders ($T)" || bad "$pg.html empty view"
done
SETVAL=$($AB eval "document.querySelector('#ship-dhaka')?.value" 2>/dev/null | tr -d '"')
[ "$SETVAL" = "60" ] && ok "settings dhaka charge = ৳60" || bad "settings dhaka: $SETVAL"

echo "=== ADMIN: auth guard ==="
$AB eval "localStorage.removeItem('forged_admin_token')" >/dev/null 2>&1
$AB open "http://localhost:5000/admin/settings.html" >/dev/null 2>&1
sleep 1
URL=$($AB eval "location.pathname" 2>/dev/null | tr -d '"')
[ "$URL" = "/admin/index.html" ] && ok "no-token → bounced to login" || bad "guard failed: $URL"

echo "=== STOREFRONT: checkout shows ৳ ==="
$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
$AB eval "localStorage.setItem('forged_v1', JSON.stringify({cart:{'whey|2KG|Chocolate':{id:'whey',size:'2KG',color:'Chocolate',qty:1}},wish:[]})); localStorage.setItem('forged_session', JSON.stringify({token:null}));" >/dev/null 2>&1
$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
sleep 2
SUB=$($AB eval "document.querySelector('#coSubtotal')?.textContent" 2>/dev/null | tr -d '"')
echo "$SUB" | grep -q '৳6,490' && ok "checkout subtotal ৳6,490" || bad "subtotal: $SUB"
NOTE=$($AB eval "document.querySelector('#divChargeNote')?.textContent" 2>/dev/null | tr -d '"')
echo "$NOTE" | grep -q '৳60' && ok "division note ৳60 ($NOTE)" || bad "note: $NOTE"
$AB select "#coDivision" "sylhet" >/dev/null 2>&1; sleep 0.5
SHIP=$($AB eval "document.querySelector('#coShipping')?.textContent" 2>/dev/null | tr -d '"')
echo "$SHIP" | grep -q '৳120' && ok "sylhet shipping ৳120" || bad "sylhet ship: $SHIP"
$AB select "#coDivision" "dhaka" >/dev/null 2>&1
$AB fill "#promoInput" "FORGE10" >/dev/null 2>&1
$AB click "#promoBtn" >/dev/null 2>&1; sleep 1.2
DISC=$($AB eval "document.querySelector('#coDiscount')?.textContent" 2>/dev/null | tr -d '"')
echo "$DISC" | grep -q '৳649' && ok "FORGE10 −৳649" || bad "discount: $DISC"
TOTL=$($AB eval "document.querySelector('#coTotal')?.textContent" 2>/dev/null | tr -d '"')
echo "$TOTL" | grep -q '৳5,961' && ok "checkout total ৳5,961" || bad "total: $TOTL"
PA=$($AB eval "document.querySelector('#payAmt')?.textContent" 2>/dev/null | tr -d '"')
echo "$PA" | grep -q '৳5,961' && ok "bKash 'Send exactly' ৳5,961" || bad "payAmt: $PA"

echo "=== STOREFRONT: home prices ৳ ==="
$AB open "http://localhost:5000/" >/dev/null 2>&1
sleep 1.5
P1=$($AB eval "document.querySelector('.gear-grid .card-row .price, .gear-grid .price')?.textContent" 2>/dev/null | tr -d '"')
echo "$P1" | grep -q '৳' && ok "product card price ৳ ($P1)" || bad "card price: $P1"

echo "=== SHOP: price slider ৳15,000 ==="
$AB open "http://localhost:5000/shop.html" >/dev/null 2>&1
sleep 1
LAB=$($AB eval "document.querySelector('#shopRangeLab')?.textContent" 2>/dev/null | tr -d '"')
echo "$LAB" | grep -q '৳15,000' && ok "shop range label ৳15,000" || bad "range label: $LAB"

$AB screenshot $SS/bdt_admin_dashboard.png >/dev/null 2>&1
echo ""
echo "RESULT: $pass passed, $fail failed"
pkill -f "node server.js" 2>/dev/null; pkill -f dev-mongo.js 2>/dev/null
[ $fail -eq 0 ]
