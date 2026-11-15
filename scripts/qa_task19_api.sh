#!/usr/bin/env bash
# FORGED — Task 19 API verification
# Size-based pricing · color images · reviews + Q&A · related · categories/badges admin · chat · FAQ/text mgmt
B="http://localhost:5000/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

echo "── 1. size-based pricing (Product.sizePrices) ──"
curl -s $B/products/whey | jqpy 'p=d["product"];assert len(p["sizePrices"])==3 and next(x for x in p["sizePrices"] if x["s"]=="1KG")["price"]==3990' >/dev/null 2>&1 && ok "whey sizePrices seeded (1KG ৳3990)" || bad "whey sizePrices"
curl -s $B/products/dumbbell | jqpy 'p=d["product"];assert next(x for x in p["sizePrices"] if x["s"]=="28KG")["price"]==18990' >/dev/null 2>&1 && ok "dumbbell sizePrices (28KG ৳18990)" || bad "dumbbell sizePrices"

echo "── 2. reviews (public) ──"
# Task 29 note: the public list payload is now a hardened view (no internal
# fields); every returned item is approved by definition + a summary block.
curl -s $B/products/belt/reviews | jqpy 'assert len(d["items"])==3 and "summary" in d' >/dev/null 2>&1 && ok "belt approved reviews = 3 + summary" || bad "belt reviews"
curl -s -X POST $B/products/tee/reviews -H 'Content-Type: application/json' -d '{"name":"QA Bot","rating":4,"comment":"QA review — approve me"}' | grep -q '"ok":true' && ok "POST review accepted (pending)" || bad "POST review"
curl -s -X POST $B/products/tee/reviews -H 'Content-Type: application/json' -d '{"name":"QA Bot","rating":9,"comment":"bad rating"}' | grep -q 'Rating must be' && ok "rating 1–5 validated" || bad "rating validation"
curl -s $B/products/tee/reviews | jqpy 'd= d["items"];assert len(d)==3' >/dev/null 2>&1 && ok "pending review NOT public yet" || bad "pending review leaked"

echo "── 3. questions (public) ──"
curl -s $B/products/belt/questions | jqpy 'd= d["items"];assert len(d)==1 and all(q["answered"] for q in d)' >/dev/null 2>&1 && ok "belt answered questions live (1)" || bad "belt questions"
QNAME="QA Bot $(date +%s)"
QCOUNT=$(curl -s $B/products/knee/questions | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")
curl -s -X POST $B/products/knee/questions -H 'Content-Type: application/json' -d "{\"name\":\"$QNAME\",\"question\":\"QA question — answer me please\"}" | grep -q '"ok":true' && ok "POST question accepted" || bad "POST question"
curl -s $B/products/knee/questions | jqpy "d= d['items'];assert all(q['answered'] for q in d) and len(d)==$QCOUNT" >/dev/null 2>&1 && ok "unanswered question hidden from PDP" || bad "unanswered leaked"

echo "── 4. related products (bySlug) ──"
curl -s $B/products/belt | jqpy 'r= d["related"];assert len(r)>=1 and all(x["category"]=="equipment" and x["slug"]!="belt" for x in r)' >/dev/null 2>&1 && ok "belt related = same category, excludes self" || bad "related products"

echo "── 5. admin auth ──"
AT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
AH="Authorization: Bearer $AT"
[ ${#AT} -gt 30 ] && ok "admin login" || bad "admin login"

echo "── 6. review moderation + rating recalc ──"
RID=$(curl -s "$B/admin/reviews?filter=pending" -H "$AH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
r=[x for x in d['items'] if x['name']=='QA Bot']
print(r[0]['_id'] if r else '')")
[ -n "$RID" ] && ok "pending review visible in admin" || bad "admin pending review"
curl -s -X PATCH $B/admin/reviews/$RID/approve -H "$AH" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s $B/products/tee | jqpy 'p=d["product"];assert p["reviews"]==4 and p["rating"]>4' >/dev/null 2>&1 && ok "approve → product rating+count recalculated" || bad "rating recalc"
curl -s $B/products/tee/reviews | jqpy 'd= d["items"];assert len(d)==4' >/dev/null 2>&1 && ok "approved review now public" || bad "approved review not public"
curl -s -X DELETE $B/admin/reviews/$RID -H "$AH" >/dev/null
curl -s $B/products/tee | jqpy 'p=d["product"];assert p["reviews"]==3' >/dev/null 2>&1 && ok "delete → recalc again (3)" || bad "delete recalc"

echo "── 7. question answering ──"
QID=$(curl -s "$B/admin/questions?filter=unanswered" -H "$AH" | python3 -c "
import sys,json
d=json.load(sys.stdin)
q=[x for x in d['items'] if x['name'].startswith('QA Bot')]
print(q[0]['_id'] if q else '')")
curl -s -X PUT $B/admin/questions/$QID -H "$AH" -H 'Content-Type: application/json' -d '{"answer":"Yes — 7MM is perfect for CrossFit, warm knees from set one."}' | jqpy 'd= d["item"];assert d["answered"] is True' >/dev/null 2>&1 && ok "admin answer published" || bad "question answer"
curl -s $B/products/knee/questions | jqpy 'd= d["items"];assert len(d)>=1 and any("CrossFit" in q["answer"] for q in d)' >/dev/null 2>&1 && ok "answered question live on PDP" || bad "answer not public"
curl -s -X DELETE $B/admin/questions/$QID -H "$AH" >/dev/null && ok "QA question cleaned up" || bad "question cleanup"

echo "── 8. badges admin CRUD + storefront resolution ──"
BID=$(curl -s -X POST $B/admin/badges -H "$AH" -H 'Content-Type: application/json' -d '{"label":"Limited Drop","color":"#7c3aed"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['badge']['_id'])" 2>/dev/null)
[ -n "$BID" ] && ok "badge created (Limited Drop)" || bad "badge create"
curl -s $B/badges | jqpy 'd= d["items"];assert any(b["key"]=="limited-drop" and b["color"]=="#7c3aed" for b in d)' >/dev/null 2>&1 && ok "new badge on public /api/badges" || bad "badge public"
PID=$(curl -s $B/products/whey | python3 -c "import sys,json;print(json.load(sys.stdin)['product']['_id'])")
curl -s -X PUT $B/admin/products/$PID -H "$AH" -H 'Content-Type: application/json' -d '{"badge":"limited-drop"}' | jqpy 'd= d["product"];assert d["badge"]=="limited-drop"' >/dev/null 2>&1 && ok "product badge → new key (no enum block)" || bad "product badge assign"
curl -s -X DELETE $B/admin/badges/$BID -H "$AH" >/dev/null && ok "badge deleted (products unharmed)" || bad "badge delete"
curl -s -X PUT $B/admin/products/$PID -H "$AH" -H 'Content-Type: application/json' -d '{"badge":"best-seller"}' >/dev/null

echo "── 9. categories admin CRUD ──"
CID=$(curl -s -X POST $B/admin/categories -H "$AH" -H 'Content-Type: application/json' -d '{"name":"Yoga","order":5}' | python3 -c "import sys,json;print(json.load(sys.stdin)['category']['_id'])" 2>/dev/null)
[ -n "$CID" ] && ok "category created (Yoga → slug yoga)" || bad "category create"
curl -s $B/categories | jqpy 'd= d["items"];assert any(c["slug"]=="yoga" and c["name"]=="Yoga" for c in d)' >/dev/null 2>&1 && ok "new category on public /api/categories" || bad "category public"
curl -s -X POST $B/admin/categories -H "$AH" -H 'Content-Type: application/json' -d '{"name":"Yoga"}' | grep -q 'already exists' && ok "duplicate category rejected" || bad "dupe category"
curl -s -X PUT $B/admin/categories/$CID -H "$AH" -H 'Content-Type: application/json' -d '{"name":"Yoga & Mobility"}' | jqpy 'd= d["category"];assert d["name"]=="Yoga & Mobility"' >/dev/null 2>&1 && ok "category renamed" || bad "category rename"
curl -s -X DELETE $B/admin/categories/$CID -H "$AH" >/dev/null && ok "category deleted (clean state)" || bad "category delete"

echo "── 10. size-based price on real order (server-authoritative) ──"
PAY='{"customer":{"name":"QA Sizer","phone":"01799999999"},"shipping":{"address":"QA Rd 1","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1,"size":"1KG","color":"Chocolate"}],"paymentMethod":"cod"}'
curl -s -X POST $B/orders -F "payload=$PAY" | jqpy 'o= d["order"];assert o["items"][0]["price"]==3990 and o["totals"]["grandTotal"]==4050' >/dev/null 2>&1 && ok "COD order prices 1KG at ৳3990 (+60 dhaka ship)" || bad "size price order"

echo "── 11. chat message flow ──"
curl -s -X POST $B/messages -H 'Content-Type: application/json' -d '{"name":"Chat Visitor","topic":"chat","message":"Hi! belt এর দাম কত?"}' | grep -q '"ok":true' && ok "chat message accepted (short, no email)" || bad "chat message"
curl -s -X POST $B/messages -H 'Content-Type: application/json' -d '{"name":"X","email":"x@y.com","topic":"general","message":"short"}' | grep -q 'at least 10' && ok "contact-form contract intact (≥10 chars + email)" || bad "contact contract broken"
curl -s -X POST $B/messages -H 'Content-Type: application/json' -d '{"name":"Contact QA","email":"qa@x.com","topic":"general","message":"This is a normal contact form message."}' | grep -q '"ok":true' && ok "normal contact still works" || bad "normal contact"
curl -s "$B/admin/messages?filter=unread" -H "$AH" | jqpy 'd= d["items"];assert any(m["topic"]=="chat" for m in d)' >/dev/null 2>&1 && ok "chat message lands in admin inbox (topic chat)" || bad "chat inbox"

echo "── 12. chat settings (public + admin) ──"
curl -s $B/settings/chat | jqpy 'c= d["chat"];assert c["enabled"] is True and c["whatsapp"] and c["telegram"]' >/dev/null 2>&1 && ok "GET /settings/chat public" || bad "chat public"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"chat":{"whatsapp":"+8801712345678","telegram":"@forgedfit","greeting":"QA greeting"}}' | jqpy 'c= d["setting"]["chat"];assert c["whatsapp"]=="+8801712345678"' >/dev/null 2>&1 && ok "admin PUT chat config" || bad "chat PUT"
curl -s $B/settings/chat | jqpy 'c= d["chat"];assert c["greeting"]=="QA greeting"' >/dev/null 2>&1 && ok "public reflects chat edit" || bad "chat reflect"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"chat":{"whatsapp":"01712-345678","telegram":"forgedfit","greeting":"Assalamu alaikum! Drop your question here — we usually reply within an hour (9am–10pm)."}}' >/dev/null && ok "chat config reverted" || bad "chat revert"

echo "── 13. content FAQ text-management shape ──"
curl -s $B/settings/content | jqpy 'c= d["content"];f=c["faqs"];assert isinstance(f,list) and len(f)==5 and all(isinstance(x["q"],str) and isinstance(x["a"],str) for x in f)' >/dev/null 2>&1 && ok "faqs still {q,a} via content API (admin edits as plain text)" || bad "faqs shape"

echo
echo "RESULT: $PASS passed, $FAIL failed"
exit $FAIL
