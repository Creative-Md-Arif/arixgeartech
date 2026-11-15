#!/bin/bash
# FORGED — Admin → Frontend control verification (content management end-to-end)
set -u
B=http://localhost:5000/api
ROOT=/home/z/my-project
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

echo "=== 0. RESEED ==="
(cd $ROOT/backend && MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/arixgear}" node src/seed/seed.js > /dev/null 2>&1) && ok "reseed" || { bad "reseed"; exit 1; }

TOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
AH="Authorization: Bearer $TOK"
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }

echo "=== 1. PUBLIC CONTENT API ==="
curl -s $B/settings/content | jqpy 'c=d["content"];assert c["about"]["title"].startswith("BUILT IN THE DARK") and len(c["faqs"])==5 and c["contact"]["address"].find("Dhaka")>=0' >/dev/null 2>&1 && ok "GET /settings/content (merged defaults)" || bad "content api"
C=$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/settings"); [ "$C" = "401" ] && ok "admin settings no token → 401" || bad "($C)"

echo "=== 2. ADMIN EDITS CONTENT → PUBLIC REFLECTS ==="
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"content":{"site":{"copyright":"© 2026 QA-EDITED FORGED"},"newsletter":{"note":"QA NOTE — 15% off code QA15"},"about":{"stats.0":"nope"},"contact":{"hours":"Sat–Thu 10:00–20:00 (QA)"}}}' > /dev/null
# note: "stats.0" as a literal key would be created wrongly — use proper nested object instead; fix:
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"content":{"site":{"copyright":"© 2026 QA-EDITED FORGED"},"newsletter":{"note":"QA NOTE — 15% off code QA15"},"contact":{"hours":"Sat–Thu 10:00–20:00 (QA)"}}}' > /dev/null
curl -s $B/settings/content | jqpy 'c=d["content"];assert "QA-EDITED" in c["site"]["copyright"] and "QA15" in c["newsletter"]["note"] and "QA" in c["contact"]["hours"]' >/dev/null 2>&1 && ok "admin content edit → public content reflects" || bad "content edit"
curl -s $B/settings/content | jqpy 'c=d["content"];assert c["about"]["title"].startswith("BUILT IN THE DARK") and len(c["faqs"])==5' >/dev/null 2>&1 && ok "untouched blocks keep defaults (partial save safe)" || bad "partial save broke defaults"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"content":{"site":{"copyright":"© 2026 FORGED ATHLETICS LTD. TRAIN LIKE IT MATTERS."},"newsletter":{"note":"First 500 sign-ups this month get 10% off — code FORGE10"},"contact":{"hours":"Sat–Thu 09:00–18:00 (BST)\nFriday 10:00–14:00 (BST)"}}}' > /dev/null && ok "reverted edits" || bad "revert"

echo "=== 3. BANNERS + HOME SECTIONS (public feeds for the homepage) ==="
curl -s "$B/banners?position=hero" | jqpy 'assert len(d["items"])==3 and d["items"][0]["title"]=="FORGED IN IRON"' >/dev/null 2>&1 && ok "3 hero banners" || bad "banners"
curl -s $B/home-sections | jqpy 's=d["items"];assert len(s)==8 and s[0]["key"]=="hero-slider"' >/dev/null 2>&1 && ok "8 home sections ordered" || bad "sections"
# decisive: edit banner title → public reflects
BID=$(curl -s "$B/banners?position=hero" | jqpy 'print(d["items"][0]["id"])')
curl -s -X PUT $B/admin/banners/$BID -H "$AH" -F title="QA HERO EDIT" > /dev/null
T=$(curl -s "$B/banners?position=hero" | jqpy 'print(d["items"][0]["title"])')
[ "$T" = "QA HERO EDIT" ] && ok "admin banner edit → public reflects" || bad "banner edit ($T)"
curl -s -X PUT $B/admin/banners/$BID -H "$AH" -F title="FORGED IN IRON" > /dev/null
# decisive: hide goals section → public list drops it
SID=$(curl -s $B/home-sections | jqpy 'print([x["_id"] for x in d["items"] if x["key"]=="goals"][0])')
curl -s -X PUT $B/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"active":false}' > /dev/null
N=$(curl -s $B/home-sections | jqpy 'print(len(d["items"]))')
[ "$N" = "7" ] && ok "section inactive → removed from public list" || bad "section hide ($N)"
curl -s -X PUT $B/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"active":true}' > /dev/null
# decisive: ticker items edit
curl -s -X PUT $B/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"config":{"goals":[{"title":"Muscle Gain","desc":"QA DESC","products":["dumbbell","whey"]},{"title":"Fat Loss","desc":"Conditioning tools that burn","products":["shorts","shaker"]},{"title":"Endurance","desc":"Recovery and repeat","products":["knee","tee"]}]}}' > /dev/null
curl -s $B/home-sections | jqpy 'g=[x for x in d["items"] if x["key"]=="goals"][0]["config"]["goals"];assert g[0]["desc"]=="QA DESC"' >/dev/null 2>&1 && ok "goal panels config editable" || bad "goals config"
curl -s -X PUT $B/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"config":{"goals":[{"title":"Muscle Gain","desc":"Progressive overload essentials","products":["dumbbell","whey"]},{"title":"Fat Loss","desc":"Conditioning tools that burn","products":["shorts","shaker"]},{"title":"Endurance","desc":"Recovery and repeat","products":["knee","tee"]}]}}' > /dev/null

echo "=== 4. CONTACT MESSAGES → ADMIN INBOX ==="
R=$(curl -s -X POST $B/messages -H 'Content-Type: application/json' -d '{"name":"QA Sender","email":"qa@t.com","orderNo":"FRG-X1","topic":"payment","message":"This is a QA test message for the admin inbox."}')
echo "$R" | jqpy 'assert d["ok"] is True' >/dev/null 2>&1 && ok "POST /api/messages (contact form)" || { bad "message create"; echo "$R"|head -c 150; }
C=$(curl -s -X POST $B/messages -H 'Content-Type: application/json' -d '{"name":"X","email":"bad","message":"short"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "invalid message → 400" || bad "validation ($C)"
M=$(curl -s "$B/admin/messages" -H "$AH")
echo "$M" | jqpy 'assert d["unread"]>=3 and any(m["name"]=="QA Sender" for m in d["items"])' >/dev/null 2>&1 && ok "admin inbox shows new message + unread count" || bad "inbox"
C=$(curl -s "$B/admin/messages" -o /dev/null -w '%{http_code}'); [ "$C" = "401" ] && ok "inbox no token → 401" || bad "($C)"
MID=$(echo "$M" | jqpy 'print([m["_id"] for m in d["items"] if m["name"]=="QA Sender"][0])')
curl -s -X PATCH $B/admin/messages/$MID -H "$AH" -H 'Content-Type: application/json' -d '{"read":true}' | jqpy 'assert d["item"]["read"] is True' >/dev/null 2>&1 && ok "mark read" || bad "mark read"
curl -s -X DELETE $B/admin/messages/$MID -H "$AH" | jqpy 'assert d["ok"] is True' >/dev/null 2>&1 && ok "delete message" || bad "delete"
# demo messages from seed
curl -s "$B/admin/messages" -H "$AH" | jqpy 'assert any("Rafi Ahmed"==m["name"] for m in d["items"])' >/dev/null 2>&1 && ok "seeded demo messages present" || bad "seed messages"

echo "=== 5. REGRESSION — audit suite core still green ==="
P=$(curl -s "$B/products?limit=48"); echo "$P" | jqpy 'assert len(d["items"])==8' >/dev/null 2>&1 && ok "catalog 8 products" || bad "catalog"
curl -s -X POST $B/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FORGE10","subtotal":4490}' | jqpy 'assert d["valid"] is True and d["discount"]==449' >/dev/null 2>&1 && ok "coupon validate" || bad "coupon"
curl -s $B/settings/shipping | jqpy 's=d["shipping"];assert len(s["divisions"])==8 and s["freeThreshold"]==15000' >/dev/null 2>&1 && ok "shipping settings" || bad "shipping"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
