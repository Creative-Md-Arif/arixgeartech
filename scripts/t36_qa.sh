#!/bin/bash
# Task 36 QA — in-app notification trigger chain (curl-level)
set -u
API=http://localhost:5000/api
S=/home/z/my-project/scripts

echo "== 1. login admin + demo =="
AT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
DT=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit","password":"forge2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
echo "admin=${#AT} demo=${#DT}"; echo "$AT" > $S/t36_at; echo "$DT" > $S/t36_dt

echo "== 2. demo places a bkash order (user-linked) =="
python3 -c "
import base64
png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
open('/home/z/my-project/scripts/t36_shot.png','wb').write(png)
print('png ok')"
PAY='{"customer":{"name":"T36 QA User","phone":"01712345678","email":"demo@forged.fit"},"shipping":{"address":"12 Test Street","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1,"size":"M"}],"paymentMethod":"bkash","trxId":"T36QAtest01","senderNumber":"01712345678"}'
ORD=$(curl -s -X POST $API/orders -H "Authorization: Bearer $DT" -F "payload=$PAY" -F "screenshot=@$S/t36_shot.png;type=image/png")
echo "$ORD" | python3 -c "import sys,json;o=json.load(sys.stdin)['order'];print('order',o['no'],o['status'],'user-linked:',o.get('isGuest'),'total',o['totals']['grandTotal']);open('/home/z/my-project/scripts/t36_oid','w').write(o.get('_id') or o.get('id') or '')" 2>/dev/null || echo "$ORD" | head -c 400
OID=$(cat $S/t36_oid); echo "oid=$OID"

echo "== 3. admin notifications (expect order-new) =="
curl -s $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread',d['unread']);[print('-',n['type'],'|',n['title'],'|',n['link']) for n in d['items'][:3]]"

echo "== 4. SSE live: admin stream receives push =="
(timeout 8 curl -s -N "$API/notifications/stream?token=$AT" > $S/t36_stream.txt) &
STREAMPID=$!
sleep 1.5
curl -s -X POST $API/messages -H 'Content-Type: application/json' -d '{"name":"T36 Tester","email":"t36@test.io","topic":"general","message":"In-app notification QA message for the admin bell."}' > /dev/null
sleep 1.5
curl -s -X PATCH "$API/admin/orders/$OID/verify" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{}' > /dev/null
curl -s -X PATCH "$API/admin/orders/$OID/status" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"shipped","note":"QA dispatch"}' > /dev/null
wait $STREAMPID 2>/dev/null
echo "--- stream events ---"
grep -c "^event: notification" $S/t36_stream.txt | xargs echo "notification events received:"
grep "^data:" $S/t36_stream.txt | python3 -c "import sys,json
for line in sys.stdin:
    try: d=json.loads(line[5:])
    except Exception: continue
    print('-', d.get('type'),'|',d.get('title'))"

echo "== 5. demo notifications (expect payment + order-status) =="
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread',d['unread']);[print('-',n['type'],'|',n['title'],'|',n['body'][:60]) for n in d['items']]"

echo "== 6. read marks =="
NID=$(curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
curl -s -X PATCH "$API/notifications/$NID/read" -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('single read:',json.load(sys.stdin)['item']['read'])"
curl -s -X PATCH $API/notifications/read-all -H "Authorization: Bearer $DT" > /dev/null
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('unread after read-all:',json.load(sys.stdin)['unread'])"

echo "== 7. guest order does NOT create user notification, but DOES ring admin =="
PAY2='{"customer":{"name":"T36 Guest","phone":"01812345678","shipping.address":"x"},"shipping":{"address":"12 Test Street","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod"}'
curl -s -X POST $API/orders -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "$PAY2" | head -c 120; echo

echo "== 8. cleanup: cancel+delete orders, remove message + notifications =="
OID2=$(curl -s "$API/admin/orders?search=T36" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;[print(o['_id']) for o in json.load(sys.stdin)['items']]")
for O in $OID2; do
  curl -s -X DELETE "$API/admin/orders/$O" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print('deleted:',json.load(sys.stdin).get('orderNumber'))"
done
MID=$(curl -s "$API/admin/messages?filter=all" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;[print(m['_id']) for m in json.load(sys.stdin)['items'] if 'T36' in m['name']]")
for M in $MID; do curl -s -X DELETE "$API/admin/messages/$M" -H "Authorization: Bearer $AT" > /dev/null && echo "message $M removed"; done
curl -s -X DELETE $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print('admin notifs cleared:',json.load(sys.stdin)['deleted'])"
curl -s -X DELETE $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('demo notifs cleared:',json.load(sys.stdin)['deleted'])"
echo "== stock check (belt back to 12, whey 15) =="
curl -s "http://localhost:5000/api/products/belt" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('product') or d;print('belt stock:',p.get('stock'))"
curl -s "http://localhost:5000/api/products/whey" | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('product') or d;print('whey stock:',p.get('stock'))"
