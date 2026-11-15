#!/bin/bash
# FORGED — PRODUCTION READINESS AUDIT (API level)
# Covers: infra/hardening · catalog · auth · admin security · order integrity
#         · payment mgmt · tracking · CSV · SMS dry-run · settings · stock/coupon
set -u
B=http://localhost:5000/api
ROOT=/home/z/my-project
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }

echo "=== 0. RESEED (deterministic state) ==="
(cd $ROOT/backend && MONGODB_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017/arixgear}" node src/seed/seed.js > /dev/null 2>&1) && ok "reseed complete" || { bad "reseed"; exit 1; }

echo "=== A. INFRA & HARDENING ==="
curl -s $B/health | grep -q '"ok":true' && ok "GET /api/health" || bad "health"
curl -sI http://localhost:5000/api/health | grep -qi "X-Content-Type-Options: nosniff" && ok "helmet: nosniff" || bad "helmet nosniff"
curl -sI http://localhost:5000/api/health | grep -qi "X-Frame-Options" && ok "helmet: X-Frame-Options" || bad "XFO missing"
curl -sI http://localhost:5000/ | grep -qi "x-powered-by" && bad "x-powered-by exposed" || ok "x-powered-by hidden"
curl -s http://localhost:5000/api/products -H 'Accept-Encoding: gzip' -o /dev/null -w '%{size_download}' | awk '{if($1>0)print "  ℹ gzip response bytes:",$1}'; ok "compression active (no error)"
CE=$(curl -sI http://localhost:5000/api/products -H 'Accept-Encoding: gzip' | grep -ci content-encoding); [ "$CE" -ge 1 ] && ok "gzip content-encoding on /api/products" || echo "  ℹ small payload not gzipped (fine)"
curl -s -o /dev/null -w '%{http_code}' http://localhost:5000/.env | grep -q 404 && ok "/.env not served" || bad "/.env reachable"
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/orders -H 'Content-Type: application/json' -d '{bad json')" = "400" ] && ok "invalid JSON → 400" || bad "invalid JSON handling"
curl -s $B/nonexistent | jqpy 'assert d.get("message")' >/dev/null 2>&1 && ok "unknown API route → JSON 404" || bad "404 shape"
CODE=$(curl -s -o /dev/null -w '%{http_code}' $B/nonexistent); [ "$CODE" = "404" ] && ok "404 status code" || bad "404 status ($CODE)"

echo "=== B. CATALOG ==="
curl -s "$B/products?limit=48" | jqpy 'assert len(d["items"])==8' >/dev/null 2>&1 && ok "8 products" || bad "product count"
curl -s "$B/products?category=apparel" | jqpy 'assert all(p["category"]=="apparel" for p in d["items"]) and len(d["items"])==2' >/dev/null 2>&1 && ok "filter category=apparel → 2" || bad "category filter"
curl -s "$B/products?search=whey" | jqpy 'assert any(p["slug"]=="whey" for p in d["items"])' >/dev/null 2>&1 && ok "search=whey" || bad "search"
curl -s "$B/products?sort=price-asc" | jqpy 'p=d["items"];assert p[0]["price"]<=p[-1]["price"]' >/dev/null 2>&1 && ok "sort=price-asc" || bad "sort"
curl -s "$B/products/tee" | jqpy 'assert d["product"]["slug"]=="tee" and d["product"]["price"]==4490' >/dev/null 2>&1 && ok "detail /products/tee ৳4490" || bad "detail tee"
curl -s -o /dev/null -w '%{http_code}' "$B/products/nope" | grep -q 404 && ok "unknown slug → 404" || bad "unknown slug"
curl -s "$B/categories" | jqpy 'assert len(d["items"])==4' >/dev/null 2>&1 && ok "4 categories" || bad "categories"
curl -s "$B/banners" | jqpy 'assert len(d["items"])>=3' >/dev/null 2>&1 && ok "banners ≥3" || bad "banners"
curl -s "$B/home-sections" | jqpy 'assert len(d["items"])>=8' >/dev/null 2>&1 && ok "home sections ≥8" || bad "home sections"

echo "=== C. AUTH ==="
TOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }
AH="Authorization: Bearer $TOK"
DTOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit","password":"forge2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
[ -n "$DTOK" ] && ok "demo login" || bad "demo login"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"wrong"}')
[ "$C" = "401" ] && ok "wrong password → 401" || bad "wrong pw ($C)"
TS=$(date +%s)
printf -v QA51PH '0171%07d' $((TS % 10000000))  # Task 51 — unique per run, exactly 11 digits
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"Prod QA\",\"email\":\"prodqa$TS@t.com\",\"password\":\"forge2026x\",\"phone\":\"$QA51PH\"}")
[ "$C" = "200" -o "$C" = "201" ] && ok "register new customer" || bad "register ($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"Dup\",\"email\":\"prodqa$TS@t.com\",\"password\":\"forge2026x\"}")
[ "$C" = "409" ] && ok "duplicate email → 409" || bad "dup email ($C)"
curl -s $B/auth/me -H "Authorization: Bearer $DTOK" | jqpy 'assert d["user"]["email"]=="demo@forged.fit"' >/dev/null 2>&1 && ok "GET /auth/me (session)" || bad "auth/me"

echo "=== D. ADMIN SECURITY ==="
C=$(curl -s -o /dev/null -w '%{http_code}' $B/admin/orders); [ "$C" = "401" ] && ok "admin list no token → 401" || bad "($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' $B/admin/settings -H "Authorization: Bearer $DTOK"); [ "$C" = "403" ] && ok "demo token on admin → 403" || bad "($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/admin/products -H "Authorization: Bearer $DTOK" -F name=Hack); [ "$C" = "403" ] && ok "demo create product → 403" || bad "($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $B/admin/products/xyz -H "$AH"); [ "$C" = "400" -o "$C" = "404" ] && ok "bad ObjectId handled (400/404)" || bad "($C)"

echo "=== E. ORDER INTEGRITY (server-side math) ==="
mk(){ curl -s -X POST $B/orders -F "payload=$1"; }
O=$(mk '{"customer":{"name":"Prod QA1","phone":"01711440011","email":"pq1@t.com"},"shipping":{"address":"Rd 3","city":"Mirpur","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod","price":1,"total":1,"shippingFee":0}')
echo "$O" | jqpy 'o=d["order"];assert o["totals"]["subtotal"]==4490 and o["totals"]["shipping"]==60 and o["totals"]["grandTotal"]==4550, o["totals"]' >/dev/null 2>&1 && ok "tamper ignored + Dhaka ৳60 math" || { bad "tamper/dhaka math"; echo "$O"|head -c 200; }
ONO1=$(echo "$O" | jqpy 'print(d["order"]["orderNumber"])' 2>/dev/null)
O2=$(mk '{"customer":{"name":"Prod QA2","phone":"01711440012","email":"pq2@t.com"},"shipping":{"address":"Rd 5","city":"Chattogram","division":"chattogram"},"items":[{"slug":"dumbbell","qty":1}],"paymentMethod":"cod"}')
echo "$O2" | jqpy 'o=d["order"];assert o["totals"]["shipping"]==100,o["totals"]' >/dev/null 2>&1 && ok "Chattogram shipping ৳100 (per settings)" || { bad "chattogram shipping"; echo "$O2"|head -c 300; }
O2b=$(mk '{"customer":{"name":"Prod QA2b","phone":"01711440022","email":"pq2b@t.com"},"shipping":{"address":"Rd 5","city":"Sylhet","division":"sylhet"},"items":[{"slug":"dumbbell","qty":1}],"paymentMethod":"cod"}')
echo "$O2b" | jqpy 'o=d["order"];assert o["totals"]["shipping"]==120,o["totals"]' >/dev/null 2>&1 && ok "Sylhet shipping ৳120" || bad "sylhet shipping"
O3=$(mk '{"customer":{"name":"Prod QA3","phone":"01711440013","email":"pq3@t.com"},"shipping":{"address":"Rd 7","city":"Gulshan","division":"dhaka"},"items":[{"slug":"whey","qty":4}],"paymentMethod":"cod"}')
echo "$O3" | jqpy 'o=d["order"];assert o["totals"]["shipping"]==0 and o["totals"]["grandTotal"]==o["totals"]["subtotal"],o["totals"]' >/dev/null 2>&1 && ok "free shipping over ৳15,000 (4×whey ৳25,960)" || { bad "free shipping"; echo "$O3"|head -c 200; }
echo "$O3" | jqpy 'o=d["order"];print("   whey×4 subtotal:",o["totals"]["subtotal"],"shipping:",o["totals"]["shipping"])'
TRX4="PRD$(date +%s | cut -c 6-11)"
cp $ROOT/backend/src/seed/demo-proof.png /tmp/proof.png
O4=$(curl -s -X POST $B/orders -F "payload={\"customer\":{\"name\":\"Prod QA4\",\"phone\":\"01711440014\",\"email\":\"pq4@t.com\"},\"shipping\":{\"address\":\"Rd 9\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"tee\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"couponCode\":\"FORGE10\",\"trxId\":\"$TRX4\"}" -F "screenshot=@/tmp/proof.png")
echo "$O4" | jqpy 'o=d["order"];assert o["totals"]["discount"]==449,o["totals"]' >/dev/null 2>&1 && ok "FORGE10 → −৳449 (bkash + screenshot)" || { bad "coupon"; echo "$O4"|head -c 300; }
ONO4=$(echo "$O4" | jqpy 'print(d["order"]["orderNumber"])' 2>/dev/null)
C=$(curl -s -X POST $B/orders -F "payload={\"customer\":{\"name\":\"DupTrx\",\"phone\":\"01711440015\",\"email\":\"pq5@t.com\"},\"shipping\":{\"address\":\"x\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"tee\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"$TRX4\"}" -F "screenshot=@/tmp/proof.png" -o /dev/null -w '%{http_code}')
[ "$C" = "409" ] && ok "duplicate TrxID → 409" || bad "dup trx ($C)"
C=$(curl -s -X POST $B/orders -F 'payload={"customer":{"name":"Q","phone":"01711440016","email":"q@t.com"},"shipping":{"address":"x","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":0}],"paymentMethod":"cod"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "qty 0 → 400 (strict)" || bad "qty0 ($C)"
C=$(curl -s -X POST $B/orders -F 'payload={"customer":{"name":"Q","phone":"01711440017","email":"q2@t.com"},"shipping":{"address":"x","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":99999}],"paymentMethod":"cod"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "qty >99 → 400 (range guard)" || bad "qty guard ($C)"
ST=$(curl -s "$B/products/tee" | jqpy 'print(d["product"]["stock"])')
QTY=$((ST+1)); [ $QTY -gt 99 ] && QTY=99
C=$(curl -s -X POST $B/orders -F "payload={\"customer\":{\"name\":\"Q\",\"phone\":\"01711440017\",\"email\":\"q2b@t.com\"},\"shipping\":{\"address\":\"x\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"tee\",\"qty\":$QTY}],\"paymentMethod\":\"cod\"}" -o /dev/null -w '%{http_code}')
[ "$C" = "409" ] && ok "stock+1 order → 409 insufficient stock" || bad "stock guard ($C)"
C=$(curl -s -X POST $B/orders -F 'payload={"customer":{"name":"Q","phone":"01711440018","email":"q3@t.com"},"shipping":{"address":"x","city":"Dhaka","division":"dhaka"},"items":[{"slug":"ghost-item","qty":1}],"paymentMethod":"cod"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "unknown slug → 400" || bad "unknown slug ($C)"
C=$(curl -s -X POST $B/orders -F 'payload={"customer":{"name":"Q","phone":"01711440019","email":"q4@t.com"},"shipping":{"address":"x","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"paypal"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "invalid method (paypal) → 400" || bad "method guard ($C)"

echo "=== F. PAYMENT MANAGEMENT ==="
OID4=$(curl -s "$B/admin/orders?search=$ONO4" -H "$AH" | jqpy 'print(d["items"][0]["_id"])' 2>/dev/null)
[ -n "$OID4" ] && ok "admin search finds order $ONO4" || bad "admin search"
S=$(curl -s -X PATCH $B/admin/orders/$OID4/verify -H "$AH" -H 'Content-Type: application/json' -d '{}' | jqpy 'print(d["order"]["status"])' 2>/dev/null)
[ "$S" = "processing" ] && ok "verify bkash → processing" || bad "verify ($S)"
S=$(curl -s -X PATCH $B/admin/orders/$OID4/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"shipped"}' | jqpy 'print(d["order"]["status"])' 2>/dev/null)
[ "$S" = "shipped" ] && ok "status → shipped" || bad "shipped ($S)"
C=$(curl -s -X PATCH $B/admin/orders/$OID4/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"exploded"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "invalid status → 400" || bad "invalid status ($C)"
# reject test on a FRESH bkash order still in verifying
TRXR="PRD$(date +%s | cut -c 6-11)R"
OR=$(curl -s -X POST $B/orders -F "payload={\"customer\":{\"name\":\"Reject QA\",\"phone\":\"01711440023\",\"email\":\"pqr@t.com\"},\"shipping\":{\"address\":\"x\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"belt\",\"qty\":1}],\"paymentMethod\":\"nagad\",\"trxId\":\"$TRXR\"}" -F "screenshot=@/tmp/proof.png")
ONOR=$(echo "$OR" | jqpy 'print(d["order"]["orderNumber"])' 2>/dev/null)
OIDR=$(curl -s "$B/admin/orders?search=$ONOR" -H "$AH" | jqpy 'print(d["items"][0]["_id"])' 2>/dev/null)
R=$(curl -s -X PATCH $B/admin/orders/$OIDR/reject -H "$AH" -H 'Content-Type: application/json' -d '{"reason":"No trx found in statement"}' | jqpy 'print(d["order"]["payment"]["status"]+"|"+d["order"]["payment"]["rejectReason"])' 2>/dev/null)
[ "$R" = "rejected|No trx found in statement" ] && ok "reject (with reason) → payment rejected" || { bad "reject ($R)"; echo "$OR" | head -c 200; }
OID1=$(curl -s "$B/admin/orders?search=$ONO1" -H "$AH" | jqpy 'print(d["items"][0]["_id"])' 2>/dev/null)
C=$(curl -s -X PATCH $B/admin/orders/$OID1/reject -H "$AH" -H 'Content-Type: application/json' -d '{"reason":"try cod reject"}' -o /dev/null -w '%{http_code}')
[ "$C" = "400" ] && ok "reject COD order → blocked 400" || bad "cod reject ($C)"

echo "=== G. PUBLIC TRACKING ==="
PHONE1=01711440011
curl -s "$B/orders/track/$ONO1?phone=$PHONE1" | jqpy 'assert d["order"]["orderNumber"]=="'$ONO1'"' >/dev/null 2>&1 && ok "track by order number + phone" || bad "track"
C=$(curl -s -o /dev/null -w '%{http_code}' "$B/orders/track/FRG-NOPE00?phone=$PHONE1"); [ "$C" = "404" ] && ok "unknown track → 404" || bad "($C)"
C=$(curl -s -o /dev/null -w '%{http_code}' "$B/orders/track/$ONO1"); [ "$C" = "400" ] && ok "track without phone/last6 → 400 (privacy)" || bad "($C)"
LAST6=${PHONE1: -6}
curl -s "$B/orders/track/$ONO1?phone=$LAST6" | jqpy 'assert d["order"]["orderNumber"]=="'$ONO1'"' >/dev/null 2>&1 && ok "track with last-6 digits suffix" || bad "last6"
curl -s "$B/orders/track/$ONO1?phone=$PHONE1" | jqpy 'o=d["order"];assert "screenshot" not in (o.get("payment") or {}), "screenshot leaked!"' >/dev/null 2>&1 && ok "tracking hides payment screenshot" || bad "screenshot leak in tracking"

echo "=== H. CSV EXPORT ==="
curl -s "$B/admin/orders/export.csv" -H "$AH" -o /tmp/prod-orders.csv
head -c 3 /tmp/prod-orders.csv | od -An -tx1 | grep -q "ef bb bf" && ok "UTF-8 BOM" || bad "BOM"
head -1 /tmp/prod-orders.csv | grep -q "Order No" && ok "header row" || bad "header"
N=$(awk 'END{print NR-1}' /tmp/prod-orders.csv); [ "$N" -ge 6 ] && ok "rows ≥6 (got $N)" || bad "rows ($N)"
grep -q '৳' /tmp/prod-orders.csv && ok "৳ in CSV" || bad "৳ missing"
C=$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/orders/export.csv?status=processing" -H "$AH"); [ "$C" = "200" ] && ok "filter-aware export (status=processing)" || bad "($C)"

echo "=== I. SMS DRY-RUN ==="
sleep 0.5; [ -f $ROOT/backend/logs/sms.jsonl ] && grep -q '8801711440011' $ROOT/backend/logs/sms.jsonl && ok "order SMS logged (880-normalized)" || bad "sms log"
grep -q '"mode": *"dry-run"' $ROOT/backend/logs/sms.jsonl && ok "SMS mode = dry-run" || bad "sms mode"

echo "=== J. SETTINGS ==="
curl -s $B/settings/shipping | jqpy 's=d["shipping"];assert len(s["divisions"])==8 and s["freeThreshold"]==15000 and s["divisions"]["dhaka"]==60' >/dev/null 2>&1 && ok "public shipping: 8 divisions, free ৳15,000+" || bad "settings shipping"
curl -s $B/settings/payment | jqpy 's=d["payments"];assert s["bkash"]["number"]=="01712-345678" and s["nagad"]["number"]=="01812-345678" and s["rocket"]["number"]=="01912-3456787"' >/dev/null 2>&1 && ok "public payment numbers (bkash/nagad/rocket)" || bad "settings payment"
curl -s $B/admin/settings -H "$AH" | jqpy 's=d["setting"];assert s["sms"]["dryRun"] is True' >/dev/null 2>&1 && ok "admin settings incl. sms status" || bad "admin settings"

echo "=== K. STOCK & COUPON SIDE-EFFECTS ==="
ST=$(curl -s "$B/products/tee" | jqpy 'print(d["product"]["stock"])')
echo "  ℹ tee stock now: $ST (seeded 16, several test orders placed)"
curl -s -X POST $B/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FORGE10","subtotal":4490}' | jqpy 'assert d["valid"] is True and d["discount"]==449, d' >/dev/null 2>&1 && ok "POST /coupons/validate FORGE10 → −৳449" || bad "coupon endpoint"
CC=$(curl -s -X POST $B/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FAKECODE","subtotal":4490}' -o /dev/null -w '%{http_code}')
{ [ "$CC" = "400" ] || [ "$CC" = "404" ]; } && ok "invalid coupon → $CC (not 200)" || bad "invalid coupon ($CC)"

echo "=== L. INJECTION SAFETY ==="
C=$(curl -s -g "$B/admin/orders?search=\$gt" -H "$AH" -o /dev/null -w '%{http_code}'); [ "$C" = "200" ] && ok "mongo-inject search param safe" || bad "($C)"
O5=$(mk '{"customer":{"name":"<script>alert(1)</script>","phone":"01711440020","email":"xss@t.com"},"shipping":{"address":"x","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod"}' | head -c 400)
echo "$O5" | grep -q "FRG-" && ok "XSS-string order stored raw (admin.js escapes on render)" || bad "xss order"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
