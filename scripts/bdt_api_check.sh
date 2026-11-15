#!/bin/bash
# FORGED — one-shot stack boot + BDT API verification
set -u
cd /home/z/my-project/download/forged-full-project/backend

pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; sleep 1

node scripts/dev-mongo.js > /tmp/mongo.log 2>&1 &
MONGO_PID=$!
for i in $(seq 1 30); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
ss -tln | grep -q 27017 && echo "✔ mongo up" || { echo "✘ mongo failed"; tail -5 /tmp/mongo.log; exit 1; }

npm run seed 2>&1 | tail -2

node server.js > /tmp/api.log 2>&1 &
API_PID=$!
for i in $(seq 1 20); do curl -sf -m 2 localhost:5000/api/health >/dev/null 2>&1 && break; sleep 1; done
curl -sf localhost:5000/api/health >/dev/null && echo "✔ api up" || { echo "✘ api failed"; tail -8 /tmp/api.log; exit 1; }

echo "=== 1. shipping settings (expect ৳ + 60..120 + 15000) ==="
curl -s localhost:5000/api/settings/shipping
echo; echo "=== 2. product prices (BDT ints) ==="
curl -s "localhost:5000/api/products" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for p in d['items']: print(' ', p['slug'], p['price'], p.get('comparePrice'))
assert all(isinstance(p['price'],int) and p['price']>500 for p in d['items']), 'prices not BDT'
print(' ✔ 8 products all BDT')"

echo "=== 3. admin login ==="
TOKEN=$(curl -s -X POST localhost:5000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
[ -n "$TOKEN" ] && echo " ✔ admin token" || { echo "✘ login failed"; exit 1; }

echo "=== 4. FORGE10 on ৳6,490 whey (expect discount 649) ==="
curl -s -X POST localhost:5000/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FORGE10","subtotal":6490}'

echo; echo "=== 5. guest bKash order — whey×1 to Sylhet (expect 6490−649+120=5961) ==="
PAYLOAD='{"customer":{"name":"Test Kumar","phone":"01819-998877","email":"test@example.com"},"shipping":{"address":"Zindabazar, Sylhet","city":"Sylhet","division":"sylhet"},"items":[{"slug":"whey","qty":1}],"couponCode":"FORGE10","paymentMethod":"bkash","trxId":"bxtest01","senderNumber":"01819-998877"}'
ORDER=$(curl -s -X POST localhost:5000/api/orders -F "payload=$PAYLOAD" -F "screenshot=@src/seed/demo-proof.png;type=image/png")
echo "$ORDER" | python3 -c "
import json,sys
d=json.load(sys.stdin); o=d.get('order')
assert o, 'order missing: '+json.dumps(d)[:200]
t=o['totals']
print(' order:',o.get('orderNumber'),'| subtotal',t['subtotal'],'| discount',t['discount'],'| ship',t['shipping'],'| total',t['grandTotal'])
assert t['subtotal']==6490 and t['discount']==649 and t['shipping']==120 and t['grandTotal']==5961, 'BDT totals wrong'
print(' ✔ server totals correct in ৳ (6490 − 649 + 120 = 5961)')"
NO=$(echo "$ORDER" | python3 -c "import json,sys; print(json.load(sys.stdin).get('order',{}).get('orderNumber',''))")

echo "=== 6. duplicate TrxID (expect 409) ==="
DUP='{"customer":{"name":"Dup","phone":"01800000000"},"shipping":{"address":"X","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"bkash","trxId":"BXTEST01"}'
curl -s -w "\n HTTP %{http_code}\n" -X POST localhost:5000/api/orders -F "payload=$DUP" -F "screenshot=@src/seed/demo-proof.png;type=image/png" | tail -2

echo "=== 7. public tracking for $NO (phone last-6) ==="
curl -s "localhost:5000/api/orders/track/$NO?phone=998877" | python3 -c "
import json,sys
d=json.load(sys.stdin); o=d.get('order')
assert o, 'track failed: '+json.dumps(d)[:200]
print(' status:',o['status'],'| total ৳',o['totals']['grandTotal'],'| history:',len(o.get('statusHistory',[])),'entries')
print(' ✔ tracking OK')"

echo "=== 8. admin orders list shows ৳ grandTotals ==="
curl -s "localhost:5000/api/admin/orders?limit=5" -H "Authorization: Bearer $TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for o in d['items'][:5]: print(' ', o['orderNumber'], o['payment']['method'], o['totals']['grandTotal'], o['status'])
print(' ✔', d['total'], 'orders')"

echo "=== 9. coupon min-order message in ৳ (WELCOME500 on ৳1,990 → reject) ==="
curl -s -X POST localhost:5000/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"WELCOME500","subtotal":1990}'

echo; echo "=== 10. email template uses ৳ (dry-run log) ==="
grep -o '৳[0-9,]*' logs/emails.jsonl 2>/dev/null | head -3 || echo " (no email log entries)"

kill $MONGO_PID $API_PID 2>/dev/null
echo; echo "ALL API CHECKS DONE"
