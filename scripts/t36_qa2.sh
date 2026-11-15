#!/bin/bash
# Task 36 QA follow-up — user-side leg (payment + order-status notifications) + guest leg
set -u
API=http://localhost:5000/api
S=/home/z/my-project/scripts
AT=$(cat $S/t36_at); DT=$(cat $S/t36_dt)

echo "== 1. demo places bkash order =="
PAY='{"customer":{"name":"T36 QA User","phone":"01712345678","email":"demo@forged.fit"},"shipping":{"address":"12 Test Street","city":"Dhaka","division":"dhaka"},"items":[{"slug":"belt","qty":1,"size":"M"}],"paymentMethod":"bkash","trxId":"T36QAtest02","senderNumber":"01712345678"}'
curl -s -X POST $API/orders -H "Authorization: Bearer $DT" -F "payload=$PAY" -F "screenshot=@$S/t36_shot.png;type=image/png" | python3 -c "import sys,json;o=json.load(sys.stdin)['order'];print('placed',o['orderNumber'],o['status'])"

OID=$(curl -s "$API/admin/orders?search=T36" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['_id'])")
echo "oid=$OID"

echo "== 2. admin verifies payment + flips status to shipped =="
curl -s -X PATCH "$API/admin/orders/$OID/verify" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{}' | python3 -c "import sys,json;print('verify →',json.load(sys.stdin)['order']['payment']['status'])"
curl -s -X PATCH "$API/admin/orders/$OID/status" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"shipped","note":"On the road"}' | python3 -c "import sys,json;print('status →',json.load(sys.stdin)['order']['status'])"

echo "== 3. demo notifications (expect payment-verified + order-status=shipped) =="
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread',d['unread']);[print('-',n['type'],'|',n['title'],'|',n['body'][:70],'| link',n['link']) for n in d['items']]"

echo "== 4. no-op status save does NOT duplicate the bell =="
curl -s -X PATCH "$API/admin/orders/$OID/status" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"status":"shipped"}' > /dev/null
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('unread still',d['unread'],'items',len(d['items']))"

echo "== 5. read marks =="
NID=$(curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['id'])")
curl -s -X PATCH "$API/notifications/$NID/read" -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('single markRead:',json.load(sys.stdin)['item']['read'])"
curl -s -X PATCH $API/notifications/read-all -H "Authorization: Bearer $DT" > /dev/null
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('unread after read-all:',json.load(sys.stdin)['unread'])"

echo "== 6. guest COD order → admin bell only (no user notif) =="
curl -s -X POST $API/orders -H 'Content-Type: application/json' -d '{"customer":{"name":"T36 Guest","phone":"01812345678"},"shipping":{"address":"12 Test Street","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod"}' | python3 -c "import sys,json;o=json.load(sys.stdin)['order'];print('guest order',o['orderNumber'],'isGuest',o['isGuest'])"
curl -s $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('admin unread',d['unread']);[print('-',n['type'],'|',n['title']) for n in d['items'][:4]]"
curl -s $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('demo unread (expect 0):',d['unread'])"

echo "== 7. customer cancels → admin order-cancel bell + stock release =="
OID2=$(curl -s "$API/admin/orders?search=T36" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;[print(o['_id']) for o in json.load(sys.stdin)['items'] if o['isGuest']]" | head -1)
curl -s -X PATCH "$API/orders/$(curl -s "$API/admin/orders/$OID2" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print(json.load(sys.stdin)['order']['orderNumber'])")/cancel" -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"phone":"01812345678"}' | python3 -c "import sys,json;print('cancel:',json.load(sys.stdin)['order']['status'])"
curl -s $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print('admin top row:',json.load(sys.stdin)['items'][0]['type'],'-',json.load(open('/dev/null')) if False else '')" 2>/dev/null || true
curl -s $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;d=json.load(sys.stdin);print('admin top row:',d['items'][0]['type'],'|',d['items'][0]['title'])"

echo "== 8. cleanup everything =="
OID3=$(curl -s "$API/admin/orders?search=T36" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;[print(o['_id']) for o in json.load(sys.stdin)['items']]")
for O in $OID3; do curl -s -X DELETE "$API/admin/orders/$O" -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print('deleted:',json.load(sys.stdin).get('orderNumber'))"; done
curl -s -X DELETE $API/notifications -H "Authorization: Bearer $AT" | python3 -c "import sys,json;print('admin notifs cleared:',json.load(sys.stdin)['deleted'])"
curl -s -X DELETE $API/notifications -H "Authorization: Bearer $DT" | python3 -c "import sys,json;print('demo notifs cleared:',json.load(sys.stdin)['deleted'])"
for SL in belt whey; do curl -s "http://localhost:5000/api/products/$SL" | python3 -c "import sys,json;p=(json.load(sys.stdin).get('product') or json.load(sys.stdin));print('$SL stock:',p.get('stock'))"; done
