#!/bin/bash
# FORGED — curl verification suite against a RUNNING stack (localhost:5000)
set -u
cd /home/z/my-project/backend
B=localhost:5000
TRX="bxqa$(date +%H%M%S)"

echo "=== 1. shipping settings (৳60–120 + free 15000) ==="
curl -s $B/api/settings/shipping
echo; echo "=== 2. products all BDT ==="
curl -s "$B/api/products" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d['items']: print(' ', p['slug'], p['price'], p.get('comparePrice'))
assert len(d['items'])==8 and all(isinstance(p['price'],int) and p['price']>500 for p in d['items'])
print(' OK 8 products BDT')"

echo "=== 3. admin login ==="
TOKEN=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
[ -n "$TOKEN" ] && echo " OK admin token" || { echo FAIL; exit 1; }

echo "=== 4. FORGE10 on 6490 (expect 649 off) ==="
curl -s -X POST $B/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FORGE10","subtotal":6490}'

echo; echo "=== 5. guest bKash order whey→sylhet (expect 6490−649+120=5961) ==="
PAYLOAD="{\"customer\":{\"name\":\"Rafi Ahmed\",\"phone\":\"01819-998877\",\"email\":\"rafi@example.com\"},\"shipping\":{\"address\":\"Zindabazar, Sylhet\",\"city\":\"Sylhet\",\"division\":\"sylhet\"},\"items\":[{\"slug\":\"whey\",\"qty\":1}],\"couponCode\":\"FORGE10\",\"paymentMethod\":\"bkash\",\"trxId\":\"$TRX\",\"senderNumber\":\"01819-998877\"}"
ORDER=$(curl -s -X POST $B/api/orders -F "payload=$PAYLOAD" -F "screenshot=@src/seed/demo-proof.png;type=image/png")
echo "$ORDER" | python3 -c "
import json,sys
d=json.load(sys.stdin); o=d.get('order')
assert o, 'order missing: '+json.dumps(d)[:300]
t=o['totals']
print(' ',o['orderNumber'],'| sub',t['subtotal'],'| disc',t['discount'],'| ship',t['shipping'],'| total',t['grandTotal'])
assert (t['subtotal'],t['discount'],t['shipping'],t['grandTotal'])==(6490,649,120,5961), 'totals wrong'
assert o['payment']['trxId']=='$TRX'.upper(), 'trxId not uppercased'
assert 'screenshot' not in o['payment'], 'publicView must strip screenshot'
print(' OK totals + TrxID uppercase + screenshot stripped from public view')"
NO=$(echo "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin)['order']['orderNumber'])")
OID=$(curl -s "$B/api/admin/orders?search=$NO" -H "Authorization: Bearer $TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['items'][0]['_id'])")

echo "=== 6. admin order detail (order-detail.html data source) ==="
curl -s "$B/api/admin/orders/$OID" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin); o=d['order']
assert o['orderNumber'] and o['customer']['name'] and o['totals']['grandTotal']==5961
assert o['payment']['trxId']=='$TRX'.upper(), o['payment']['trxId']
assert o['payment']['screenshot']['url'], 'admin detail must include screenshot url'
print(' OK detail:', o['orderNumber'], o['status'], o['payment']['status'], '| screenshot:', o['payment']['screenshot']['url'][:40], '| history', len(o['statusHistory']))"

echo "=== 7. duplicate TrxID (expect 409) ==="
DUP="{\"customer\":{\"name\":\"Dup\",\"phone\":\"01800000000\"},\"shipping\":{\"address\":\"X\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"tee\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"$TRX\"}"
curl -s -w " HTTP %{http_code} " -X POST $B/api/orders -F "payload=$DUP" -F "screenshot=@src/seed/demo-proof.png;type=image/png" | python3 -c "
import sys
raw=sys.stdin.read()
assert ' 409 ' in raw or raw.rstrip().endswith('409'), 'expected 409, got: '+raw[-160:]
print('OK 409 duplicate blocked →', raw.split('HTTP')[1].strip()[:60])"

echo "=== 8. tracking last-6 phone ==="
curl -s "$B/api/orders/track/$NO?phone=998877" | python3 -c "
import json,sys
o=json.load(sys.stdin)['order']
print(' OK', o['orderNumber'], o['status'], '৳', o['totals']['grandTotal'])"

echo "=== 9. admin orders list (৳) ==="
curl -s "$B/api/admin/orders?limit=4" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for o in d['items'][:4]: print(' ', o['orderNumber'], o['payment']['method'], '৳'+str(o['totals']['grandTotal']), o['status'])
print(' OK', d['total'], 'orders total')"

echo "=== 10. WELCOME500 min-order message (৳3,000) ==="
curl -s -X POST $B/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"WELCOME500","subtotal":1990}'

echo; echo "=== 11. verify payment → processing ==="
curl -s -X PATCH "$B/api/admin/orders/$OID/verify" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | python3 -c "
import json,sys
o=json.load(sys.stdin)['order']
print(' OK status:', o['status'], '| payment:', o['payment']['status'])"

echo "=== 12. email dry-run ৳ ==="
grep -o '৳[0-9,]*' logs/emails.jsonl 2>/dev/null | head -3 || echo " (no log)"
echo "ALL CURL CHECKS DONE"
