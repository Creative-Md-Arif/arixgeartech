#!/bin/bash
# FORGED — final storefront e2e (BDT): cart → coupon → bKash order → success → admin verify
set -u
cd /home/z/my-project/download/forged-full-project/backend
pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1
node scripts/dev-mongo.js > /tmp/mongo.log 2>&1 &
for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
npm run seed > /tmp/seed.log 2>&1 && echo "✔ seeded"
node server.js > /tmp/api.log 2>&1 &
for i in $(seq 1 20); do curl -sf -m 2 localhost:5000/api/health >/dev/null 2>&1 && break; sleep 1; done
agent-browser close --all >/dev/null 2>&1
AB="agent-browser"
PROOF=/home/z/my-project/download/forged-full-project/backend/src/seed/demo-proof.png
SS=/home/z/my-project/scripts
pass=0; fail=0
ok(){ echo "  ✔ $1"; pass=$((pass+1)); }
bad(){ echo "  ✘ $1"; fail=$((fail+1)); }

$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
$AB eval "localStorage.setItem('forged_v1', JSON.stringify({cart:{'whey|2KG|Chocolate':{id:'whey',size:'2KG',color:'Chocolate',qty:1}},wish:[]}));" >/dev/null 2>&1
$AB open "http://localhost:5000/checkout.html" >/dev/null 2>&1
sleep 2.5

echo "=== checkout → ৳ ==="
$AB fill "#promoInput" "FORGE10" >/dev/null 2>&1
$AB click "#promoBtn" >/dev/null 2>&1
sleep 2
DISC=$($AB eval "document.querySelector('#coDiscount').textContent" 2>/dev/null | tr -d '"')
echo "$DISC" | grep -q '৳649' && ok "FORGE10 −৳649" || bad "discount: $DISC"
TOTL=$($AB eval "document.querySelector('#coTotal').textContent" 2>/dev/null | tr -d '"')
echo "$TOTL" | grep -q '৳5,901' && ok "total ৳5,901 (6490−649+60)" || bad "total: $TOTL"

echo "=== place bKash order ==="
$AB fill "#coFirst" "Rahim" >/dev/null 2>&1
$AB fill "#coLast" "Uddin" >/dev/null 2>&1
$AB fill "#coEmail" "rahim@test.bd" >/dev/null 2>&1
$AB fill "#coPhone" "01711-445566" >/dev/null 2>&1
$AB fill "#coAddr" "House 9, Road 3, Dhanmondi" >/dev/null 2>&1
$AB fill "#coCity" "Dhaka" >/dev/null 2>&1
$AB fill "#coTxnId" "bke2e99x" >/dev/null 2>&1
TXN=$($AB eval "document.querySelector('#coTxnId').value" 2>/dev/null | tr -d '"')
[ "$TXN" = "BKE2E99X" ] && ok "TrxID auto-uppercased BKE2E99X" || bad "trxid: $TXN"
$AB upload "#coPayShot" "$PROOF" >/dev/null 2>&1
sleep 1
HID=$($AB eval "document.querySelector('#payPreview').hidden" 2>/dev/null | tr -d '"')
[ "$HID" = "false" ] && ok "screenshot preview shown" || bad "preview hidden=$HID"
$AB click "#placeOrder" >/dev/null 2>&1
sleep 3.5
URL=$($AB eval "location.pathname" 2>/dev/null | tr -d '"')
[ "$URL" = "/success.html" ] && ok "landed on success.html" || bad "landed: $URL"
BODY=$($AB eval "document.body.textContent" 2>/dev/null)
echo "$BODY" | grep -q '৳5,901' && ok "success total ৳5,901" || bad "success total missing"
echo "$BODY" | grep -q 'BKE2E99X' && ok "TrxID on success page" || bad "TrxID missing"
echo "$BODY" | grep -qi 'Verifying' && ok "status Verifying" || bad "status missing"
ONUM=$(echo "$BODY" | grep -oE 'FRG-[A-Z0-9]{6,12}' | head -1)
echo "  order: $ONUM"
$AB screenshot $SS/bdt_success.png >/dev/null 2>&1

echo "=== admin verify flow on new order ==="
$AB open "http://localhost:5000/admin/" >/dev/null 2>&1
sleep 0.5
$AB fill "#liEmail" "admin@forged.fit" >/dev/null 2>&1
$AB fill "#liPass" "ForgeAdmin2026" >/dev/null 2>&1
$AB click "#loginForm button[type=submit]" >/dev/null 2>&1
sleep 2.5
$AB open "http://localhost:5000/admin/orders.html" >/dev/null 2>&1
sleep 2
$AB fill "#ofSearch" "$ONUM" >/dev/null 2>&1
sleep 1.5
$AB click "#ordersTableWrap tbody tr.row-click" >/dev/null 2>&1
sleep 1.5
HAS=$($AB eval "document.querySelector('#drawer')?.classList.contains('open')&&document.body.textContent.includes('$ONUM')" 2>/dev/null | tr -d '"')
[ "$HAS" = "true" ] && ok "drawer shows new order $ONUM" || bad "drawer missing"
EXP=$($AB eval "[...document.querySelectorAll('#drawer .kv span')].some(s=>s.textContent==='৳5,901')" 2>/dev/null | tr -d '"')
[ "$EXP" = "true" ] && ok "expected amount ৳5,901 in drawer" || bad "expected amount missing"
# verify payment (accept the confirm dialog)
$AB eval "window.confirm=()=>true" >/dev/null 2>&1
$AB click "#aVerify" >/dev/null 2>&1
sleep 2.5
STAT=$($AB eval "(document.querySelector('#drawer .dw-head .chip')||{}).textContent" 2>/dev/null | tr -d '"')
echo "$STAT" | grep -q 'processing' && ok "verify → status PROCESSING" || bad "status after verify: $STAT"
$AB screenshot $SS/bdt_admin_verified.png >/dev/null 2>&1

echo ""
echo "RESULT: $pass passed, $fail failed"
pkill -f "node server.js" 2>/dev/null; pkill -f dev-mongo.js 2>/dev/null
[ $fail -eq 0 ]
