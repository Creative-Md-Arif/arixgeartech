#!/bin/bash
# FORGED — browser QA v2: single browser session (token survives), full flow
set -u
B=http://127.0.0.1:5000
OUT=/home/z/my-project/scripts
AB="agent-browser"

curl -sf -m 2 127.0.0.1:5000/api/health >/dev/null 2>&1 || bash /home/z/my-project/scripts/qa_stack_boot.sh >/dev/null 2>&1
curl -sf -m 2 127.0.0.1:5000/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }

echo "=== 1. admin login ==="
$AB close >/dev/null 2>&1; sleep 1
$AB open $B/admin/index.html >/dev/null 2>&1; sleep 1.5
$AB fill "#liEmail" "admin@forged.fit" >/dev/null
$AB fill "#liPass" "ForgeAdmin2026" >/dev/null
$AB find text "Sign In" click >/dev/null
$AB wait --url "dashboard.html" >/dev/null 2>&1
echo "URL: $($AB get url)"

echo "=== 2. row click -> separate order-detail page ==="
$AB find first ".row-click" click >/dev/null
$AB wait --url "order-detail.html" >/dev/null 2>&1
sleep 1
URL=$($AB get url); echo "URL: $URL"
case "$URL" in *order-detail.html?id=*) echo "OK navigated with ?id=";; *) echo "FAIL: $URL"; exit 1;; esac
echo "head:    $($AB find first '.detail-head h2' text) | $($AB find first '.detail-head .chip' text)"
echo "trx:     $($AB find first '.trx-big' text)"
echo "grand:   $($AB find first '.tot-line.big .v' text)"
echo "shot:    $($AB get count '.shot-big') big screenshot(s)"
echo "buttons: verify=$($AB get count '#aVerify') reject=$($AB get count '#aReject') courier=$($AB get count '#aCourier')"
$AB screenshot $OUT/qa10_order_detail.png >/dev/null && echo "shot saved: qa10_order_detail.png"

echo "=== 3. verify payment on the page ==="
$AB find text "Verify Payment" click >/dev/null
sleep 0.6
$AB dialog accept >/dev/null
sleep 1.5
HEAD=$($AB find first '.detail-head' text)
echo "$HEAD" | head -c 120; echo
case "$HEAD" in *PROCESSING*) echo "OK status -> processing";; *) echo "WARN not processing";; esac
case "$HEAD" in *VERIFIED*) echo "OK payment verified";; *) echo "WARN not verified";; esac
$AB screenshot $OUT/qa10_verified.png >/dev/null

echo "=== 4. orders page search (regression: rx.replace bug) — same session ==="
$AB open $B/admin/orders.html >/dev/null 2>&1; sleep 1.5
$AB fill "#ofSearch" "SEED001" >/dev/null
sleep 1.2
echo "rows found: $($AB get count '#ordersTableWrap tbody tr')"
echo "first cell: $($AB find first '#ordersTableWrap tbody tr td' text | head -c 60)"

echo "=== 5. storefront checkout renders ৳ BDT — same session ==="
$AB open $B/index.html >/dev/null 2>&1; sleep 1.5
$AB eval "localStorage.removeItem('forged_v1'); addToCart('whey',null,null,1); 'cart-ok'" 2>/dev/null | head -1
$AB open $B/checkout.html >/dev/null 2>&1; sleep 1.5
echo "subtotal: $($AB find first '#coSubtotal' text)"
echo "shipping: $($AB find first '#coShipping' text)"
echo "total:    $($AB find first '#coTotal' text)"
echo "payAmt:   $($AB find first '#payAmt' text)"
$AB eval "var s=document.querySelector('#coDivision'); s.value='sylhet'; s.dispatchEvent(new Event('change')); 'ok'" >/dev/null 2>&1
sleep 0.8
echo "sylhet -> shipping: $($AB find first '#coShipping' text) | total: $($AB find first '#coTotal' text)"
$AB screenshot $OUT/qa10_checkout_bdt.png >/dev/null && echo "shot saved: qa10_checkout_bdt.png"

echo "=== 6. console errors sweep ==="
$AB errors
echo "QA DONE"
