#!/usr/bin/env bash
# Task 28 — race-safe oversell burst: stock 3, 4 parallel COD orders of qty 2
set -u
BASE="${BASE:-http://localhost:5000}"
AT=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
AH="Authorization: Bearer $AT"
WID=$(curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['_id'])")

curl -s -o /dev/null -X PUT "$BASE/api/admin/products/$WID" -H "$AH" -H 'Content-Type: application/json' -d '{"stock":3}'
echo "stock before: $(curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['stock'])")"

for i in 1 2 3 4; do
  P=$(python3 - "$i" << 'PYEOF'
import json, sys
i = sys.argv[1]
payload = {
  "customer": {"name": f"Burst {i}", "phone": f"0160000000{i}"},
  "shipping": {"address": "b", "city": "Dhaka", "division": "dhaka"},
  "items": [{"slug": "whey", "qty": 2}],
  "paymentMethod": "cod",
  "idempotencyKey": f"burst-qa3-{i}",
}
print(json.dumps({"payload": json.dumps(payload)}))
PYEOF
)
  curl -s -o /tmp/burst$i -w '%{http_code}\n' -X POST $BASE/api/orders \
    -H 'Content-Type: application/json' -d "$P" > /tmp/burstcode$i &
done
wait
echo "--- codes (expect exactly one 201) ---"
cat /tmp/burstcode1 /tmp/burstcode2 /tmp/burstcode3 /tmp/burstcode4
echo "--- stock after (expect 1) ---"
curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['stock'])"
echo "--- sold-out message sample ---"
grep -o '"message":"[^"]*"' /tmp/burst1 /tmp/burst2 /tmp/burst3 /tmp/burst4 2>/dev/null | head -4
curl -s -o /dev/null -X PUT "$BASE/api/admin/products/$WID" -H "$AH" -H 'Content-Type: application/json' -d '{"stock":15}'
echo "stock restored: $(curl -s "$BASE/api/admin/products?search=whey" -H "$AH" | python3 -c "import sys,json;print(json.load(sys.stdin)['items'][0]['stock'])")"
