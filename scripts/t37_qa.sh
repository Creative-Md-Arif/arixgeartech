#!/bin/bash
# Task 37 QA — sound/push prereqs + admin→customer message flow (API level)
AT=$(cat /home/z/my-project/scripts/t36_at)
DT=$(cat /home/z/my-project/scripts/t36_dt)
API=http://localhost:5000
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS · $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL · $1"; }

# demo customer id
DEMO_ID=$(curl -s -H "Authorization: Bearer $AT" "$API/api/admin/customers" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log(j.items.find(u=>u.email==='demo@forged.fit').id)})")
[ -n "$DEMO_ID" ] && ok "demo customer resolved ($DEMO_ID)" || bad "demo customer resolve"

# 1. notification icon reachable (both SPAs)
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/assets/notif-icon.png")
[ "$code" = 200 ] && ok "notif-icon.png 200 (browser push icon)" || bad "notif-icon.png → $code"

# 2. validation guards
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/messages" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d '{"message":"no user"}')
[ "$code" = 400 ] && ok "compose without customer → 400" || bad "compose without customer → $code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/messages" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d "{\"userId\":\"$DEMO_ID\",\"message\":\"   \"}")
[ "$code" = 400 ] && ok "compose empty message → 400" || bad "compose empty message → $code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/messages" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d '{"userId":"aaaaaaaaaaaaaaaaaaaaaaaa","message":"ghost"}')
[ "$code" = 404 ] && ok "compose unknown customer → 404" || bad "compose unknown customer → $code"
code=$(curl -s -o /dev/null -w "%{http_code}" "$API/api/messages/mine")
[ "$code" = 401 ] && ok "GET /messages/mine unauth → 401" || bad "GET /messages/mine unauth → $code"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/messages" -H "Authorization: Bearer $DT" -H "Content-Type: application/json" -d "{\"userId\":\"$DEMO_ID\",\"message\":\"self\"}")
[ "$code" = 401 ] || [ "$code" = 403 ] && ok "customer cannot use admin compose → $code" || bad "customer compose → $code"

# 3. SSE stream as demo (background) then admin sends → expect live event
rm -f /tmp/t37_stream.txt
(curl -s -N --max-time 8 "$API/api/notifications/stream?token=$DT" > /tmp/t37_stream.txt) &
SPID=$!
sleep 1
SEND=$(curl -s -X POST "$API/api/admin/messages" -H "Authorization: Bearer $AT" -H "Content-Type: application/json" -d "{\"userId\":\"$DEMO_ID\",\"message\":\"Assalamu alaikum! Task 37 QA — your order FRG-SEED001 is packed and ready. Lift heavy!\"}")
echo "$SEND" | rg -q '"delivered":"live"' && ok "adminSend → delivered:live" || bad "adminSend response: $SEND"
wait $SPID 2>/dev/null
grep -q "New message from FORGED" /tmp/t37_stream.txt && ok "SSE delivered 'New message from FORGED' live" || bad "SSE missing message event"
MSG_ID=$(echo "$SEND" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).item._id))")

# 4. customer sees it: notifications + mine
curl -s -H "Authorization: Bearer $DT" "$API/api/notifications" > /tmp/t37_notif.json
node -e "const j=require('/tmp/t37_notif.json');const n=j.items.find(x=>x.title==='New message from FORGED');if(n&&n.link==='/account'&&j.unread>=1){console.log('PASS · bell row + /account link + unread='+j.unread);process.exit(0)}console.log('FAIL · bell row missing');process.exit(1)" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
MINE=$(curl -s -H "Authorization: Bearer $DT" "$API/api/messages/mine")
echo "$MINE" | rg -q "$MSG_ID" && ok "/messages/mine contains the outbound row" || bad "/messages/mine missing row: $MINE" 
echo "$MINE" | rg -q '"readByUser":false' && ok "readByUser starts false (NEW chip)" || bad "readByUser not false"

# 5. mark read-all → unread 0
curl -s -X PATCH -H "Authorization: Bearer $DT" "$API/api/messages/mine/read-all" > /dev/null
MINE2=$(curl -s -H "Authorization: Bearer $DT" "$API/api/messages/mine")
echo "$MINE2" | rg -q '"readByUser":true' && ok "read-all flips readByUser" || bad "read-all failed: $MINE2"

# 6. admin inbox shows the outbound row + customer reply path
curl -s -H "Authorization: Bearer $AT" "$API/api/admin/messages" > /tmp/t37_admin_msgs.json
node -e "const j=require('/tmp/t37_admin_msgs.json');const m=j.items.find(x=>x._id==='$MSG_ID');if(m&&m.direction==='out'&&m.topic==='reply'&&m.read===true&&m.name==='FORGED Support'){console.log('PASS · admin inbox outbound row correct');process.exit(0)}console.log('FAIL · outbound row wrong',m);process.exit(1)" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
REP=$(curl -s -X POST "$API/api/messages" -H "Content-Type: application/json" -d '{"name":"Demo Customer","email":"demo@forged.fit","topic":"reply","message":"Thanks! When does the belt restock in Dhaka?"}')
echo "$REP" | rg -q '"ok":true' && ok "customer reply via POST /messages accepted" || bad "customer reply failed: $REP"
curl -s -H "Authorization: Bearer $AT" "$API/api/notifications" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const n=j.items.find(x=>x.type==='message-new'&&/reply/i.test(x.title));if(n){console.log('PASS · admin bell got reply ping: '+n.title);process.exit(0)}console.log('FAIL · no admin bell for reply');process.exit(1)})" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

echo "──"
echo "PASS=$PASS FAIL=$FAIL"
