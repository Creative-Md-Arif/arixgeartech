#!/bin/bash
# FORGED — storefront-only BDT QA (fresh browser context)
set -u
cd /home/z/my-project/download/forged-full-project/backend
pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1
node scripts/dev-mongo.js > /tmp/mongo.log 2>&1 &
for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
npm run seed > /tmp/seed.log 2>&1 && echo "✔ seeded"
node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 20); do curl -sf -m 2 localhost:5000/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf localhost:5000/api/health >/dev/null && echo "✔ api up" || { echo "✘ api down"; exit 1; }

agent-browser close --all >/dev/null 2>&1
AB="agent-browser"
SS=/home/z/my-project/scripts
pass=0; fail=0
ok(){ echo "  ✔ $1"; pass=$((pass+1)); }
bad(){ echo "  ✘ $1"; fail=$((fail+1)); }

echo "=== STOREFRONT: checkout shows ৳ ==="
$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
$AB eval "localStorage.setItem('forged_v1', JSON.stringify({cart:{'whey|2KG|Chocolate':{id:'whey',size:'2KG',color:'Chocolate',qty:1}},wish:[]}));" >/dev/null 2>&1
$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
sleep 2
SUB=$($AB eval "document.querySelector('#coSubtotal')?.textContent" 2>/dev/null | tr -d '"')
echo "$SUB" | grep -q '৳6,490' && ok "checkout subtotal ৳6,490" || bad "subtotal: $SUB"
NOTE=$($AB eval "document.querySelector('#divChargeNote')?.textContent" 2>/dev/null | tr -d '"')
echo "$NOTE" | grep -q '৳60' && ok "division note ৳60" || bad "note: $NOTE"
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
echo "$PA" | grep -q '৳5,961' && ok "bKash Send-exactly ৳5,961" || bad "payAmt: $PA"

echo "=== STOREFRONT: end-to-end bKash order (TrxID + screenshot) ==="
$AB fill "#coFirst" "Rahim" >/dev/null 2>&1
$AB fill "#coLast" "Uddin" >/dev/null 2>&1
$AB fill "#coEmail" "rahim@test.bd" >/dev/null 2>&1
$AB fill "#coPhone" "01711-445566" >/dev/null 2>&1
$AB fill "#coAddr" "House 9, Road 3, Dhanmondi" >/dev/null 2>&1
$AB fill "#coCity" "Dhaka" >/dev/null 2>&1
$AB fill "#coTxnId" "bke2e99x" >/dev/null 2>&1
$AB upload "#coPayShot" "$SS/qa_shot.png" >/dev/null 2>&1 || $AB upload "input#coPayShot" "/home/z/my-project/download/forged-full-project/backend/src/seed/demo-proof.png" >/dev/null 2>&1
sleep 0.8
THUMB=$($AB eval "document.querySelector('#payPreview')?.hidden===false" 2>/dev/null | tr -d '"')
[ "$THUMB" = "true" ] && ok "screenshot preview shown" || bad "preview not shown"
$AB click "#placeOrder" >/dev/null 2>&1
sleep 3
URL=$($AB eval "location.pathname" 2>/dev/null | tr -d '"')
echo "  (landed: $URL)"
SUCC=$($AB eval "document.body.textContent.includes('৳5,961')||document.body.textContent.includes('৳5,961.00')" 2>/dev/null | tr -d '"')
[ "$SUCC" = "true" ] && ok "success page total ৳5,961" || bad "success total missing"
$AB screenshot $SS/bdt_success.png >/dev/null 2>&1

echo "=== STOREFRONT: home + shop ৳ ==="
$AB open "http://localhost:5000/" >/dev/null 2>&1
sleep 1.5
P1=$($AB eval "document.querySelector('.gear-grid .card-row .price, .gear-grid .price')?.textContent" 2>/dev/null | tr -d '"')
echo "$P1" | grep -q '৳' && ok "product card ৳ ($P1)" || bad "card price: $P1"
CH=$($AB eval "document.querySelector('[data-open=dumbbell] i')?.textContent" 2>/dev/null | tr -d '"')
echo "$CH" | grep -q '৳12,490' && ok "goal chip ৳12,490" || bad "goal chip: $CH"
ANN=$($AB eval "document.querySelector('.announce')?.textContent" 2>/dev/null | tr -d '"')
echo "$ANN" | grep -q '৳15,000' && ok "announce bar ৳15,000" || bad "announce: $ANN"
$AB open "http://localhost:5000/shop.html" >/dev/null 2>&1
sleep 1
LAB=$($AB eval "document.querySelector('#shopRangeLab')?.textContent" 2>/dev/null | tr -d '"')
echo "$LAB" | grep -q '৳15,000' && ok "shop range ৳15,000" || bad "range: $LAB"

$AB screenshot $SS/bdt_home.png >/dev/null 2>&1
echo ""
echo "RESULT: $pass passed, $fail failed"
pkill -f "node server.js" 2>/dev/null; pkill -f dev-mongo.js 2>/dev/null
[ $fail -eq 0 ]
