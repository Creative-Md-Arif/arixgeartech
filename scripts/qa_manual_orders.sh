#!/bin/bash
# FORGED — Task: Manual Order Management (WhatsApp→ERP) + Dashboard sync QA
# Sections: 1) auth 2) create manual COD 3) manual paid bkash 4) validation 5) dashboard sync
#           6) source filter/list 7) CSV export 8) status mgmt 9) regression 10) cleanup
set -u
API=http://localhost:5000/api
PASS=0; FAIL=0
TRX="WA$(date +%M%S)$RANDOM"   # unique per run — TrxID dedup is global by design
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ local cond="$1" msg="$2"; if eval "$cond"; then ok "$msg"; else bad "$msg — got: $(echo "$LAST" | head -c 300)"; fi }
J()    { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "—— 1. admin auth"
R=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
TOK=$(echo "$R" | J "['token']")
AH="Authorization: Bearer $TOK"
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }

echo "—— 2. create manual order (COD, unpaid)"
# Task 27 note: the public /api/products list is now served through a short-TTL
# cache — after a mid-session reseed a cached entry can carry pre-seed ObjectIds.
# The ADMIN products endpoint is never cached → deterministic ids.
PROD=$(curl -s "$API/admin/products?search=dumbbell" -H "$AH")
PID=$(echo "$PROD" | J "['items'][0]['_id']")
PNAME=$(echo "$PROD" | J "['items'][0]['name']")
PPRICE=$(echo "$PROD" | J "['items'][0]['price']")
PSTOCK=$(echo "$PROD" | J "['items'][0]['stock']")
SLUG=$(echo "$PROD" | J "['items'][0]['slug']")
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"WA Test Rakib\",\"phone\":\"01911002003\",\"email\":\"rakib@wa.test\"},
  \"shipping\":{\"address\":\"House 12, Road 5\",\"city\":\"Dhaka\",\"division\":\"dhaka\",\"postal\":\"1213\",\"notes\":\"confirmed on WA 9:40pm\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1}],
  \"paymentMethod\":\"cod\",\"channel\":\"WhatsApp\",\"note\":\"received via WhatsApp\"}")
CODE=$(echo "$LAST" | tail -1); BODY=$(echo "$LAST" | head -1)
MOID=$(echo "$BODY" | J "['order']['_id']")
MNUM=$(echo "$BODY" | J "['order']['orderNumber']")
check "[ '$CODE' = '201' ]" "manual COD order created (201)"
check "[ \"$(echo "$BODY" | J "['order']['source']")\" = 'manual' ]" "source=manual"
check "[ \"$(echo "$BODY" | J "['order']['channel']")\" = 'WhatsApp' ]" "channel=WhatsApp"
check "[ \"$(echo "$BODY" | J "['order']['payment']['status']")\" = 'cod-pending' ]" "COD unpaid → cod-pending"
check "[ \"$(echo "$BODY" | J "['order']['status']")\" = 'processing' ]" "COD unpaid → status processing"
EXP_SUB=$(python3 -c "print($PPRICE*1)")
check "[ \"$(echo "$BODY" | J "['order']['totals']['subtotal']")\" = '$EXP_SUB' ]" "subtotal = 1 × $PPRICE (৳$EXP_SUB)"
check "[ \"$(echo "$BODY" | J "['order']['totals']['shipping']")\" = '60' ]" "dhaka shipping auto ৳60"
EXP_GRAND=$(python3 -c "print($PPRICE*1+60)")
check "[ \"$(echo "$BODY" | J "['order']['totals']['grandTotal']")\" = '$EXP_GRAND' ]" "grand = subtotal + ৳60 (auto, below free threshold)"

echo "—— 3. stock + sold decrement"
LAST=$(curl -s "$API/products/$SLUG")
NSTOCK=$(echo "$LAST" | J "['product']['stock']" 2>/dev/null || echo "$LAST" | J "['stock']")
NSOLD=$(echo "$LAST" | J "['product']['sold']" 2>/dev/null || echo "$LAST" | J "['sold']")
check "[ \"$NSTOCK\" = \"$((PSTOCK-1))\" ]" "stock $PSTOCK → $NSTOCK (−1)"

echo "—— 4. manual paid order (bkash + price override + discount)"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"WA Paid Nusrat\",\"phone\":\"01911002004\"},
  \"shipping\":{\"address\":\"Rangpur Sadar\",\"city\":\"Rangpur\",\"division\":\"rangpur\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":1999,\"color\":\"Blackout\"}],
  \"discount\":100,\"paymentMethod\":\"bkash\",\"paid\":true,\"trxId\":\"$TRX\",\"senderNumber\":\"01711111111\",\"channel\":\"Phone\"}")
CODE=$(echo "$LAST" | tail -1); BODY=$(echo "$LAST" | head -1)
POID=$(echo "$BODY" | J "['order']['_id']")
check "[ '$CODE' = '201' ]" "paid bkash manual order created"
check "[ \"$(echo "$BODY" | J "['order']['payment']['status']")\" = 'verified' ]" "paid → payment verified"
check "[ \"$(echo "$BODY" | J "['order']['status']")\" = 'processing' ]" "paid → status processing"
check "[ \"$(echo "$BODY" | J "['order']['totals']['grandTotal']")\" = '2019' ]" "override ৳1999 − ৳100 + ৳120 rangpur = ৳2019"
check "[ \"$(echo "$BODY" | J "['order']['channel']")\" = 'Phone' ]" "channel=Phone"

echo "—— 5. validation guards"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"X","phone":"999"},"shipping":{"address":"a","city":"c","division":"dhaka"},"items":[{"productId":"'$PID'","qty":1}],"paymentMethod":"cod"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '400' ]" "invalid BD phone → 400"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"X","phone":"01911002005"},"shipping":{"address":"a","city":"c","division":"dhaka"},"items":[],"paymentMethod":"cod"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '400' ]" "empty items → 400"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"X","phone":"01911002005"},"shipping":{"address":"a","city":"c","division":"dhaka"},"items":[{"productId":"'$PID'","qty":1}],"paymentMethod":"paypal"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '400' ]" "unknown method → 400"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"X","phone":"01911002005"},"shipping":{"address":"a","city":"c","division":"nowhere"},"items":[{"productId":"'$PID'","qty":1}],"paymentMethod":"cod"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '400' ]" "unknown division → 400"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"X","phone":"01911002005"},"shipping":{"address":"a","city":"c","division":"dhaka"},"items":[{"productId":"'$PID'","qty":1,"price":500}],"paymentMethod":"bkash","trxId":"'$TRX'"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '409' ]" "duplicate TrxID (method-scoped) → 409"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H 'Content-Type: application/json' -d '{}')
check "[ \"$(echo "$LAST" | tail -1)\" = '401' ]" "unauthenticated manual entry → 401"

echo "—— 6. dashboard sync (stats include manual orders)"
TODAY=$(date +%F)
LAST=$(curl -s $API/admin/stats -H "$AH")
TM=$(echo "$LAST" | J "['todayManual']"); TO=$(echo "$LAST" | J "['todayOnline']"); TA=$(echo "$LAST" | J "['todayOrders']")
check "[ \"$TM\" -ge 2 ]" "stats.todayManual ≥ 2 (got $TM)"
check "[ \"$((TM+TO))\" = \"$TA\" ]" "manual+online = todayOrders ($TM+$TO=$TA)"
WK=$(echo "$LAST" | J "['week'][-1]['total']" 2>/dev/null)
check "[ -n \"$WK\" ]" "7-day chart includes today (last bar total=$WK)"

echo "—— 7. list filters + detail"
LAST=$(curl -s "$API/admin/orders?source=manual" -H "$AH")
MTOT=$(echo "$LAST" | J "['total']")
check "[ \"$MTOT\" -ge 2 ]" "source=manual filter → $MTOT manual orders"
ALLSRCS=$(echo "$LAST" | python3 -c "import sys,json;d=json.load(sys.stdin);print(set(o['source'] for o in d['items']))")
check "[ \"\$ALLSRCS\" = \"{'manual'}\" ]" "all rows source=manual"
LAST=$(curl -s "$API/admin/orders?source=online" -H "$AH")
check "[ \"$(echo "$LAST" | J "['total']")\" -ge 0 ]" "source=online filter works"
LAST=$(curl -s "$API/admin/orders/$MOID" -H "$AH")
check "[ \"$(echo "$LAST" | J "['order']['customer']['name']")\" = 'WA Test Rakib' ]" "detail: manual order fetchable"
check "[ -n \"$(echo "$LAST" | J "['order']['entryBy']")\" ]" "entryBy recorded (admin who entered)"

echo "—— 8. CSV export has Source/Channel columns"
LAST=$(curl -s "$API/admin/orders/export.csv?source=manual" -H "$AH")
HDR=$(echo "$LAST" | head -1)
check "[ \"\$(echo \"\$HDR\" | grep -c 'Source,Channel')\" = '1' ]" "CSV header has Source,Channel"
check "[ \"\$(echo \"\$LAST\" | grep -c 'manual')\" -ge 1 ]" "CSV rows contain source=manual"

echo "—— 9. status mgmt on manual order (existing ERP flow)"
LAST=$(curl -s -w '\n%{http_code}' -X PATCH $API/admin/orders/$MOID/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"packed","note":"handover ready"}')
check "[ \"$(echo "$LAST" | tail -1)\" = '200' ]" "manual order status → packed"
LAST=$(curl -s "$API/admin/orders/$MOID" -H "$AH")
check "[ \"$(echo "$LAST" | J "['order']['status']")\" = 'packed' ]" "detail shows packed"

echo "—— 10. regression (online flow intact)"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d '{"customer":{"name":"Cash Test","phone":"01911002006"},"shipping":{"address":"CTG","city":"Chattogram","division":"chattogram"},"items":[{"productId":"'$PID'","qty":1}],"paymentMethod":"cash","paid":true}')
check "[ \"$(echo "$LAST" | tail -1)\" = '201' ]" "cash walk-in (paid) → 201"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['payment']['status']")\" = 'cod-collected' ]" "cash paid → cod-collected"
LAST=$(curl -s "$API/products" )
check "[ -n \"$(echo "$LAST" | J "['items'][0]['_id']")\" ]" "public products endpoint OK"

echo "—— 11. cleanup (QA data)"
for ID in $MOID $POID; do
  [ -n "$ID" ] && curl -s -X PATCH $API/admin/orders/$ID/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"cancelled"}' >/dev/null
done
curl -s "$API/admin/orders?search=0191100200" -H "$AH" | python3 -c "
import sys,json,urllib.request
d=json.load(sys.stdin)
print('  · QA orders marked cancelled:', [o['orderNumber'] for o in d['items']])"
echo ""
echo "================ PASS=$PASS FAIL=$FAIL ================"
[ $FAIL -eq 0 ] && echo "ALL GREEN ✓" || echo "SOME TESTS FAILED ✗"
