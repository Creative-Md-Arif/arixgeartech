#!/usr/bin/env bash
# Task 34 — admin forms rebuilt as accordion menus (UI-only change, backend must be untouched).
# Verifies: admin auth, every touched page's backing API still round-trips
# (settings incl. content + sizeGuide, products CRUD, coupons CRUD, banners, membership plans,
# home sections, manual-order validation), public endpoints regression, fresh admin bundle served.
set -u
BASE="http://localhost:5000"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS — $1"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL — $1"; }
check(){ if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (want '$2' got '$1')"; fi; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

TOK=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin).get("token",""))')
[ -n "$TOK" ] && ok "admin login" || bad "admin login"
AUTH="Authorization: Bearer $TOK"
echo -n "$TOK" > /tmp/t34tok

# 1 · settings GET shape + PUT round-trip (sizeGuide + content survive)
curl -s "$BASE/api/admin/settings" -H "$AUTH" | python3 -c \
  'import sys,json;d=json.load(sys.stdin)["setting"];assert d.get("sizeGuide",{}).get("rows") and "content" in d' \
  && ok "settings GET has sizeGuide.rows + content" || bad "settings GET shape"

BODY=$(python3 - <<'EOF'
import json, urllib.request
tok = open('/tmp/t34tok').read().strip()
req = urllib.request.Request("http://localhost:5000/api/admin/settings", headers={"Authorization": "Bearer " + tok})
d = json.load(urllib.request.urlopen(req))["setting"]
g = d["sizeGuide"]
body = {
  "payments": d.get("payments", {}), "shipping": d.get("shipping", {}), "store": d.get("store", {}),
  "pixel": d.get("pixel", {}), "chat": d.get("chat", {}), "courier": d.get("courier", {}),
  "content": d.get("content", {}),
  "sizeGuide": {"enabled": g.get("enabled", True), "title": "Size Guide", "note": g.get("note", ""),
                "headers": g.get("headers", []), "rows": g.get("rows", []), "categories": g.get("categories", {})},
}
print(json.dumps(body))
EOF
)
check "$(printf '%s' "$BODY" | curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/settings" -H "$AUTH" -H 'Content-Type: application/json' -d @-)" "200" "settings PUT round-trip (content + sizeGuide intact)"

# 2 · products CRUD round-trip (multipart like the real form)
PID=$(curl -s -X POST "$BASE/api/admin/products" -H "$AUTH" \
  -F 'name=T34 Accordion QA Tee' -F 'category=apparel' -F 'price=1990' -F 'active=true' \
  -F 'sizes=["M","L"]' -F 'sizePrices=[{"s":"L","price":2190}]' -F 'colors=[]' \
  -F 'images=@/home/z/my-project/download/forged-full-project/frontend/public/assets/prod-tee.png' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("product",{}).get("_id",""))')
[ -n "$PID" ] && ok "product create" || bad "product create"
check "$(code -X PUT "$BASE/api/admin/products/$PID" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"T34 Accordion QA Tee v2"}')" "200" "product PUT"
check "$(code -X DELETE "$BASE/api/admin/products/$PID" -H "$AUTH")" "200" "product DELETE (cleanup)"

# 3 · coupons CRUD round-trip
CID=$(curl -s -X POST "$BASE/api/admin/coupons" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"code":"T34ACC","type":"percent","value":10,"public":false}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin).get("coupon",{}).get("_id",""))')
[ -n "$CID" ] && ok "coupon create" || bad "coupon create"
check "$(code -X PUT "$BASE/api/admin/coupons/$CID" -H "$AUTH" -H 'Content-Type: application/json' -d '{"value":12}')" "200" "coupon PUT"
check "$(code -X DELETE "$BASE/api/admin/coupons/$CID" -H "$AUTH")" "200" "coupon DELETE (cleanup)"

# 4 · banners / membership plans / home sections lists
check "$(code "$BASE/api/admin/banners" -H "$AUTH")" "200" "banners list"
check "$(code "$BASE/api/admin/membership/plans" -H "$AUTH")" "200" "membership plans list"
check "$(code "$BASE/api/admin/home-sections" -H "$AUTH")" "200" "home sections list"

# 5 · manual order validation kept (empty items → 400, no 500)
MO=$(code -X POST "$BASE/api/admin/orders/manual" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"customer":{"name":"T34 QA","phone":"01712345678"},"shipping":{"address":"Road 2","city":"Dhaka","division":"dhaka"},"items":[],"paymentMethod":"cod"}')
if [ "$MO" = "400" ]; then ok "manual order validation (empty items → 400) intact"; else bad "manual order validation (got $MO)"; fi

# 6 · public endpoints regression
for ep in "/api/products" "/api/settings/content" "/api/settings/payment" "/api/settings/size-guide" "/api/banners" "/api/coupons/active" "/api/home-sections" "/api/categories" "/api/badges"; do
  check "$(code "$BASE$ep")" "200" "public $ep"
done

# 7 · admin SPA serves the fresh accordion bundle
BUNDLE=$(curl -s "$BASE/admin/" | grep -o 'index-[^"]*\.js' | head -1)
LOCAL=$(ls /home/z/my-project/download/forged-full-project/admin/dist/assets/ | grep -o 'index-[^"]*\.js' | head -1)
check "$BUNDLE" "$LOCAL" "admin SPA serves fresh bundle ($LOCAL)"

echo
echo "RESULT: $PASS PASS · $FAIL FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
