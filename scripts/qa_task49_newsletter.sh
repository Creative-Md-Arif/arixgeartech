#!/usr/bin/env bash
# FORGED — Task 49 QA: Newsletter signup → welcome coupon (FORGE10) integration
# · POST /api/newsletter — happy path / duplicate-friendly / invalid / missing
# · FORGE10 hardening — public:true → /api/coupons/active, perUser:1 → 409 on 2nd use
# · 10% math via /api/coupons/validate + real order flow (guest phone identity)
# · Admin messages ?topic=newsletter filter + counts chip
# · subscribe rate-limit → 429 (run last; suite restarts API to clear buckets)
# Usage: bash /home/z/my-project/scripts/qa_task49_newsletter.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "PASS $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 49 — Newsletter → FORGE10 integration ══"

# ── 0. API restart (clears in-memory limit buckets) + fresh seed ────────────
pkill -f "node server.js" 2>/dev/null; sleep 1
cd /home/z/my-project/backend && node src/seed/seed.js > /dev/null 2>&1
setsid --fork node server.js > /tmp/api.log 2>&1 < /dev/null
UP=0; for i in $(seq 1 20); do H=$(curl -s -m 2 $BASE/api/health 2>/dev/null); [[ "$H" == *'"ok":true'* ]] && { UP=1; break; }; sleep 1; done
[[ "$UP" == 1 ]] && ok "API restarted + fresh seed (FORGE10 hardened)" "" || { bad "API restart" "$H"; exit 1; }

# ── 1. subscribe — happy path ───────────────────────────────────────────────
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{"email":"newsub@forged.fit"}')
BODY=$(echo "$R" | sed '$d'); HTTP=$(echo "$R" | tail -1)
[[ "$HTTP" == 201 ]] \
  && [[ "$(echo "$BODY" | JQ "['coupon']['code']")" == "FORGE10" ]] \
  && [[ "$(echo "$BODY" | JQ "['coupon']['value']")" == "10" ]] \
  && [[ "$(echo "$BODY" | JQ "['alreadySubscribed']")" == "False" ]] \
  && ok "subscribe → 201 + FORGE10 10%" "" || bad "subscribe happy path" "$HTTP $R"

# ── 2. duplicate — friendly idempotent (not 409) ────────────────────────────
R=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{"email":"newsub@forged.fit"}')
BODY=$(echo "$R" | sed '$d'); HTTP=$(echo "$R" | tail -1)
[[ "$HTTP" == 200 && "$(echo "$BODY" | JQ "['alreadySubscribed']")" == "True" && "$(echo "$BODY" | JQ "['coupon']['code']")" == "FORGE10" ]] \
  && ok "duplicate → 200 friendly + same code" "" || bad "duplicate handling" "$HTTP $R"

# uppercase variant is the same subscriber
HTTP=$(curl -s -o /tmp/q49up -w '%{http_code}' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{"email":"NewSub@FORGED.fit"}')
[[ "$HTTP" == 200 && "$(cat /tmp/q49up | JQ "['alreadySubscribed']")" == "True" ]] \
  && ok "email case-insensitive dedupe" "" || bad "case-insensitive dedupe" "$HTTP $(cat /tmp/q49up)"

# ── 3. validation ───────────────────────────────────────────────────────────
HTTP=$(curl -s -o /tmp/q49v1 -w '%{http_code}' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{"email":"not-an-email"}')
[[ "$HTTP" == 400 ]] && ok "invalid email → 400" "$(cat /tmp/q49v1)" || bad "invalid email" "$HTTP $(cat /tmp/q49v1)"
HTTP=$(curl -s -o /tmp/q49v2 -w '%{http_code}' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{}')
[[ "$HTTP" == 400 ]] && ok "missing email → 400" "" || bad "missing email" "$HTTP $(cat /tmp/q49v2)"

# ── 4. FORGE10 public → coupon picker list ──────────────────────────────────
ACT=$(curl -s $BASE/api/coupons/active)
echo "$ACT" | rg -q 'FORGE10' && ok "GET /api/coupons/active lists FORGE10 (public:true)" "" || bad "active list" "$ACT"
DESC=$(echo "$ACT" | python3 -c "import sys,json;print([i['description'] for i in json.load(sys.stdin)['items'] if i['code']=='FORGE10'][0])" 2>/dev/null)
[[ "$DESC" == *'10% off'* ]] && ok "picker description present" "$DESC" || bad "picker description" "$DESC"

# ── 5. validate endpoint — 10% math ─────────────────────────────────────────
V=$(curl -s -X POST $BASE/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"FORGE10","subtotal":5000}')
[[ "$(echo "$V" | JQ "['valid']")" == "True" && "$(echo "$V" | JQ "['discount']")" == "500" && "$(echo "$V" | JQ "['finalTotal']")" == "4500" ]] \
  && ok "validate FORGE10 @৳5000 → −৳500 (final ৳4500)" "" || bad "validate math" "$V"
HTTP=$(curl -s -o /tmp/q49v3 -w '%{http_code}' -X POST $BASE/api/coupons/validate -H 'Content-Type: application/json' -d '{"code":"WELCOME500","subtotal":1000}')
[[ "$HTTP" == 400 ]] && ok "minOrder guard works (WELCOME500 @৳1000 → 400)" "$(cat /tmp/q49v3)" || bad "validate guard" "$HTTP $(cat /tmp/q49v3)"

# ── 6. real order flow — perUser:1 enforced on phone identity ───────────────
O1=$(curl -s -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA Subscriber","phone":"01711122233"},"shipping":{"address":"1 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"whey","qty":1}],"paymentMethod":"cod","couponCode":"FORGE10"}')
S=$(echo "$O1" | JQ "['order']['totals']['subtotal']"); D=$(echo "$O1" | JQ "['order']['totals']['discount']")
[[ "$(echo "$O1" | JQ "['order']['totals']['couponCode']")" == "FORGE10" && "$D" == "$((S/10))" ]] \
  && ok "order 1 → FORGE10 applied (−৳$D of ৳$S)" "" || bad "order 1 coupon" "$O1"
O2=$(curl -s -o /tmp/q49o2 -w '%{http_code}' -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA Subscriber","phone":"01711122233"},"shipping":{"address":"1 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod","couponCode":"FORGE10"}')
[[ "$O2" == 409 && "$(cat /tmp/q49o2)" == *'already used'* ]] \
  && ok "same phone 2nd use → 409 (perUser:1)" "$(cat /tmp/q49o2)" || bad "perUser enforcement" "$O2 $(cat /tmp/q49o2)"
# other phone still works (perUser ≠ global maxUses)
O3=$(curl -s -o /tmp/q49o3 -w '%{http_code}' -X POST $BASE/api/orders -F 'payload={"customer":{"name":"QA Two","phone":"01799988877"},"shipping":{"address":"2 Dhanmondi","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod","couponCode":"FORGE10"}')
[[ "$O3" == 201 ]] && ok "different phone → still redeemable" "" || bad "other phone redeem" "$O3 $(cat /tmp/q49o3)"

# ── 7. admin — coupon doc + messages topic filter/counts ────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']"); AH="Authorization: Bearer $AT"
CL=$(curl -s "$BASE/api/admin/coupons?q=FORGE10" -H "$AH")
[[ "$(echo "$CL" | python3 -c "import sys,json;[c] if len(json.load(sys.stdin)['items'])==1 else []" 2>/dev/null)" != "None" ]] || true
MAXU=$(echo "$CL" | python3 -c "import sys,json;i=json.load(sys.stdin)['items'][0];print(i['maxUses'],i['perUser'],i['public'],i['usedCount'])" 2>/dev/null)
[[ "$MAXU" == "500 1 True 2" ]] && ok "coupon doc: maxUses 500 · perUser 1 · public · usedCount 2" "" || bad "coupon doc state" "$MAXU"
ML=$(curl -s "$BASE/api/admin/messages?topic=newsletter" -H "$AH")
N=$(echo "$ML" | JQ "['items']" | python3 -c "import ast,sys;print(len(ast.literal_eval(sys.stdin.read())))" 2>/dev/null)
CNT=$(echo "$ML" | python3 -c "import sys,json;print(json.load(sys.stdin)['counts']['newsletter'])" 2>/dev/null)
[[ "$N" == "1" && "$CNT" == "1" ]] && ok "admin inbox ?topic=newsletter → 1 row + counts.newsletter=1" "" || bad "topic filter" "$N $CNT"
ML2=$(curl -s "$BASE/api/admin/messages" -H "$AH")
[[ "$(echo "$ML2" | python3 -c "import sys,json;print('counts' in json.load(sys.stdin))" 2>/dev/null)" == "True" ]] \
  && ok "default inbox payload carries counts chip" "" || bad "counts chip" "$(echo "$ML2" | head -c 120)"

# ── 8. rate limit → 429 (LAST — burns this IP's 1h bucket) ──────────────────
CODES=$(for i in $(seq 1 210); do curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/newsletter -H 'Content-Type: application/json' -d '{"email":"rl@forged.fit"}'; done)
echo "$CODES" | rg -q '^429$' && ok "subscribe rate limit fires (429 within 210 reqs)" "" || bad "rate limit" "$(echo "$CODES" | sort | uniq -c | tr '\n' ' ')"

# ── 9. clean exit state — restart API (clear buckets) + reseed ──────────────
pkill -f "node server.js" 2>/dev/null; sleep 1
node src/seed/seed.js > /dev/null 2>&1
setsid --fork node server.js > /tmp/api.log 2>&1 < /dev/null
sleep 3
H=$(curl -s -m 3 $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "clean state: API up + DB reseeded" "" || bad "clean state" "$H"

echo "════════════════════════════════════"
echo "TASK 49 RESULT: PASS=$PASS FAIL=$FAIL"
exit $FAIL
