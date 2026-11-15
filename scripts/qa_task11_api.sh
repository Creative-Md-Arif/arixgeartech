#!/bin/bash
# FORGED — Task 11 API QA: catalog render fields · CSV export · SMS dry-run hooks
set -u
B=http://localhost:5000/api
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }

TOK=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
[ -n "$TOK" ] && ok "admin login" || { bad "admin login"; exit 1; }
AH="Authorization: Bearer $TOK"

echo "== 1. CATALOG API RENDER =="
P=$(curl -s "$B/products?limit=48&sort=featured")
echo "$P" | python3 -c '
import sys,json
d=json.load(sys.stdin); items=d.get("items",[])
assert len(items)==8, f"expected 8 products, got {len(items)}"
p0=[p for p in items if p["slug"]=="tee"][0]
assert p0["price"]==4490 and p0["rating"]==4.7 and p0["reviews"]==3, "tee fields wrong"
assert p0["sizeStocks"] and p0["sizeStocks"][0]["s"]=="S", "tee sizeStocks missing"
assert p0["images"][0]["url"]=="/assets/prod-tee.png", "tee image wrong"
sh=[p for p in items if p["slug"]=="shaker"][0]
assert sh["rating"]==4.6 and sh["reviews"]==318, "shaker fields wrong"
print("catalog fields OK: 8 products, rating/reviews/sizeStocks/images present")
' && ok "GET /products exposes rating/reviews/sizeStocks" || bad "GET /products fields"

# decisive: admin edits price -> catalog API reflects it (storefront re-renders from this)
PID=$(curl -s "$B/products" | python3 -c 'import sys,json;print([p["_id"] for p in json.load(sys.stdin)["items"] if p["slug"]=="tee"][0])')
curl -s -X PUT $B/admin/products/$PID -H "$AH" -F price=4790 > /dev/null
NEW=$(curl -s "$B/products" | python3 -c 'import sys,json;print([p["price"] for p in json.load(sys.stdin)["items"] if p["slug"]=="tee"][0])')
[ "$NEW" = "4790" ] && ok "admin price edit 4490→4790 reflected in catalog API" || bad "catalog edit (got $NEW)"
curl -s -X PUT $B/admin/products/$PID -H "$AH" -F price=4490 > /dev/null
REV=$(curl -s "$B/products" | python3 -c 'import sys,json;print([p["price"] for p in json.load(sys.stdin)["items"] if p["slug"]=="tee"][0])')
[ "$REV" = "4490" ] && ok "price reverted to 4490" || bad "revert (got $REV)"

echo "== 2. ORDER CSV EXPORT =="
curl -s "$B/admin/orders/export.csv" -H "$AH" -o /tmp/forged-orders.csv
head -c 3 /tmp/forged-orders.csv | od -An -tx1 | grep -q "ef bb bf" && ok "CSV starts with UTF-8 BOM (Excel ৳ safe)" || bad "BOM missing"
head -1 /tmp/forged-orders.csv | grep -q 'Grand Total (BDT)' && ok "CSV header has BDT columns" || bad "CSV header"
N=$(awk 'END{print NR-1}' /tmp/forged-orders.csv)
[ "$N" -ge 3 ] && ok "CSV has $N order rows (seeded 3)" || bad "CSV rows ($N)"
grep -q "FRG-SEED001" /tmp/forged-orders.csv && ok "CSV contains seeded order FRG-SEED001" || bad "CSV content"
grep -q '৳' /tmp/forged-orders.csv && ok "CSV carries ৳ money in item lines" || bad "CSV ৳ format"
# no-auth must 401
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/orders/export.csv")
[ "$CODE" = "401" ] && ok "export.csv without token → 401" || bad "unauth export ($CODE)"

echo "== 3. SMS DRY-RUN HOOKS =="
rm -f /home/z/my-project/backend/logs/sms.jsonl
# COD order → orderPlacedSMS
O=$(curl -s -X POST $B/orders -F 'payload={"customer":{"name":"SMS QA","phone":"01711998877","email":"smsqa@test.com"},"shipping":{"address":"House 12, Road 5","city":"Dhanmondi","division":"dhaka"},"items":[{"slug":"shaker","qty":2}],"paymentMethod":"cod"}')
ONO=$(echo "$O" | python3 -c 'import sys,json;print(json.load(sys.stdin)["order"]["orderNumber"])' 2>/dev/null)
# _id is not in the public response — resolve via admin list
OID=$(curl -s "$B/admin/orders?search=$ONO" -H "$AH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["_id"])' 2>/dev/null)
[ -n "$OID" ] && ok "COD order placed ($ONO)" || { bad "COD order"; echo "$O" | head -c 300; }
sleep 0.5
S1=$(cat /home/z/my-project/backend/logs/sms.jsonl 2>/dev/null | wc -l)
grep -q '"mode": *"dry-run"' /home/z/my-project/backend/logs/sms.jsonl && ok "orderPlacedSMS logged (dry-run)" || bad "order SMS missing"
grep -q '8801711998877' /home/z/my-project/backend/logs/sms.jsonl && ok "phone normalized 017…→880171…" || bad "phone normalization"
grep -q "$ONO" /home/z/my-project/backend/logs/sms.jsonl && ok "SMS contains order number" || bad "SMS order no"
# bKash order → verify → statusSMS (unique TrxID per run — TrxIDs are one-time-use by design)
TRX="SMSQ$(date +%s | cut -c 6-11)"
cp /home/z/my-project/backend/src/seed/demo-proof.png /tmp/proof.png
O2=$(curl -s -X POST $B/orders -F "payload={\"customer\":{\"name\":\"SMS QA 2\",\"phone\":\"01829988771\",\"email\":\"smsqa2@test.com\"},\"shipping\":{\"address\":\"Sector 9\",\"city\":\"Uttara\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"gloves\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"$TRX\"}" -F "screenshot=@/tmp/proof.png")
O2NO=$(echo "$O2" | python3 -c 'import sys,json;print(json.load(sys.stdin)["order"]["orderNumber"])' 2>/dev/null)
O2ID=""
[ -n "$O2NO" ] && O2ID=$(curl -s "$B/admin/orders?search=$O2NO" -H "$AH" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["_id"])' 2>/dev/null)
[ -n "$O2ID" ] && ok "bKash order placed ($O2NO, TrxID $TRX)" || { bad "bKash order"; echo "$O2" | head -c 300; }
curl -s -X PATCH $B/admin/orders/$O2ID/verify -H "$AH" -H 'Content-Type: application/json' -d '{}' > /dev/null
sleep 0.5
grep -q "Payment verified" /home/z/my-project/backend/logs/sms.jsonl && ok "verify → statusSMS logged" || bad "verify SMS missing"
curl -s -X PATCH $B/admin/orders/$O2ID/status -H "$AH" -H 'Content-Type: application/json' -d '{"status":"shipped","note":"Steadfast SF-QA1"}' > /dev/null
sleep 0.5
grep -q 'Shipped' /home/z/my-project/backend/logs/sms.jsonl && ok "shipped → statusSMS logged" || bad "shipped SMS missing"
TOT=$(wc -l < /home/z/my-project/backend/logs/sms.jsonl)
echo "  ℹ sms.jsonl total entries: $TOT"
[ "$TOT" -ge 4 ] && ok "all 4+ SMS hooks fired" || bad "expected ≥4 SMS entries"

echo "== 4. ADMIN SETTINGS SMS BLOCK =="
curl -s $B/admin/settings -H "$AH" | python3 -c '
import sys,json
s=json.load(sys.stdin)["setting"]
assert "sms" in s, "sms block missing"
assert s["sms"]["provider"]=="sslwireless" and s["sms"]["mode"]=="dry-run" and s["sms"]["dryRun"] is True, "sms status wrong: "+str(s["sms"])
print("sms status:", s["sms"])
' && ok "GET /admin/settings includes sms status (sslwireless · dry-run)" || bad "settings sms block"

echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
