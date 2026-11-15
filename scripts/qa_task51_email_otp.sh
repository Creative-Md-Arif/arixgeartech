#!/usr/bin/env bash
# FORGED — Task 51 QA: Email OTP verification + email/phone login
# · register → UNVERIFIED + 6-digit OTP (devOtp in dry-run), no token
# · login gate: unverified customer → 403 needsVerification (email & phone)
# · verify-email: wrong/attempts/expiry paths, success → token + referral award + guest-order claim
# · login identifier: email OR BD phone (017…/+880…/880…/dash formats)
# · resend: 60s cooldown, code rotation, anti-enumeration
# · seeded accounts pre-verified; guest checkout NOT gated
# Usage: bash /home/z/my-project/scripts/qa_task51_email_otp.sh   (~90s — has 61s cooldown sleep)
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
bad() { FAIL=$((FAIL+1)); echo "FAIL $1"; [ -n "${2:-}" ] && echo "  └─ $2"; return 0; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 51 — Email OTP verification + email/phone login ══"

# ── 0. API restart + fresh seed ─────────────────────────────────────────────
pkill -f "node server.js" 2>/dev/null; sleep 1
cd /home/z/my-project/backend && node src/seed/seed.js > /dev/null 2>&1
setsid --fork node server.js > /tmp/api.log 2>&1 < /dev/null
UP=0; for i in $(seq 1 20); do H=$(curl -s -m 2 $BASE/api/health 2>/dev/null); [[ "$H" == *'"ok":true'* ]] && { UP=1; break; }; sleep 1; done
[[ "$UP" == 1 ]] && ok "API restarted + fresh seed" || { bad "API restart" "$H"; exit 1; }

# ── 1. register → UNVERIFIED, no token, devOtp present, phone normalized ────
R=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"OTP Tester","email":"qa51a@forged.fit","password":"forge51x","phone":"+880 1711-100-001"}')
NOTOK=$(echo "$R" | rg -c '"token"' 2>/dev/null || true)
[[ "$(echo "$R" | JQ "['needsVerification']")" == "True" \
  && -z "$NOTOK" \
  && "$(echo "$R" | JQ "['delivery']")" == "dry-run" \
  && "$(echo "$R" | JQ "['phone']")" == "01711100001" ]] \
  && ok "register → needsVerification, no token, phone normalized +880…→01711100001" || bad "register shape" "$R"
E1=$(echo "$R" | JQ "['email']"); C1=$(echo "$R" | JQ "['devOtp']")
[[ "$C1" =~ ^[0-9]{6}$ ]] && ok "devOtp is a 6-digit code (dry-run only)" "$C1" || bad "devOtp format" "$C1"

# ── 2. validation & duplicates ───────────────────────────────────────────────
HTTP=$(curl -s -o /tmp/q51v1 -w '%{http_code}' -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Bad","email":"qa51b@forged.fit","password":"forge51x","phone":"12345"}')
[[ "$HTTP" == 400 ]] && ok "invalid phone → 400" "$(cat /tmp/q51v1)" || bad "invalid phone" "$HTTP"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Dup","email":"qa51a@forged.fit","password":"forge51x"}')
[[ "$HTTP" == 409 ]] && ok "duplicate email → 409" || bad "dup email ($HTTP)"
for PH in "8801711100001" "01711-100-001" "1711100001"; do
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"D\",\"email\":\"dx$RANDOM@x.com\",\"password\":\"forge51x\",\"phone\":\"$PH\"}")
  [[ "$HTTP" == 409 ]] && ok "duplicate phone ($PH) → 409" || bad "dup phone $PH ($HTTP)"
done

# ── 3. login gate — email AND phone, both blocked until verified ────────────
L=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"qa51a@forged.fit","password":"forge51x"}')
BODY=$(echo "$L" | sed '$d'); HTTP=$(echo "$L" | tail -1)
[[ "$HTTP" == 403 && "$(echo "$BODY" | JQ "['needsVerification']")" == "True" && "$(echo "$BODY" | JQ "['email']")" == "$E1" ]] \
  && ok "login before verify (email) → 403 needsVerification" || bad "email gate" "$HTTP $BODY"
L=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"01711100001","password":"forge51x"}')
HTTP=$(echo "$L" | tail -1)
[[ "$HTTP" == 403 ]] && ok "login before verify (phone) → 403" || bad "phone gate" "$HTTP"

# ── 4. wrong OTP attempts + lockout ─────────────────────────────────────────
X=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$E1\",\"code\":\"000000\"}")
[[ "$(echo "$X" | JQ "['attemptsLeft']")" == "4" ]] && ok "wrong OTP → attemptsLeft 4" || bad "attempts" "$X"
for i in 2 3 4 5; do curl -s -o /dev/null -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$E1\",\"code\":\"00000$i\"}"; done
X=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$E1\",\"code\":\"$C1\"}")
[[ "$X" == *'Too many wrong attempts'* && "$(echo "$X" | JQ "['needsResend']")" == "True" ]] \
  && ok "5 wrong → lockout (even the right code rejected until resend)" || bad "lockout" "$X"
X=$(curl -s -X POST $BASE/api/auth/resend-verification -H 'Content-Type: application/json' -d "{\"email\":\"$E1\"}")
[[ "$(echo "$X" | JQ "['delivery']")" == "cooldown" ]] && ok "resend inside 60s → cooldown" || bad "cooldown" "$X"
X=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d '{"email":"ghost@nowhere.com","code":"123456"}')
[[ "$(echo "$X" | JQ "['message']")" == "Invalid or expired verification code" ]] && ok "unknown email → generic 400 (no leak)" || bad "enumeration" "$X"

# ── 5. fresh unverified user for the verify happy-path + linking test ───────
# guest order FIRST (same phone) — must be claimed by verifyEmail later
G=$(curl -s -X POST $BASE/api/orders -F 'payload={"customer":{"name":"Link Me","phone":"01711220033"},"shipping":{"address":"9 Banani","city":"Dhaka","division":"dhaka"},"items":[{"slug":"tee","qty":1}],"paymentMethod":"cod"}')
[[ "$(echo "$G" | JQ "['order']['orderNumber']")" != "None" ]] && ok "guest order placed (not gated)" || bad "guest order" "$G"

R2=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"Verify Me","email":"qa51c@forged.fit","password":"forge51x","phone":"01711220033"}')
E2=$(echo "$R2" | JQ "['email']"); C2=$(echo "$R2" | JQ "['devOtp']")
V=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$E2\",\"code\":\"$C2\"}")
[[ "$(echo "$V" | JQ "['user']['emailVerified']")" == "True" && "$(echo "$V" | JQ "['token']")" != "None" ]] \
  && ok "correct OTP → token + emailVerified true" || bad "verify" "$V"
MY=$(curl -s $BASE/api/orders/my -H "Authorization: Bearer $(echo "$V" | JQ "['token']")")
[[ "$(echo "$MY" | JQ "['items'][0]['customer']['phone']")" == "01711220033" ]] \
  && ok "guest order auto-claimed at verification (Task 28 via verify)" || bad "order linking" "$MY"

# ── 6. login identifier matrix after verification ───────────────────────────
for ID in "qa51c@forged.fit" "01711220033" "+8801711220033" "01711-220-033"; do
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"identifier\":\"$ID\",\"password\":\"forge51x\"}")
  [[ "$HTTP" == 200 ]] && ok "login identifier '$ID' → 200" || bad "identifier $ID ($HTTP)"
done
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"qa51c@forged.fit","password":"forge51x"}')
[[ "$HTTP" == 200 ]] && ok "legacy {email,password} body → 200 (backward compat)" || bad "legacy login ($HTTP)"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"01811220033","password":"forge51x"}')
[[ "$HTTP" == 401 ]] && ok "unknown phone → 401 (no leak)" || bad "unknown phone ($HTTP)"

# ── 7. seeded accounts pre-verified (login works, no OTP) ───────────────────
for U in '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' '{"email":"demo@forged.fit","password":"forge2026"}' '{"identifier":"01712345678","password":"forge2026"}'; do
  HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "$U")
  [[ "$HTTP" == 200 ]] && ok "seeded login OK: $(echo "$U" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("email") or d.get("identifier"))')" || bad "seeded login ($U → $HTTP)"
done

# ── 8. referral deferred to verification ────────────────────────────────────
RA=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Ref Holder","email":"qa51ref@forged.fit","password":"forge51x"}')
VA=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$(echo "$RA" | JQ "['email']")\",\"code\":\"$(echo "$RA" | JQ "['devOtp']")\"}")
ATOK=$(echo "$VA" | JQ "['token']")
RC=$(curl -s $BASE/api/auth/loyalty -H "Authorization: Bearer $ATOK" | JQ "['referralCode']")
RB=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d "{\"name\":\"Referred B\",\"email\":\"qa51new@forged.fit\",\"password\":\"forge51x\",\"ref\":\"$RC\"}")
P0=$(curl -s $BASE/api/auth/loyalty -H "Authorization: Bearer $(echo "$RB" | JQ "['token']" 2>/dev/null)" 2>/dev/null)
# B has NO token yet (unverified) — login blocked; points must be 0 at this stage
LB=$(curl -s -w '\n%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"identifier":"qa51new@forged.fit","password":"forge51x"}')
[[ "$(echo "$LB" | tail -1)" == 403 ]] && ok "referred user B blocked until verify" || bad "B gate" "$LB"
VB=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$(echo "$RB" | JQ "['email']")\",\"code\":\"$(echo "$RB" | JQ "['devOtp']")\"}")
BT=$(echo "$VB" | JQ "['token']")
P=$(curl -s $BASE/api/auth/loyalty -H "Authorization: Bearer $BT")
PA=$(curl -s $BASE/api/auth/loyalty -H "Authorization: Bearer $ATOK")
[[ "$(echo "$P" | JQ "['points']")" == "50" && "$(echo "$PA" | JQ "['points']")" == "100" ]] \
  && ok "verify-time referral: B +50, A +100 (not at register)" || bad "referral timing" "B=$(echo "$P" | JQ "['points']") A=$(echo "$PA" | JQ "['points']")"

# ── 9. resend rotation: old code dies, new code works ───────────────────────
RC2=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' -d '{"name":"Rotate","email":"qa51rot@forged.fit","password":"forge51x"}')
ER=$(echo "$RC2" | JQ "['email']"); CR1=$(echo "$RC2" | JQ "['devOtp']")
sleep 61
RC3=$(curl -s -X POST $BASE/api/auth/resend-verification -H 'Content-Type: application/json' -d "{\"email\":\"$ER\"}")
CR2=$(echo "$RC3" | JQ "['devOtp']")
[[ "$CR2" != "None" && "$CR2" != "$CR1" ]] && ok "resend after cooldown → NEW code" || bad "rotation" "$RC3"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$ER\",\"code\":\"$CR1\"}")
[[ "$HTTP" == 400 ]] && ok "old code after resend → 400" || bad "old code ($HTTP)"
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' -d "{\"email\":\"$ER\",\"code\":\"$CR2\"}")
[[ "$HTTP" == 200 ]] && ok "new code → 200 (attempts reset by resend)" || bad "new code ($HTTP)"
X=$(curl -s -X POST $BASE/api/auth/resend-verification -H 'Content-Type: application/json' -d '{"email":"ghost@nowhere.com"}')
[[ "$(echo "$X" | JQ "['delivery']")" == "none" ]] && ok "resend unknown email → generic 200/none" || bad "resend enum" "$X"

# ── 10. toSafeJSON exposes emailVerified; email logged in dry-run ───────────
ME=$(curl -s $BASE/api/auth/me -H "Authorization: Bearer $BT")
[[ "$(echo "$ME" | JQ "['user']['emailVerified']")" == "True" ]] && ok "GET /me exposes emailVerified" || bad "safeJSON" "$ME"
rg -q "verification code" /home/z/my-project/backend/logs/emails.jsonl && ok "OTP email written to dry-run log" || bad "email log"

echo "════════════════════════════════════════"
echo "TASK 51 RESULT: PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] && echo "🎉 ALL GREEN" || echo "❌ FAILURES PRESENT"
exit $FAIL
