#!/usr/bin/env bash
# FORGED — Task 52 QA: Guest Checkout Enable/Disable kill-switch
# · Setting.checkout.guestEnabled — schema default ON, seed explicit
# · public surface: GET /api/settings/payment carries checkout block; admin GET/PUT
# · enforcement: POST /api/orders → 403 GUEST_CHECKOUT_DISABLED for guests,
#   logged-in JWT + admin manual orders unaffected; preview stays public
# Usage: bash /home/z/my-project/scripts/qa_task52_guest_toggle.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 52 — Guest checkout enable/disable ══"

# ── 0. API restart (clears in-memory limit buckets) + fresh seed ────────────
pkill -f "node server.js" 2>/dev/null; sleep 1
cd /home/z/my-project/backend && node src/seed/seed.js > /dev/null 2>&1
setsid --fork node server.js > /tmp/api.log 2>&1 < /dev/null
UP=0; for i in $(seq 1 20); do H=$(curl -s -m 2 $BASE/api/health 2>/dev/null); [[ "$H" == *'"ok":true'* ]] && { UP=1; break; }; sleep 1; done
[[ "$UP" == 1 ]] && ok "API restarted + fresh seed" "" || { bad "API restart" "$H"; exit 1; }

# ── 1. default policy = ON ──────────────────────────────────────────────────
G=$(curl -s $BASE/api/settings/payment | JQ "['checkout']['guestEnabled']")
[[ "$G" == "True" ]] && ok "default guestEnabled=true on public /settings/payment" "" || bad "default flag" "$G"

# ── 2. guest COD order while enabled → 201 ──────────────────────────────────
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA T52 Guest","phone":"01755500101"},"shipping":{"address":"1 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod"}')
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[[ "$HTTP" == 201 && "$(echo "$BODY" | JQ "['order']['isGuest']")" == "True" ]] \
  && ok "guest order → 201 (isGuest) while enabled" "" || bad "guest order enabled" "$HTTP $BODY"

# ── 3. admin login + disable via settings API ───────────────────────────────
AT=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | JQ "['token']")
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || bad "admin login" "$AT"
UPD=$(curl -s -X PUT $BASE/api/admin/settings -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"checkout":{"guestEnabled":false}}')
[[ "$(echo "$UPD" | JQ "['setting']['checkout']['guestEnabled']")" == "False" ]] \
  && ok "admin PUT checkout.guestEnabled=false echoed" "" || bad "admin PUT" "$UPD"
P=$(curl -s $BASE/api/settings/payment | JQ "['checkout']['guestEnabled']")
[[ "$P" == "False" ]] && ok "public flag flips to false instantly" "" || bad "public flag" "$P"

# ── 4. guest order while disabled → 403 + machine code ──────────────────────
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA T52 Blocked","phone":"01755500102"},"shipping":{"address":"1 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod"}')
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[[ "$HTTP" == 403 && "$(echo "$BODY" | JQ "['code']")" == "GUEST_CHECKOUT_DISABLED" ]] \
  && ok "guest order → 403 GUEST_CHECKOUT_DISABLED" "$BODY" || bad "guest gate" "$HTTP $BODY"

# ── 5. logged-in customer still fine while disabled ─────────────────────────
DT=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit","password":"forge2026"}' | JQ "['token']")
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/orders -H "Authorization: Bearer $DT" -F 'payload={"customer":{"name":"Demo Customer","phone":"01712345678"},"shipping":{"address":"9 Gulshan","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod"}')
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[[ "$HTTP" == 201 && "$(echo "$BODY" | JQ "['order']['isGuest']")" == "False" ]] \
  && ok "logged-in order → 201 while disabled (isGuest false)" "" || bad "logged-in order" "$HTTP $BODY"

# ── 6. admin manual order (WhatsApp/phone) unaffected ────────────────────────
PID=$(curl -s "$BASE/api/products?limit=1" | JQ "['items'][0]['_id']")
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/admin/orders/manual -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d "{\"customer\":{\"name\":\"WA Manual T52\",\"phone\":\"01911002101\"},\"shipping\":{\"address\":\"a\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"productId\":\"$PID\",\"qty\":1}],\"paymentMethod\":\"cod\"}")
HTTP=$(echo "$R" | tail -1); BODY=$(echo "$R" | sed '$d')
[[ "$HTTP" == 201 && "$(echo "$BODY" | JQ "['order']['source']")" == "manual" ]] \
  && ok "admin manual order → 201 while disabled" "" || bad "manual order" "$HTTP $BODY"

# ── 7. preview stays public for guests (totals calc, no order) ───────────────
HTTP=$(curl -s -o /tmp/q52pv -w '%{http_code}' -X POST $BASE/api/orders/preview -H 'Content-Type: application/json' -d '{"items":[{"slug":"whey","qty":1}],"division":"dhaka"}')
[[ "$HTTP" == 200 ]] && ok "POST /orders/preview stays public" "" || bad "preview" "$HTTP $(cat /tmp/q52pv)"

# ── 8. junk body ignored (no crash, flag unchanged) ──────────────────────────
UPD=$(curl -s -X PUT $BASE/api/admin/settings -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"checkout":"yes"}')
[[ "$(echo "$UPD" | JQ "['setting']['checkout']['guestEnabled']")" == "False" ]] \
  && ok "non-object checkout body ignored safely" "" || bad "junk body" "$UPD"

# ── 9. re-enable → guest order works again ───────────────────────────────────
UPD=$(curl -s -X PUT $BASE/api/admin/settings -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"checkout":{"guestEnabled":true}}')
[[ "$(echo "$UPD" | JQ "['setting']['checkout']['guestEnabled']")" == "True" ]] \
  && ok "admin PUT true echoed" "" || bad "re-enable PUT" "$UPD"
HTTP=$(curl -s -o /tmp/q52re -w '%{http_code}' -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA T52 Back","phone":"01755500103"},"shipping":{"address":"1 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod"}')
[[ "$HTTP" == 201 ]] && ok "guest order → 201 again after re-enable" "" || bad "re-enable order" "$HTTP $(cat /tmp/q52re)"

# ── 10. unauthenticated admin PUT rejected (authz intact) ────────────────────
HTTP=$(curl -s -o /tmp/q52na -w '%{http_code}' -X PUT $BASE/api/admin/settings -H 'Content-Type: application/json' -d '{"checkout":{"guestEnabled":false}}')
[[ "$HTTP" == 401 || "$HTTP" == 403 ]] && ok "unauthenticated PUT /admin/settings rejected ($HTTP)" "" || bad "authz" "$HTTP"

# ── 11. clean exit state — restart API + reseed (flag back to ON) ────────────
pkill -f "node server.js" 2>/dev/null; sleep 1
node src/seed/seed.js > /dev/null 2>&1
setsid --fork node server.js > /tmp/api.log 2>&1 < /dev/null
sleep 3
H=$(curl -s -m 3 $BASE/api/health); [[ "$H" == *'"ok":true'* ]] \
  && ok "clean state: API up + DB reseeded (flag ON)" "" || bad "clean state" "$H"

echo "════════════════════════════════════"
echo "TASK 52 RESULT: PASS=$PASS FAIL=$FAIL"
exit $FAIL
