#!/bin/bash
# FORGED — Facebook Pixel admin-driven integration: API verification
set -u
B=http://localhost:5000/api
ROOT=/home/z/my-project
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

echo "=== 0. STACK ==="
curl -sf -m 3 http://localhost:5000/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }
(cd $ROOT/backend && MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/arixgear}" node src/seed/seed.js > /dev/null 2>&1) && ok "reseed (pixel back to factory off)" || bad "reseed"

echo "=== 1. PUBLIC PIXEL ENDPOINT (factory state) ==="
curl -s $B/settings/pixel | jqpy 'assert d["pixel"]=={"enabled":False,"pixelId":""}' >/dev/null 2>&1 && ok "GET /settings/pixel → off + empty" || bad "factory pixel state"
PX=$(curl -s $B/settings/pixel | jqpy 'print(d["pixel"]["pixelId"])')
[ -z "$PX" ] && ok "pixelId hidden while disabled" || bad "pixelId leaked while off"

echo "=== 2. ACCESS CONTROL ==="
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/admin/settings -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"1234567890123456"}}')
[ "$C" = "401" ] && ok "PUT pixel without token → 401" || bad "no-token PUT ($C)"
CTOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit","password":"forge2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/admin/settings -H "Authorization: Bearer $CTOK" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"1234567890123456"}}')
[ "$C" = "403" ] && ok "customer token PUT pixel → 403" || bad "customer PUT ($C)"

echo "=== 3. ADMIN LOGIN + VALIDATION ==="
TOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
AH="Authorization: Bearer $TOK"
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"abc-123"}}')
[ "$C" = "400" ] && ok "non-numeric Pixel ID → 400" || bad "bad-id accepted ($C)"
MSG=$(curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"abc-123"}}' | jqpy 'print(d.get("message","")[:40])')
echo "      ↳ $MSG"
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"123"}}')
[ "$C" = "400" ] && ok "too-short Pixel ID → 400" || bad "short id accepted ($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":""}}')
[ "$C" = "400" ] && ok "enable without Pixel ID → 400" || bad "enable-no-id accepted ($C)"

echo "=== 4. ADMIN CONFIGURES PIXEL (the core journey) ==="
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"pixelId":" 1234-5678 9012 3456 "}}' | jqpy 'p=d["setting"]["pixel"];assert p["pixelId"]=="1234567890123456" and p["enabled"]==False' >/dev/null 2>&1 && ok "ID saved + sanitized (spaces/hyphens stripped)" || bad "ID sanitize/save"
curl -s $B/settings/pixel | jqpy 'assert d["pixel"]["enabled"]==False' >/dev/null 2>&1 && ok "still dark while disabled" || bad "enabled without toggle"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true}}' | jqpy 'p=d["setting"]["pixel"];assert p["enabled"]==True and p["pixelId"]=="1234567890123456"' >/dev/null 2>&1 && ok "admin toggles ENABLE → setting on" || bad "enable toggle"
curl -s $B/settings/pixel | jqpy 'p=d["pixel"];assert p["enabled"]==True and p["pixelId"]=="1234567890123456"' >/dev/null 2>&1 && ok "public endpoint now serves ID → storefront will inject" || bad "public reflect"
C=$(curl -s -o /dev/null -w '%{http_code}' $B/settings/pixel)
[ "$C" = "200" ] && ok "public endpoint needs no auth" || bad "public pixel ($C)"

echo "=== 5. PARTIAL SAVE SAFETY ==="
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"payments":{"bkash":{"number":"01711-000000"}}}' | jqpy 'assert d["setting"]["pixel"]["enabled"]==True' >/dev/null 2>&1 && ok "unrelated settings save keeps pixel intact" || bad "partial save clobbered pixel"
curl -s $B/settings/payment | jqpy 'assert d["payments"]["bkash"]["number"]=="01711-000000"' >/dev/null 2>&1 && ok "payment save still works" || bad "payment save"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"payments":{"bkash":{"number":"01712-345678"}}}' > /dev/null && ok "payment number restored" || bad "restore"
G=$(curl -s $B/admin/settings -H "$AH")
echo "$G" | jqpy 's=d["setting"];assert s["pixel"]["pixelId"]=="1234567890123456" and s["pixel"]["enabled"]==True and "sms" in s and "content" in s' >/dev/null 2>&1 && ok "GET /admin/settings includes pixel block" || bad "admin GET pixel"

echo "=== 6. DISABLE → DARK AGAIN ==="
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":false}}' | jqpy 'p=d["setting"]["pixel"];assert p["enabled"]==False and p["pixelId"]=="1234567890123456"' >/dev/null 2>&1 && ok "disable keeps stored ID (easy re-enable)" || bad "disable"
curl -s $B/settings/pixel | jqpy 'p=d["pixel"];assert p["enabled"]==False and p["pixelId"]==""' >/dev/null 2>&1 && ok "public dark again — storefront stops injecting" || bad "disable reflect"
curl -s -X PUT $B/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"pixelId":""}}' | jqpy 'p=d["setting"]["pixel"];assert p["pixelId"]=="" and p["enabled"]==False' >/dev/null 2>&1 && ok "clearing ID resets pixel" || bad "clear ID"

echo "=== 7. REGRESSION (core surfaces untouched) ==="
curl -s "$B/products" | jqpy 'assert len(d["items"])==8' >/dev/null 2>&1 && ok "catalog: 8 products" || bad "catalog"
curl -s $B/settings/shipping | jqpy 'assert d["shipping"]["freeThreshold"]==15000 and len(d["shipping"]["divisions"])==8' >/dev/null 2>&1 && ok "shipping settings intact" || bad "shipping"
curl -s $B/settings/content | jqpy 'assert d["content"]["about"]["title"].startswith("BUILT IN THE DARK")' >/dev/null 2>&1 && ok "content settings intact" || bad "content"

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && echo "QA_PIXEL_API: ALL PASS" || echo "QA_PIXEL_API: FAILURES"
exit $FAIL
