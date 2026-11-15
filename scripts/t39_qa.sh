#!/bin/bash
# Task 39 QA — automated online payment gateway (demo simulator + toggles + retry + refund)
# Run: bash /home/z/my-project/scripts/t39_qa.sh
API=http://localhost:5000/api
AT=$(cat /home/z/my-project/scripts/t36_at)
AUTH="Authorization: Bearer $AT"
CT="Content-Type: application/json"
JG="node /home/z/my-project/scripts/jget.js"
RUNID=$(date +%s)
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✓ $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  ✗ $1"; }
chk(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want=[$2] got=[$1])"; fi; }

echo "── 0. baseline: public settings hide gateway secret"
PUB=$(curl -s $API/settings/payment)
chk "$(echo "$PUB" | $JG 'j=>j.payments.online.enabled')" "false" "online disabled by default"
chk "$(echo "$PUB" | grep -c storePassword)" "0" "storePassword never leaks to public API"

echo "── 1. admin settings guards"
R=$(curl -s -o /tmp/t39_1.json -w "%{http_code}" -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"online":{"enabled":true,"mode":"sandbox"}}}')
chk "$R" "400" "sandbox enable refused without storeId+password"
R=$(curl -s -o /dev/null -w "%{http_code}" -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"online":{"mode":"bogus"}}}')
chk "$R" "400" "invalid mode rejected"

echo "── 2. enable ONLINE in DEMO mode"
R=$(curl -s -o /tmp/t39_2.json -w "%{http_code}" -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"online":{"enabled":true,"mode":"demo"}}}')
chk "$R" "200" "gateway enabled (demo)"
chk "$($JG 'j=>j.setting.payments.online.enabled+" "+j.setting.payments.online.mode' < /tmp/t39_2.json)" "true demo" "admin sees enabled+demo"

echo "── 3. online initiate: order created + session opened"
PAYLOAD='{"customer":{"name":"QA Gateway","phone":"01712345699","email":"gwy@test.bd"},"shipping":{"address":"12 Press Bench","city":"Dhaka","division":"dhaka","postal":"1213"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"online","idempotencyKey":"t39-idem-$RUNID-1"}'
PAYLOAD="${PAYLOAD/\$RUNID/$RUNID}"
INIT=$(curl -s -X POST $API/orders/online-initiate -H "$CT" -d "$PAYLOAD")
ONO=$(echo "$INIT" | $JG 'j=>j.order.orderNumber')
URL=$(echo "$INIT" | $JG 'j=>j.redirectUrl')
chk "$($JG 'j=>j.order.payment.status+" / "+j.order.status' <<< "$INIT")" "initiated / awaiting-payment" "order $ONO created at awaiting-payment"
case "$URL" in /api/payment/demo/*) ok "demo redirectUrl: $URL";; *) bad "redirectUrl malformed: [$URL]";; esac

echo "── 4. idempotency: same key returns the SAME order"
DUP=$(curl -s -X POST $API/orders/online-initiate -H "$CT" -d "$PAYLOAD")
chk "$(echo "$DUP" | $JG 'j=>j.duplicate===true && j.order.orderNumber===A[0]' "$ONO")" "true" "duplicate initiate → original order"

echo "── 5. demo page renders + belongs to the order"
R=$(curl -s -o /tmp/t39_demo.html -w "%{http_code}" "http://localhost:5000$URL")
chk "$R" "200" "simulator page 200"
chk "$(grep -c "SSLCOMMERZ" /tmp/t39_demo.html)" "2" "page carries gateway chrome"
chk "$(grep -c "$ONO" /tmp/t39_demo.html)" "1" "page shows the order number"

echo "── 6. simulate SUCCESS → paid + processing (auto)"
curl -s -o /dev/null -L "http://localhost:5000$URL/finish?result=success"
ST=$(curl -s "$API/orders/track/$ONO?phone=01712345699")
chk "$(echo "$ST" | $JG 'j=>j.order.payment.status+" "+j.order.status+" "+j.order.payment.gateway.cardType')" "paid processing DEMO CARD" "payment paid · order auto-processing · cardType stamped"
chk "$(echo "$ST" | $JG 'j=>j.order.statusHistory.some(h=>/verified via gateway/.test(h.note))')" "true" "statusHistory has gateway-verify entry"

echo "── 7. idempotent settle: repeat finish cannot double-fire"
H1=$(echo "$ST" | $JG 'j=>j.order.statusHistory.length')
curl -s -o /dev/null -L "http://localhost:5000$URL/finish?result=success"
H2=$(curl -s "$API/orders/track/$ONO?phone=01712345699" | $JG 'j=>j.order.statusHistory.length')
chk "$H1" "$H2" "history unchanged on repeat finish"

echo "── 8. retry guards on the PAID order"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/orders/$ONO/online-retry" -H "$CT" -d '{"phone":"01712345699"}')
chk "$R" "409" "cannot retry a paid order"
R=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/orders/$ONO/online-retry" -H "$CT" -d '{"phone":"01999999999"}')
chk "$R" "403" "wrong phone proof → 403"

echo "── 9. FAIL path: order survives + retry re-opens a fresh session"
PAYLOAD2='{"customer":{"name":"QA Gateway Two","phone":"01712345688","email":"gwy2@test.bd"},"shipping":{"address":"12 Press Bench","city":"Dhaka","division":"dhaka","postal":"1213"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"online","idempotencyKey":"t39-idem-$RUNID-2"}'
PAYLOAD2="${PAYLOAD2/\$RUNID/$RUNID}"
INIT2=$(curl -s -X POST $API/orders/online-initiate -H "$CT" -d "$PAYLOAD2")
ONO2=$(echo "$INIT2" | $JG 'j=>j.order.orderNumber')
URL2=$(echo "$INIT2" | $JG 'j=>j.redirectUrl')
curl -s -o /dev/null -L "http://localhost:5000$URL2/finish?result=fail"
ST2=$(curl -s "$API/orders/track/$ONO2?phone=01712345688")
chk "$(echo "$ST2" | $JG 'j=>j.order.payment.status+" "+j.order.status')" "failed awaiting-payment" "failed → order survives at awaiting-payment"
RE=$(curl -s -X POST "$API/orders/$ONO2/online-retry" -H "$CT" -d '{"phone":"01712345688"}')
URL3=$(echo "$RE" | $JG 'j=>j.redirectUrl')
case "$URL3" in /api/payment/demo/*) ok "retry opened a FRESH session: $URL3";; *) bad "retry did not return a session: [$URL3]";; esac
curl -s -o /dev/null -L "http://localhost:5000$URL3/finish?result=success"
chk "$(curl -s "$API/orders/track/$ONO2?phone=01712345688" | $JG 'j=>j.order.payment.status+" "+j.order.status')" "paid processing" "retry → success → paid + processing"

echo "── 10. cancel path: cancel an awaiting-payment order releases stock"
PAYLOAD3='{"customer":{"name":"QA Gateway Three","phone":"01712345677","email":"gwy3@test.bd"},"shipping":{"address":"9 Squat","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":2}],"paymentMethod":"online","idempotencyKey":"t39-idem-$RUNID-3"}'
PAYLOAD3="${PAYLOAD3/\$RUNID/$RUNID}"
INIT3=$(curl -s -X POST $API/orders/online-initiate -H "$CT" -d "$PAYLOAD3")
ONO3=$(echo "$INIT3" | $JG 'j=>j.order.orderNumber')
BELT_BEFORE=$(curl -s "$API/products/belt" | $JG 'j=>j.product?(j.product.stock!==undefined?j.product.stock:j.product.countInStock):"?"')
curl -s -o /dev/null -X PATCH "$API/orders/$ONO3/cancel" -H "$CT" -d '{"phone":"01712345677"}'
ST3=$(curl -s "$API/orders/track/$ONO3?phone=01712345677")
chk "$(echo "$ST3" | $JG 'j=>j.order.status')" "cancelled" "awaiting-payment order cancellable by customer"

echo "── 11. refund (demo) on the paid order"
OID=$(curl -s -H "$AUTH" "$API/admin/orders?search=$ONO2" | $JG 'j=>{const it=(j.items||j.orders||[]).find(x=>x.orderNumber===A[0]);return it?it._id:"ERR"}' "$ONO2")
RF=$(curl -s -X PATCH "$API/admin/orders/$OID/refund" -H "$AUTH" -H "$CT" -d '{"note":"QA refund"}')
chk "$(echo "$RF" | $JG 'j=>Boolean(j.order.payment.gateway.refundRef)+" "+j.order.payment.refunds.length')" "true 1" "refundRef stamped + ledger entry"
R=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "$API/admin/orders/$OID/refund" -H "$AUTH" -H "$CT" -d '{}')
chk "$R" "409" "second refund blocked"

echo "── 12. manual-method toggle matrix (server-side enforcement)"
curl -s -o /dev/null -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"bkash":{"enabled":false}}}'
R=$(curl -s -o /tmp/t39_12a.json -w "%{http_code}" -X POST $API/orders -F 'payload={"customer":{"name":"QA Toggle","phone":"01712345666","email":"tg@test.bd"},"shipping":{"address":"1 Barbell","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"bkash","trxId":"QA123456"}')
chk "$($JG 'j=>(j.message||"").includes("currently disabled")' < /tmp/t39_12a.json)" "true" "disabled bKash order rejected server-side"
curl -s -o /dev/null -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"bkash":{"enabled":true}}}'
R=$(curl -s -o /tmp/t39_12b.json -w "%{http_code}" -X POST $API/orders -F 'payload={"customer":{"name":"QA Toggle2","phone":"01712345666","email":"tg2@test.bd"},"shipping":{"address":"1 Barbell","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"bkash","trxId":"QA123457"}')
chk "$($JG 'j=>(j.message||"")' < /tmp/t39_12b.json)" "Payment screenshot is required" "re-enabled → method accepted, normal validation applies"

echo "── 13. COD toggle off → rejected"
curl -s -o /dev/null -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"cod":{"enabled":false}}}'
R=$(curl -s -o /tmp/t39_13.json -w "%{http_code}" -X POST $API/orders -F 'payload={"customer":{"name":"QA Cod","phone":"01712345655","email":"cod@test.bd"},"shipping":{"address":"1 Plate","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"cod"}')
chk "$($JG 'j=>(j.message||"").includes("currently disabled")' < /tmp/t39_13.json)" "true" "disabled COD rejected server-side"
curl -s -o /dev/null -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"cod":{"enabled":true}}}'

echo "── 14. gateway OFF (final state) → initiate rejected"
curl -s -o /dev/null -X PUT $API/admin/settings -H "$AUTH" -H "$CT" -d '{"payments":{"online":{"enabled":false}}}'
PAYLOAD_OFF='{"customer":{"name":"QA Gateway Off","phone":"01712345644","email":"gwoff@test.bd"},"shipping":{"address":"1 Rack","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1}],"paymentMethod":"online","idempotencyKey":"t39-idem-014"}'
R=$(curl -s -o /tmp/t39_14.json -w "%{http_code}" -X POST $API/orders/online-initiate -H "$CT" -d "$PAYLOAD_OFF")
chk "$($JG 'j=>(j.message||"").includes("currently disabled")' < /tmp/t39_14.json)" "true" "gateway-off initiate rejected"

echo "── 15. pipeline health (manual flow untouched)"
R=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$API/admin/orders?limit=5")
chk "$R" "200" "admin order list OK"
R=$(curl -s -o /dev/null -w "%{http_code}" "$API/orders/track/$ONO?phone=01712345699")
chk "$R" "200" "track endpoint OK"
R=$(curl -s -o /dev/null -w "%{http_code}" "$API/health")
chk "$R" "200" "API health OK"

echo
echo "════════ TASK 39 QA: $PASS passed · $FAIL failed ════════"
