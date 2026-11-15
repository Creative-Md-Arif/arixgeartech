#!/bin/bash
# FORGED — Task 22 QA: manual order EDIT + DELETE + Sales Report (manual vs online)
# Sections: 1) auth 2) baseline 3) create+edit manual (stock delta) 4) online-order guard
#           5) payment-state transitions + TrxID dedup (self-exclusion) 6) delivered guard
#           7) report deltas 8) delete (stock restore + report drops) 9) guards 404/401
#           10) report meta + CSV 11) regression 12) cleanup
set -u
API=http://localhost:5000/api
PASS=0; FAIL=0
T1="ED$(date +%M%S)A$RANDOM"   # bkash trx for O2 (unique per run)
T2="ED$(date +%M%S)B$RANDOM"   # bkash trx for O3
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
check(){ local cond="$1" msg="$2"; if eval "$cond"; then ok "$msg"; else bad "$msg — got: $(echo "$LAST" | head -c 300)"; fi }
J()    { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "—— 1. admin auth"
R=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
TOK=$(echo "$R" | J "['token']")
AH="Authorization: Bearer $TOK"
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }

echo "—— 2. baseline (product + report)"
# pick a product with real stock (knee sleeves was drained to 0 by earlier runs)
PROD=$(curl -s "$API/products")
PID=$(echo "$PROD" | python3 -c "import sys,json;d=json.load(sys.stdin);p=next((x for x in d['items'] if x.get('stock',0)>=10),None);print(p['_id'] if p else '')")
SLUG=$(echo "$PROD" | python3 -c "import sys,json;d=json.load(sys.stdin);p=next((x for x in d['items'] if x.get('stock',0)>=10),None);print(p['slug'] if p else '')")
PPRICE=$(echo "$PROD" | python3 -c "import sys,json;d=json.load(sys.stdin);p=next((x for x in d['items'] if x.get('stock',0)>=10),None);print(p['price'] if p else 0)")
S0=$(echo "$PROD" | python3 -c "import sys,json;d=json.load(sys.stdin);p=next((x for x in d['items'] if x.get('stock',0)>=10),None);print(p['stock'] if p else 0)")
[ -n "$PID" ] && ok "test product: $SLUG (stock $S0, ৳$PPRICE)" || { bad "no product with stock ≥ 10"; exit 1; }
SET=$(curl -s $API/settings)
SHIPD=$(echo "$SET" | J "['setting']['shipping']['divisions']['dhaka']")
SHIPD=${SHIPD:-60}
FREEAT=$(echo "$SET" | J "['setting']['shipping']['freeThreshold']")
FREEAT=${FREEAT:-15000}
OG=$(python3 -c "print($PPRICE + (0 if $PPRICE >= $FREEAT else $SHIPD))")   # expected online grand (dhaka)
LAST=$(curl -s "$API/admin/reports/sales" -H "$AH")
M0=$(echo "$LAST" | J "['totals']['manual']['revenue']")
O0=$(echo "$LAST" | J "['totals']['online']['revenue']")
check "[ -n \"$M0\" ] && [ -n \"$O0\" ]" "baseline report: manual=৳$M0 online=৳$O0"

echo "—— 3. manual order create + edit (wrong-entry correction)"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Edit Test Jony\",\"phone\":\"01922003301\"},
  \"shipping\":{\"address\":\"House 9, Road 2\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":2,\"price\":1000}],
  \"paymentMethod\":\"cod\",\"channel\":\"WhatsApp\"}")
CODE=$(echo "$LAST" | tail -1); BODY=$(echo "$LAST" | head -1)
O1=$(echo "$BODY" | J "['order']['_id']")
N1=$(echo "$BODY" | J "['order']['orderNumber']")
check "[ '$CODE' = '201' ]" "manual COD created ($N1)"
check "[ \"$(echo "$BODY" | J "['order']['totals']['grandTotal']")\" = '2060' ]" "grand 2×1000+60 = ৳2060"
LAST=$(curl -s "$API/products/$SLUG"); check "[ \"$(echo "$LAST" | J "['stock']" 2>/dev/null || echo "$LAST" | J "['product']['stock']")\" = \"$((S0-2))\" ]" "stock $S0 → $((S0-2)) (−2)"
# EDIT: qty 2→1, phone fixed, note — totals + stock recalc
LAST=$(curl -s -w '\n%{http_code}' -X PUT $API/admin/orders/$O1 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Edit Test Jony\",\"phone\":\"01922003399\"},
  \"shipping\":{\"address\":\"House 9, Road 2\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":1000}],
  \"paymentMethod\":\"cod\",\"paid\":false,\"note\":\"customer called — only 1 pcs\"}")
CODE=$(echo "$LAST" | tail -1); BODY=$(echo "$LAST" | head -1)
check "[ '$CODE' = '200' ]" "PUT edit accepted (200)"
check "[ \"$(echo "$BODY" | J "['order']['totals']['grandTotal']")\" = '1060' ]" "totals recalculated 1×1000+60 = ৳1060"
check "[ \"$(echo "$BODY" | J "['order']['customer']['phone']")\" = '01922003399' ]" "customer phone corrected"
check "[ \"$(echo "$BODY" | J "['order']['payment']['status']")\" = 'cod-pending' ]" "payment status preserved (cod-pending)"
LAST=$(curl -s "$API/admin/orders/$O1" -H "$AH")
HNOTE=$(echo "$LAST" | J "['order']['statusHistory'][-1]['note']")
check "[ \"\$(echo \"\$HNOTE\" | grep -c 'Order edited (correction)')\" = '1' ]" "history: 'Order edited (correction)' appended"
check "[ \"$(echo "$HNOTE" | grep -c 'customer called — only 1 pcs')\" = '1' ]" "edit note stored in history"
LAST=$(curl -s "$API/products/$SLUG"); ST=$(echo "$LAST" | J "['stock']" 2>/dev/null || echo "$LAST" | J "['product']['stock']")
check "[ \"$ST\" = \"$((S0-1))\" ]" "stock delta reconciled $((S0-2)) → $ST (+1 restored)"

echo "—— 4. online order guard (edit blocked, delete allowed)"
PL='payload={"customer":{"name":"Online Naeem","phone":"01811005501"},"shipping":{"address":"Bondor","city":"Dhaka","division":"dhaka"},"items":[{"slug":"'$SLUG'","qty":1}],"paymentMethod":"cod"}'
LAST=$(curl -s -X POST $API/orders -F "$PL")
N4=$(echo "$LAST" | J "['order']['orderNumber']")
check "[ -n \"$N4\" ]" "online COD order placed via storefront ($N4)"
LAST=$(curl -s "$API/admin/orders?search=$N4" -H "$AH")
O4=$(echo "$LAST" | J "['items'][0]['_id']")
G4=$(echo "$LAST" | J "['items'][0]['totals']['grandTotal']")
check "[ \"$G4\" = \"$OG\" ]" "online grand = ৳$G4 (server-priced)"
LAST=$(curl -s -w '\n%{http_code}' -X PUT $API/admin/orders/$O4 -H "$AH" -H 'Content-Type: application/json' -d "{\"customer\":{\"name\":\"X\",\"phone\":\"01811005501\"},\"shipping\":{\"address\":\"a\",\"city\":\"c\",\"division\":\"dhaka\"},\"items\":[{\"productId\":\"$PID\",\"qty\":1}],\"paymentMethod\":\"cod\"}")
check "[ \"$(echo "$LAST" | tail -1)\" = '400' ]" "editing an ONLINE order → 400"

echo "—— 5. payment states + TrxID dedup (edit)"
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Paid Nusrat\",\"phone\":\"01922003302\"},
  \"shipping\":{\"address\":\"Rangpur Sadar\",\"city\":\"Rangpur\",\"division\":\"rangpur\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":500}],\"discount\":100,
  \"paymentMethod\":\"bkash\",\"paid\":true,\"trxId\":\"$T1\"}")
O2=$(echo "$LAST" | head -1 | J "['order']['_id']")
check "[ \"$(echo "$LAST" | tail -1)\" = '201' ]" "paid bkash manual created (grand ৳520)"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['payment']['status']")\" = 'verified' ]" "paid → verified"
# address-only edit — verified payment must NOT downgrade
LAST=$(curl -s -w '\n%{http_code}' -X PUT $API/admin/orders/$O2 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Paid Nusrat\",\"phone\":\"01922003302\"},
  \"shipping\":{\"address\":\"New Market Road\",\"city\":\"Rangpur\",\"division\":\"rangpur\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":500}],\"discount\":100,
  \"paymentMethod\":\"bkash\",\"paid\":true,\"trxId\":\"$T1\"}")
check "[ \"$(echo "$LAST" | tail -1)\" = '200' ]" "address-only edit accepted"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['payment']['status']")\" = 'verified' ]" "verified payment preserved on unrelated edit"
# own TrxID — self must be excluded from dedup
LAST=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$O2 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Paid Nusrat\",\"phone\":\"01922003302\"},
  \"shipping\":{\"address\":\"New Market Road\",\"city\":\"Rangpur\",\"division\":\"rangpur\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":500}],\"discount\":100,
  \"paymentMethod\":\"bkash\",\"paid\":true,\"trxId\":\"$T1\"}")
check "[ \"$LAST\" = '200' ]" "own TrxID re-saved (self-exclusion) → 200"
# unpaid mobile → later marked paid → back to unpaid
LAST=$(curl -s -w '\n%{http_code}' -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Unpaid Karim\",\"phone\":\"01922003303\"},
  \"shipping\":{\"address\":\"Mirpur\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":700}],
  \"paymentMethod\":\"bkash\",\"paid\":false,\"trxId\":\"$T2\"}")
O3=$(echo "$LAST" | head -1 | J "['order']['_id']")
check "[ \"$(echo "$LAST" | head -1 | J "['order']['status']")\" = 'verifying' ]" "unpaid bkash → status verifying"
LAST=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$O3 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Unpaid Karim\",\"phone\":\"01922003303\"},
  \"shipping\":{\"address\":\"Mirpur\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":700}],
  \"paymentMethod\":\"bkash\",\"paid\":false,\"trxId\":\"$T1\"}")
check "[ \"$LAST\" = '409' ]" "TrxID of ANOTHER order → 409"
LAST=$(curl -s -w '\n%{http_code}' -X PUT $API/admin/orders/$O3 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Unpaid Karim\",\"phone\":\"01922003303\"},
  \"shipping\":{\"address\":\"Mirpur\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":700}],
  \"paymentMethod\":\"bkash\",\"paid\":true,\"trxId\":\"$T2\"}")
check "[ \"$(echo "$LAST" | tail -1)\" = '200' ]" "unpaid → paid edit accepted"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['payment']['status']")\" = 'verified' ]" "marked paid → payment verified"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['status']")\" = 'processing' ]" "status verifying → processing"
LAST=$(curl -s -w '\n%{http_code}' -X PUT $API/admin/orders/$O3 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Unpaid Karim\",\"phone\":\"01922003303\"},
  \"shipping\":{\"address\":\"Mirpur\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":700}],
  \"paymentMethod\":\"bkash\",\"paid\":false,\"trxId\":\"$T2\"}")
check "[ \"$(echo "$LAST" | head -1 | J "['order']['payment']['status']")\" = 'pending' ]" "paid → unpaid: payment back to pending"
check "[ \"$(echo "$LAST" | head -1 | J "['order']['status']")\" = 'verifying' ]" "status back to verifying"
# insufficient stock on edit (delta +998 > available)
LAST=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$O3 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Unpaid Karim\",\"phone\":\"01922003303\"},
  \"shipping\":{\"address\":\"Mirpur\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":999,\"price\":700}],
  \"paymentMethod\":\"bkash\",\"paid\":false,\"trxId\":\"$T2\"}")
check "[ \"$LAST\" = '409' ]" "edit qty beyond stock → 409"

echo "—— 6. delivered orders are final"
LAST=$(curl -s -X POST $API/admin/orders/manual -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Delivered Sumon\",\"phone\":\"01922003304\"},
  \"shipping\":{\"address\":\"Zindabazar\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":300}],
  \"paymentMethod\":\"cod\",\"channel\":\"Walk-in\"}")
O5=$(echo "$LAST" | J "['order']['_id']")
curl -s -X PATCH $API/admin/orders/$O5/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"delivered"}' > /dev/null
LAST=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$O5 -H "$AH" -H 'Content-Type: application/json' -d "{
  \"customer\":{\"name\":\"Delivered Sumon\",\"phone\":\"01922003304\"},
  \"shipping\":{\"address\":\"Zindabazar\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},
  \"items\":[{\"productId\":\"$PID\",\"qty\":1,\"price\":300}],\"paymentMethod\":\"cod\"}")
check "[ \"$LAST\" = '400' ]" "edit delivered order → 400"
LAST=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $API/admin/orders/$O5 -H "$AH")
check "[ \"$LAST\" = '400' ]" "delete delivered order → 400"
curl -s -X PATCH $API/admin/orders/$O5/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"processing"}' > /dev/null

echo "—— 7. report deltas (manual vs online buckets)"
LAST=$(curl -s "$API/admin/reports/sales" -H "$AH")
MD=$(python3 -c "print($M0)")
check "[ \"$(echo "$LAST" | J "['totals']['manual']['revenue']")\" = \"$(python3 -c "print($MD+1060+520+760+360)")\" ]" "manual revenue delta = ৳2700 (1060+520+760+360)"
check "[ \"$(echo "$LAST" | J "['totals']['online']['revenue']")\" = \"$(python3 -c "print($O0+$OG)")\" ]" "online revenue delta = ৳$OG (storefront order)"
check "[ \"$(echo "$LAST" | J "['totals']['manualShare']")\" != '0' ]" "manual share % computed"
check "[ -n \"$(echo "$LAST" | J "['methods']")\" ]" "payment-method breakdown present"

echo "—— 8. delete orders (stock restore + report drop)"
LAST=$(curl -s -w '\n%{http_code}' -X DELETE $API/admin/orders/$O1 -H "$AH")
check "[ \"$(echo "$LAST" | tail -1)\" = '200' ]" "delete manual order $N1 (200)"
check "[ \"\$(echo \"\$(echo \"$LAST\" | head -1)\" | grep -c 'stock restored')\" = '1' ]" "response: stock restored"
LAST=$(curl -s -w '\n%{http_code}' -X DELETE $API/admin/orders/$O4 -H "$AH")
check "[ \"$(echo "$LAST" | tail -1)\" = '200' ]" "delete ONLINE order $N4 (200)"
LAST=$(curl -s "$API/admin/reports/sales" -H "$AH")
check "[ \"$(echo "$LAST" | J "['totals']['manual']['revenue']")\" = \"$(python3 -c "print($MD+520+760+360)")\" ]" "report: manual dropped by ৳1060"
check "[ \"$(echo "$LAST" | J "['totals']['online']['revenue']")\" = \"$O0\" ]" "report: online back to baseline (deleted order excluded)"
for ID in $O2 $O3 $O5; do curl -s -X DELETE $API/admin/orders/$ID -H "$AH" > /dev/null; done
LAST=$(curl -s "$API/admin/reports/sales" -H "$AH")
check "[ \"$(echo "$LAST" | J "['totals']['manual']['revenue']")\" = \"$M0\" ]" "report: manual back to baseline after cleanup"
LAST=$(curl -s "$API/products/$SLUG"); ST=$(echo "$LAST" | J "['stock']" 2>/dev/null || echo "$LAST" | J "['product']['stock']")
check "[ \"$ST\" = \"$S0\" ]" "stock fully restored → $S0"

echo "—— 9. guards (404 / 401)"
BOGUS=507f1f77bcf86cd799439011
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $API/admin/orders/$BOGUS -H "$AH")\" = '404' ]" "delete missing order → 404"
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$BOGUS -H "$AH" -H 'Content-Type: application/json' -d '{}')\" = '404' ]" "edit missing order → 404"
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' -X PUT $API/admin/orders/$O2 -H 'Content-Type: application/json' -d '{}')\" = '401' ]" "unauth edit → 401"
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $API/admin/orders/$O2)\" = '401' ]" "unauth delete → 401"
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/reports/sales")\" = '401' ]" "unauth report → 401"

echo "—— 10. report meta + CSV export"
LAST=$(curl -s "$API/admin/reports/sales" -H "$AH")
check "[ \"$(echo "$LAST" | J "['meta']['buckets']")\" = '30' ]" "default range = 30 daily buckets"
check "[ \"$(echo "$LAST" | J "['meta']['tz']")\" = 'Asia/Dhaka' ]" "timezone Asia/Dhaka"
LAST=$(curl -s "$API/admin/reports/sales?granularity=month&from=2026-01-01&to=2026-12-31" -H "$AH")
check "[ \"$(echo "$LAST" | J "['meta']['buckets']")\" = '12' ]" "monthly buckets = 12"
check "[ \"$(echo "$LAST" | J "['series'][0]['period']")\" = '2026-01' ]" "month period format YYYY-MM"
LAST=$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/reports/sales?from=2026-05-01&to=2026-01-01" -H "$AH")
check "[ \"$LAST\" = '400' ]" "from > to → 400"
LAST=$(curl -s -o /dev/null -w '%{http_code}' "$API/admin/reports/sales?granularity=day&from=2020-01-01&to=2026-12-31" -H "$AH")
check "[ \"$LAST\" = '400' ]" "daily range > 200 days → 400"
LAST=$(curl -s "$API/admin/reports/sales.csv?from=2026-10-01&to=2026-10-31" -H "$AH")
check "[ \"\$(echo \"\$LAST\" | head -1 | grep -c 'Manual Revenue (BDT)')\" = '1' ]" "CSV header: Manual Revenue column"
check "[ \"\$(echo \"\$LAST\" | grep -c '^TOTAL')\" = '1' ]" "CSV TOTAL row"
check "[ \"\$(echo \"\$LAST\" | grep -c 'Payment Method')\" = '1' ]" "CSV payment-method section"

echo "—— 11. regression (dashboard + health)"
LAST=$(curl -s $API/admin/stats -H "$AH")
TA=$(echo "$LAST" | J "['todayOrders']"); TM=$(echo "$LAST" | J "['todayManual']"); TO=$(echo "$LAST" | J "['todayOnline']")
check "[ \"$((TM+TO))\" = \"$TA\" ]" "stats: manual+online = todayOrders ($TM+$TO=$TA)"
check "[ \"$(curl -s -o /dev/null -w '%{http_code}' $API/health)\" = '200' ]" "health OK"
check "[ -n \"$(curl -s "$API/products" | J "['items'][0]['_id']")\" ]" "public products OK"

echo "—— 12. cleanup leftovers"
LAST=$(curl -s "$API/admin/orders?search=0192200330" -H "$AH")
echo "$LAST" | python3 -c "
import sys,json
d=json.load(sys.stdin)
left=[o['orderNumber'] for o in d['items']]
print('  · remaining test orders (should be []):', left)
sys.exit(0 if not left else 1)"
if [ $? = 0 ]; then ok "cleanup complete"; else bad "cleanup incomplete"; fi

echo ""
echo "================ PASS=$PASS FAIL=$FAIL ================"
[ $FAIL -eq 0 ] && echo "ALL GREEN ✓" || echo "SOME TESTS FAILED ✗"
