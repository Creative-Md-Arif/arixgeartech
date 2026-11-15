#!/usr/bin/env bash
# FORGED — Task 28 QA: orderController Layer 1+2+3
# L1 · /orders/preview · idempotency · BD phone validation
# L2 · race-safe atomic stock + transactions fallback · cancel/reject stock restore · customer self-cancel · guest→account linking · PDF invoice
# L3 · courier push (steadfast/pathao + dry-run) · returns/RMA + refund ledger · order funnel analytics
# Usage: bash /home/z/my-project/scripts/qa_task28_orders.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
SHOT=/home/z/my-project/backend/src/seed/demo-proof.png

echo "══ QA Task 28 — Order API Layer 1+2+3 ══"

# ── 0. fresh seed for deterministic stock numbers ──────────────────────────
cd /home/z/my-project/backend && node src/seed/seed.js > /dev/null 2>&1
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health (fresh seed)" "" || { bad "health" "$H"; exit 1; }

# ── 1. admin auth ───────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
AH="Authorization: Bearer $AT"
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || { bad "admin login" "$AD"; exit 1; }

WID=$(curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | JQ "['items'][0]['_id']")
stockof() { curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | JQ "['items'][0]['stock']"; }
oidof() { curl -s "$BASE/api/admin/orders?search=$1" -H "$AH" | JQ "['items'][0]['_id']"; }
[[ "$WID" != "None" ]] && ok "whey product id" "$WID" || { bad "whey id" "$WID"; exit 1; }

# ── 2. unauth guards ────────────────────────────────────────────────────────
for EP in "GET /api/admin/returns" "GET /api/admin/analytics/orders" "POST /api/admin/orders/000000000000000000000000/courier/push" "PATCH /api/admin/returns/000000000000000000000000"; do
  M=${EP%% *}; U=${EP#* }
  C=$(curl -s -o /tmp/q28u -w '%{http_code}' -X $M "$BASE$U" -H 'Content-Type: application/json' -d '{}')
  [[ "$C" == 401 ]] && ok "unauth 401 — $M $(basename $U)" "" || bad "unauth $U" "$C"
done

# ── 3. Layer 1 — POST /api/orders/preview ───────────────────────────────────
PV=$(curl -s -X POST $BASE/api/orders/preview -H 'Content-Type: application/json' \
  -d '{"items":[{"slug":"whey","qty":2}],"division":"dhaka"}')
[[ "$(echo "$PV" | JQ "['subtotal']")" == "12980" && "$(echo "$PV" | JQ "['shipping']")" == "60" \
  && "$(echo "$PV" | JQ "['grandTotal']")" == "13040" && "$(echo "$PV" | JQ "['freeShippingRemaining']")" == "2020" ]] \
  && ok "preview totals (2×whey + dhaka ship)" "subtotal=$(echo "$PV" | JQ "['subtotal']") ship=$(echo "$PV" | JQ "['shipping']") grand=$(echo "$PV" | JQ "['grandTotal']")" \
  || bad "preview totals" "$PV"
PVC=$(curl -s -X POST $BASE/api/orders/preview -H 'Content-Type: application/json' \
  -d '{"items":[{"slug":"whey","qty":2}],"division":"dhaka","couponCode":"FORGE10"}')
[[ "$(echo "$PVC" | JQ "['discount']")" == "1298" && "$(echo "$PVC" | JQ "['couponCode']")" == "FORGE10" && "$(echo "$PVC" | JQ "['grandTotal']")" == "11742" ]] \
  && ok "preview coupon FORGE10 (server math)" "discount=$(echo "$PVC" | JQ "['discount']") grand=$(echo "$PVC" | JQ "['grandTotal']")" || bad "preview coupon" "$PVC"
for TP in '{"items":[{"slug":"whey","qty":2}],"division":"nowhere"}' '{"items":[],"division":"dhaka"}' '{"items":[{"slug":"ghost-slug","qty":1}],"division":"dhaka"}' '{"items":[{"slug":"whey","qty":0}],"division":"dhaka"}'; do
  C=$(curl -s -o /tmp/q28p -w '%{http_code}' -X POST $BASE/api/orders/preview -H 'Content-Type: application/json' -d "$TP")
  [[ "$C" == 400 ]] && ok "preview 400 — $TP" "$(cat /tmp/q28p | head -c 90)" || bad "preview should 400" "$C $TP"
done

# ── 4. BD phone validation ──────────────────────────────────────────────────
BADPH=$(curl -s -o /tmp/q28ph -w '%{http_code}' -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d '{"payload":"{\"customer\":{\"name\":\"QA Bad\",\"phone\":\"12345\"},\"shipping\":{\"address\":\"a\",\"city\":\"c\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"whey\",\"qty\":1}],\"paymentMethod\":\"cod\"}"}')
[[ "$BADPH" == 400 && "$(cat /tmp/q28ph)" == *'BD mobile'* ]] && ok "invalid BD phone → 400" "$(cat /tmp/q28ph)" || bad "phone validation" "$BADPH $(cat /tmp/q28ph)"

# ── 5. idempotency (same key → original order, single stock bite) ───────────
KEY1="qa28-idem-$(date +%s)"
O1=$(curl -s -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d "{\"payload\":\"{\\\"customer\\\":{\\\"name\\\":\\\"QA One\\\",\\\"phone\\\":\\\"8801712345678\\\",\\\"email\\\":\\\"qa28a@test.forged\\\"},\\\"shipping\\\":{\\\"address\\\":\\\"1 Cancel Rd\\\",\\\"city\\\":\\\"Dhaka\\\",\\\"division\\\":\\\"dhaka\\\"},\\\"items\\\":[{\\\"slug\\\":\\\"whey\\\",\\\"qty\\\":1}],\\\"paymentMethod\\\":\\\"cod\\\",\\\"idempotencyKey\\\":\\\"$KEY1\\\"}\"}")
ON1=$(echo "$O1" | JQ "['order']['orderNumber']")
[[ "$(echo "$O1" | JQ "['order']['customer']['phone']")" == "01712345678" ]] \
  && ok "order created — 880-prefixed phone normalized" "$ON1 phone=$(echo "$O1" | JQ "['order']['customer']['phone']")" || bad "phone normalize" "$O1"
[[ "$(stockof)" == "14" ]] && ok "stock 15→14 after placement" "" || bad "stock after place" "$(stockof)"
DUP=$(curl -s -o /tmp/q28d -w '%{http_code}' -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d "{\"payload\":\"{\\\"customer\\\":{\\\"name\\\":\\\"QA One\\\",\\\"phone\\\":\\\"8801712345678\\\"},\\\"shipping\\\":{\\\"address\\\":\\\"1 Cancel Rd\\\",\\\"city\\\":\\\"Dhaka\\\",\\\"division\\\":\\\"dhaka\\\"},\\\"items\\\":[{\\\"slug\\\":\\\"whey\\\",\\\"qty\\\":1}],\\\"paymentMethod\\\":\\\"cod\\\",\\\"idempotencyKey\\\":\\\"$KEY1\\\"}\"}")
[[ "$DUP" == 200 && "$(cat /tmp/q28d | JQ "['duplicate']")" == "True" && "$(cat /tmp/q28d | JQ "['order']['orderNumber']")" == "$ON1" ]] \
  && ok "replay same idemKey → 200 duplicate, SAME order" "$ON1" || bad "idempotency replay" "$DUP $(cat /tmp/q28d | head -c 120)"
[[ "$(stockof)" == "14" ]] && ok "stock untouched by the replay (still 14)" "" || bad "replay stock" "$(stockof)"

# ── 6. customer self-cancel (Layer 2) ───────────────────────────────────────
TRK=$(curl -s "$BASE/api/orders/track/$ON1?phone=345678")
[[ "$(echo "$TRK" | JQ "['order']['canCancel']")" == "True" ]] && ok "track exposes canCancel=true" "$ON1" || bad "canCancel flag" "$TRK"
CX=$(curl -s -o /tmp/q28c -w '%{http_code}' -X PATCH "$BASE/api/orders/$ON1/cancel" -H 'Content-Type: application/json' -d '{"phone":"345678"}')
[[ "$CX" == 200 && "$(cat /tmp/q28c | JQ "['order']['status']")" == "cancelled" ]] \
  && ok "customer cancel (last-6 phone proof) → cancelled" "$ON1" || bad "self-cancel" "$CX $(cat /tmp/q28c)"
[[ "$(stockof)" == "15" ]] && ok "cancel restored stock 14→15" "" || bad "cancel stock restore" "$(stockof)"
CX2=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/orders/$ON1/cancel" -H 'Content-Type: application/json' -d '{"phone":"345678"}')
[[ "$CX2" == 409 ]] && ok "double cancel → 409" "" || bad "double cancel" "$CX2"
CX3=$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$BASE/api/orders/$ON1/cancel" -H 'Content-Type: application/json' -d '{"phone":"999999"}')
[[ "$CX3" == 403 ]] && ok "cancel with wrong phone → 403" "" || bad "cancel wrong phone" "$CX3"

# ── 7. admin cancel restores stock exactly once ─────────────────────────────
O2=$(curl -s -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d '{"payload":"{\"customer\":{\"name\":\"QA Two\",\"phone\":\"01811111111\"},\"shipping\":{\"address\":\"2 Admin Ave\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"whey\",\"qty\":2}],\"paymentMethod\":\"cod\"}"}')
ON2=$(echo "$O2" | JQ "['order']['orderNumber']"); OID2=$(oidof "$ON2")
[[ "$(stockof)" == "13" ]] && ok "O2 placed — stock 15→13 (qty 2)" "$ON2" || bad "O2 stock" "$(stockof)"
ST=$(curl -s -o /tmp/q28s -w '%{http_code}' -X PATCH "$BASE/api/admin/orders/$OID2/status" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"cancelled","note":"QA admin cancel"}')
[[ "$ST" == 200 ]] && ok "admin status → cancelled" "$ON2" || bad "admin cancel" "$ST $(cat /tmp/q28s)"
DET=$(curl -s "$BASE/api/admin/orders/$OID2" -H "$AH")
[[ "$(echo "$DET" | JQ "['order']['stockRestored']")" == "True" && "$(stockof)" == "15" ]] \
  && ok "admin cancel restored stock 13→15 + flag set" "stockRestored=$(echo "$DET" | JQ "['order']['stockRestored']")" || bad "admin restore" "$(stockof) $(echo "$DET" | JQ "['order']['stockRestored']")"
curl -s -o /dev/null -X PATCH "$BASE/api/admin/orders/$OID2/status" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"cancelled","note":"re-cancel"}'
[[ "$(stockof)" == "15" ]] && ok "re-cancel does NOT double-restore (stock 15)" "" || bad "double restore" "$(stockof)"

# ── 8. payment reject restores stock + dup TrxID guard ──────────────────────
O3=$(curl -s -X POST $BASE/api/orders -F "payload={\"customer\":{\"name\":\"QA Three\",\"phone\":\"01922222222\"},\"shipping\":{\"address\":\"3 Reject St\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"whey\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"QA28TRX01\"}" -F "screenshot=@$SHOT")
ON3=$(echo "$O3" | JQ "['order']['orderNumber']"); OID3=$(oidof "$ON3")
[[ "$(echo "$O3" | JQ "['order']['status']")" == "verifying" && "$(stockof)" == "14" ]] \
  && ok "bkash order verifying — stock 15→14" "$ON3" || bad "bkash order" "$O3"
DTRX=$(curl -s -o /tmp/q28t -w '%{http_code}' -X POST $BASE/api/orders -F "payload={\"customer\":{\"name\":\"QA Dup\",\"phone\":\"01922222223\"},\"shipping\":{\"address\":\"x\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"whey\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"qa28trx01\"}" -F "screenshot=@$SHOT")
[[ "$DTRX" == 409 && "$(cat /tmp/q28t)" == *'already used'* ]] && ok "duplicate TrxID (case-insensitive) → 409" "" || bad "dup trx" "$DTRX $(cat /tmp/q28t)"
RJ=$(curl -s -o /tmp/q28r -w '%{http_code}' -X PATCH "$BASE/api/admin/orders/$OID3/reject" -H "$AH" -H 'Content-Type: application/json' -d '{"reason":"QA — trx not found in statement"}')
[[ "$RJ" == 200 && "$(cat /tmp/q28r | JQ "['order']['payment']['status']")" == "rejected" && "$(stockof)" == "15" ]] \
  && ok "payment rejected → stock restored 14→15" "$(stockof)" || bad "reject restore" "$RJ $(stockof)"

# ── 9. PDF invoice (phone proof / admin JWT / owner JWT) ────────────────────
curl -s -o /tmp/q28inv.pdf -w '%{http_code}' "$BASE/api/orders/$ON2/invoice.pdf?phone=111111" > /tmp/q28ivc
C1=$(cat /tmp/q28ivc)
MAGIC=$(head -c 4 /tmp/q28inv.pdf)
[[ "$C1" == 200 && "$MAGIC" == "%PDF" ]] && ok "invoice with phone proof → real PDF" "$(ls -la /tmp/q28inv.pdf | awk '{print $5" bytes"}')" || bad "invoice phone" "$C1 magic=$MAGIC"
C2=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/orders/$ON2/invoice.pdf?phone=654321")
[[ "$C2" == 403 ]] && ok "invoice wrong phone → 403" "" || bad "invoice 403" "$C2"
C3=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/orders/$ON2/invoice.pdf")
[[ "$C3" == 400 ]] && ok "invoice without any proof → 400" "" || bad "invoice 400" "$C3"
C4=$(curl -s -o /tmp/q28inv2.pdf -w '%{http_code}' "$BASE/api/orders/$ON2/invoice.pdf" -H "$AH")
[[ "$C4" == 200 && "$(head -c 4 /tmp/q28inv2.pdf)" == "%PDF" ]] && ok "invoice with ADMIN JWT (no phone) → PDF" "" || bad "invoice admin" "$C4"

# ── 10. guest order → account linking ───────────────────────────────────────
O4=$(curl -s -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d '{"payload":"{\"customer\":{\"name\":\"QA Link\",\"phone\":\"01700000002\",\"email\":\"glink28@test.forged\"},\"shipping\":{\"address\":\"4 Link Ln\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"belt\",\"qty\":1}],\"paymentMethod\":\"cod\"}"}')
ON4=$(echo "$O4" | JQ "['order']['orderNumber']")
[[ "$(echo "$O4" | JQ "['order']['isGuest']")" == "True" ]] && ok "guest order placed" "$ON4" || bad "guest order" "$O4"
REG=$(curl -s -o /tmp/q28reg -w '%{http_code}' -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"QA Link","email":"glink28@test.forged","phone":"01700000002","password":"forge2026"}')
if [[ "$REG" == 201 ]]; then
  UT=$(cat /tmp/q28reg | JQ "['token']"); LO=$(cat /tmp/q28reg | JQ "['linkedOrders']")
  ok "register links guest orders" "linkedOrders=$LO"
else
  LG=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"glink28@test.forged","password":"forge2026"}')
  UT=$(echo "$LG" | JQ "['token']"); LO=$(echo "$LG" | JQ "['linkedOrders']")
  ok "existing account — login re-links new guest order" "linkedOrders=$LO"
fi
MYO=$(curl -s "$BASE/api/orders/my" -H "Authorization: Bearer $UT")
[[ "$(echo "$MYO" | python3 -c "import sys,json;print(any(i['orderNumber']=='$ON4' for i in json.load(sys.stdin)['items']))")" == "True" ]] \
  && ok "guest order visible in /orders/my" "$ON4" || bad "my orders" "$MYO | $ON4"
C5=$(curl -s -o /tmp/q28inv3.pdf -w '%{http_code}' "$BASE/api/orders/$ON4/invoice.pdf" -H "Authorization: Bearer $UT")
[[ "$C5" == 200 && "$(head -c 4 /tmp/q28inv3.pdf)" == "%PDF" ]] && ok "owner JWT invoice (no phone) → PDF" "$ON4" || bad "owner invoice" "$C5"

# ── 11. returns / RMA + refund ledger ───────────────────────────────────────
O5=$(curl -s -X POST $BASE/api/orders -H 'Content-Type: application/json' \
  -d '{"payload":"{\"customer\":{\"name\":\"QA Return\",\"phone\":\"01700000003\"},\"shipping\":{\"address\":\"5 Return Way\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"whey\",\"qty\":1}],\"paymentMethod\":\"cod\"}"}')
ON5=$(echo "$O5" | JQ "['order']['orderNumber']"); OID5=$(oidof "$ON5")
RE0=$(curl -s -o /tmp/q28r0 -w '%{http_code}' -X POST "$BASE/api/orders/$ON5/returns" -H 'Content-Type: application/json' -d '{"phone":"000003","reason":"damaged"}')
[[ "$RE0" == 400 ]] && ok "return on non-delivered order → 400" "$(cat /tmp/q28r0)" || bad "return pre-delivered" "$RE0"
curl -s -o /dev/null -X PATCH "$BASE/api/admin/orders/$OID5/status" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"shipped","note":"QA"}'
curl -s -o /dev/null -X PATCH "$BASE/api/admin/orders/$OID5/status" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"delivered","note":"QA"}'
RE1=$(curl -s -o /tmp/q28r1 -w '%{http_code}' -X POST "$BASE/api/orders/$ON5/returns" -H 'Content-Type: application/json' \
  -d '{"phone":"000003","reason":"damaged","note":"QA damage","items":[{"slug":"whey","qty":1}]}')
RID=$(cat /tmp/q28r1 | JQ "['request']['id']")
[[ "$RE1" == 201 && -n "$RID" && "$RID" != "None" ]] && ok "return request on delivered order → 201" "$RID" || bad "return create" "$RE1 $(cat /tmp/q28r1)"
RE2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/orders/$ON5/returns" -H 'Content-Type: application/json' -d '{"phone":"000003","reason":"other"}')
[[ "$RE2" == 409 ]] && ok "second ACTIVE return → 409" "" || bad "dup return" "$RE2"
RL=$(curl -s "$BASE/api/admin/returns?status=requested" -H "$AH")
[[ "$(echo "$RL" | python3 -c "import sys,json;print(any(i['orderNumber']=='$ON5' for i in json.load(sys.stdin)['items']))")" == "True" ]] \
  && ok "admin returns list shows the request" "$ON5" || bad "returns list" "$RL"
AP=$(curl -s -o /tmp/q28ap -w '%{http_code}' -X PATCH "$BASE/api/admin/returns/$RID" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"approved","note":"QA approved"}')
[[ "$AP" == 200 && "$(cat /tmp/q28ap | JQ "['request']['status']")" == "approved" ]] && ok "admin approve return" "" || bad "approve" "$AP $(cat /tmp/q28ap)"
RF=$(curl -s -o /tmp/q28rf -w '%{http_code}' -X PATCH "$BASE/api/admin/returns/$RID" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"refunded","refundAmount":500,"note":"bKash send-back"}')
[[ "$RF" == 200 && "$(cat /tmp/q28rf | JQ "['request']['refundAmount']")" == "500" ]] && ok "mark refunded (৳500)" "" || bad "refund" "$RF $(cat /tmp/q28rf)"
DET5=$(curl -s "$BASE/api/admin/orders/$OID5" -H "$AH")
RFN=$(echo "$DET5" | python3 -c "import sys,json;o=json.load(sys.stdin)['order'];print(len(o['payment'].get('refunds') or []), (o['payment']['refunds'] or [{}])[0].get('amount'))" 2>/dev/null)
[[ "$RFN" == "1 500" ]] && ok "refund ledger written on the ORDER" "payment.refunds=$RFN" || bad "refund ledger" "$RFN"

# ── 12. courier push (dry-run + graceful failure) ───────────────────────────
CS=$(curl -s -o /tmp/q28cs -w '%{http_code}' -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' \
  -d '{"courier":{"provider":"steadfast","steadfast":{"apiKey":"qa-fake-key","secretKey":"qa-fake-secret"}}}')
[[ "$CS" == 200 ]] && ok "courier settings saved (steadfast fake keys)" "" || bad "courier settings" "$CS $(cat /tmp/q28cs)"
CBAD=$(curl -s -o /tmp/q28cb -w '%{http_code}' -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"courier":{"provider":"tcs"}}')
[[ "$CBAD" == 400 ]] && ok "invalid courier provider → 400" "" || bad "provider guard" "$CBAD"
PU=$(curl -s --max-time 40 -X POST "$BASE/api/admin/orders/$OID5/courier/push" -H "$AH" -H 'Content-Type: application/json' -d '{}')
POK=$(echo "$PU" | JQ "['result']['ok']"); PMSG=$(echo "$PU" | JQ "['result']['message']")
[[ "$POK" == "False" && -n "$PMSG" && "$PMSG" != "None" ]] \
  && ok "push with fake Steadfast keys → graceful ok:false" "$PMSG" || bad "courier push fail path" "$PU"
curl -s -o /dev/null -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"courier":{"provider":"none","steadfast":{"apiKey":"","secretKey":""}}}'
PU2=$(curl -s --max-time 20 -X POST "$BASE/api/admin/orders/$OID5/courier/push" -H "$AH" -H 'Content-Type: application/json' -d '{}')
[[ "$(echo "$PU2" | JQ "['result']['dryRun']")" == "True" && "$(echo "$PU2" | JQ "['result']['provider']")" == "none" ]] \
  && ok "provider none → dry-run answer (manual mode)" "$(echo "$PU2" | JQ "['result']['message']")" || bad "dry-run" "$PU2"

# ── 13. order funnel analytics ──────────────────────────────────────────────
AN=$(curl -s "$BASE/api/admin/analytics/orders?days=30" -H "$AH")
PLACED=$(echo "$AN" | JQ "['funnel']['placed']")
[[ "$PLACED" -ge 6 ]] 2>/dev/null && ok "funnel.placed counts the suite's orders" "placed=$PLACED" || bad "funnel placed" "$AN | placed=$PLACED"
CR=$(echo "$AN" | JQ "['payment']['codRate']")
python3 -c "exit(0 if 0.0 <= float('$CR') <= 1.0 else 1)" 2>/dev/null && ok "codRate in [0,1]" "$CR" || bad "codRate" "$CR"
RR=$(echo "$AN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['payment']['rejectReasons']))")
[[ "$RR" -ge 1 ]] 2>/dev/null && ok "rejection reasons captured" "reasons=$RR" || bad "rejectReasons" "$AN"
AH2=$(echo "$AN" | JQ "['fulfillment']['deliveredCount']")
[[ "$AH2" -ge 1 ]] 2>/dev/null && ok "fulfillment deliveredCount" "delivered=$AH2 avgHours=$(echo "$AN" | JQ "['fulfillment']['avgHours']")" || bad "fulfillment" "$AN"
HAS=$(echo "$AN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(any(m['method']=='cod' for m in d['payment']['byMethod']))")
[[ "$HAS" == "True" ]] && ok "byMethod split includes cod" "" || bad "byMethod" "$AN"
REV=$(echo "$AN" | JQ "['revenue']['total']")
[[ "$REV" != "0" && "$REV" != "None" ]] && ok "revenue total (live orders excl. cancelled)" "৳$REV" || bad "revenue" "$REV"
AN2=$(curl -s "$BASE/api/admin/analytics/orders?days=400" -H "$AH")
[[ "$(echo "$AN2" | JQ "['days']")" == "365" ]] && ok "days capped at 365" "" || bad "days cap" "$AN2"

# ── 14. SPA + cleanup ───────────────────────────────────────────────────────
SPA=$(curl -s -o /dev/null -w '%{http_code}' $BASE/); ADM=$(curl -s -o /dev/null -w '%{http_code}' $BASE/admin/)
[[ "$SPA" == 200 && "$ADM" == 200 ]] && ok "storefront + admin SPA served" "" || bad "SPA" "$SPA/$ADM"
node src/seed/seed.js > /dev/null 2>&1 && ok "DB reseeded to clean state" ""

echo "──────────────────────────────"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] && echo "✅ QA Task 28 — ALL GREEN" || echo "❌ Task 28 has failures"
exit $FAIL
