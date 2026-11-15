#!/usr/bin/env bash
# FORGED — Task 23 QA: Forgot Password / Reset Password system
# Covers: public forgot/verify/reset flow (customer + admin roles),
#         ERP-assisted customer reset (admin panel), guards, regressions.
# Usage: bash /home/z/my-project/scripts/qa_task23_auth.sh   (cwd: forged-full-project)
set -u
BASE="${BASE:-http://localhost:5000}"
PROJ="${PROJ:-/home/z/my-project}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 23 — Forgot Password ══"

# ── 0. regressions ──────────────────────────────────────────────────────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "$H" || bad "health" "$H"
P=$(curl -s -o /dev/null -w '%{http_code}' $BASE/api/products?limit=1); [[ "$P" == 200 ]] && ok "products 200" "" || bad "products" "$P"

# ── 1. validation ───────────────────────────────────────────────────────────
R=$(curl -s -o /tmp/q23a -w '%{http_code}' -X POST $BASE/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"not-an-email"}')
[[ "$R" == 400 ]] && ok "forgot invalid email → 400" "$(cat /tmp/q23a)" || bad "forgot invalid email" "$R $(cat /tmp/q23a)"

# ── 2. unknown email → generic 200, NO resetUrl (no enumeration) ────────────
B=$(curl -s -X POST $BASE/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"nobody@nowhere.test"}')
[[ "$B" == *'"delivery":"none"'* && "$B" != *resetUrl* && "$B" == *"If an account exists"* ]] \
  && ok "unknown email generic 200 (no leak)" "$B" || bad "unknown email leak?" "$B"

# ── 3. register a fresh customer for the full flow ──────────────────────────
TS=$(date +%s)
QA_EMAIL="qa-reset-$TS@forged.test"
REG=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d "{\"name\":\"QA Reset\",\"email\":\"$QA_EMAIL\",\"phone\":\"017000000$((TS%100))\",\"password\":\"oldpass123\"}")
OLD_TOKEN=$(echo "$REG" | JQ "['token']")
[[ -n "$OLD_TOKEN" && "$OLD_TOKEN" != "None" ]] && ok "register QA customer" "$QA_EMAIL" || bad "register" "$REG"

# ── 4. forgot → dry-run link returned (no RESEND_API_KEY) ───────────────────
F=$(curl -s -X POST $BASE/api/auth/forgot-password -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\"}")
RURL=$(echo "$F" | JQ "['resetUrl']")
[[ "$F" == *'"delivery":"dry-run"'* && -n "$RURL" && "$RURL" != "None" ]] \
  && ok "forgot → dry-run + resetUrl" "${RURL:0:80}…" || bad "forgot flow" "$F"
TOKEN="${RURL##*token=}"
[[ -n "$TOKEN" && "$TOKEN" != "$RURL" ]] && ok "token extracted" "${TOKEN:0:12}…" || bad "token parse" "$TOKEN"

# ── 5. email dry-run logged (logs/emails.jsonl) ─────────────────────────────
sleep 0.3
E=$(tail -20 "$PROJ/backend/logs/emails.jsonl" 2>/dev/null | grep -c "reset your password" || true)
[[ "$E" -ge 1 ]] && ok "dry-run email logged" "emails.jsonl +$E" || bad "email log missing" "grep=$E"

# ── 6. verify endpoint ──────────────────────────────────────────────────────
V=$(curl -s "$BASE/api/auth/reset-password/verify?token=$TOKEN")
[[ "$V" == *'"valid":true'* ]] && ok "verify token valid" "$V" || bad "verify valid" "$V"
V2=$(curl -s -o /tmp/q23b -w '%{http_code}' "$BASE/api/auth/reset-password/verify?token=deadbeef")
[[ "$V2" == 400 && "$(cat /tmp/q23b)" == *"invalid or has expired"* ]] && ok "verify bad token → 400" "$(cat /tmp/q23b)" || bad "verify bad" "$V2 $(cat /tmp/q23b)"

# ── 7. reset guards ─────────────────────────────────────────────────────────
S=$(curl -s -o /tmp/q23c -w '%{http_code}' -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\",\"password\":\"12345\"}")
[[ "$S" == 400 ]] && ok "short password → 400" "$(cat /tmp/q23c)" || bad "short pw" "$S $(cat /tmp/q23c)"
W=$(curl -s -o /tmp/q23d -w '%{http_code}' -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d '{"token":"deadbeef","password":"newpass99"}')
[[ "$W" == 400 ]] && ok "wrong token reset → 400" "$(cat /tmp/q23d)" || bad "wrong token" "$W $(cat /tmp/q23d)"

# ── 8. successful reset → login new ✓ / old ✗ ───────────────────────────────
RP=$(curl -s -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\",\"password\":\"newpass99\"}")
[[ "$RP" == *"Password updated"* ]] && ok "reset success" "$RP" || bad "reset" "$RP"
NL=$(curl -s -o /tmp/q23e -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"newpass99\"}")
[[ "$NL" == 200 ]] && ok "login NEW password 200" "" || bad "new login" "$NL $(cat /tmp/q23e)"
OL=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$QA_EMAIL\",\"password\":\"oldpass123\"}")
[[ "$OL" == 401 ]] && ok "login OLD password 401" "" || bad "old login should fail" "$OL"

# ── 9. single-use: token now dead ───────────────────────────────────────────
VD=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/reset-password/verify?token=$TOKEN")
RU=$(curl -s -o /tmp/q23f -w '%{http_code}' -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\",\"password\":\"again123\"}")
[[ "$VD" == 400 && "$RU" == 400 ]] && ok "token single-use (verify+reset 400)" "$(cat /tmp/q23f)" || bad "reuse" "$VD/$RU $(cat /tmp/q23f)"

# ── 10. admin-assisted customer reset (ERP) ─────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || bad "admin login" "$AD"
AU=$(curl -s -o /tmp/q23g -w '%{http_code}' -X POST $BASE/api/admin/customers/000000000000000000000000/reset-password -H "Authorization: Bearer $AT")
[[ "$AU" == 404 ]] && ok "admin reset unknown customer 404" "$(cat /tmp/q23g)" || bad "404" "$AU $(cat /tmp/q23g)"
NA=$(curl -s -o /tmp/q23h -w '%{http_code}' -X POST $BASE/api/admin/customers/x/reset-password -d '{}')
[[ "$NA" == 401 ]] && ok "admin reset unauth 401" "$(cat /tmp/q23h)" || bad "unauth" "$NA $(cat /tmp/q23h)"
CS=$(curl -s $BASE/api/admin/customers -H "Authorization: Bearer $AT")
CID=$(echo "$CS" | JQ "['items'][0]['id']")
CEMAIL=$(echo "$CS" | JQ "['items'][0]['email']")
AR=$(curl -s -X POST $BASE/api/admin/customers/$CID/reset-password -H "Authorization: Bearer $AT")
AURL=$(echo "$AR" | JQ "['resetUrl']")
[[ -n "$AURL" && "$AURL" != "None" ]] && ok "admin issued customer link" "${AURL:0:80}…" || bad "admin link" "$AR"
ATOK="${AURL##*token=}"
AV=$(curl -s "$BASE/api/auth/reset-password/verify?token=$ATOK")
[[ "$AV" == *'"valid":true'* ]] && ok "admin link verify valid" "$AV" || bad "admin verify" "$AV"
AP=$(curl -s -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$ATOK\",\"password\":\"custnew77\"}")
[[ "$AP" == *"Password updated"* ]] && ok "customer reset via admin link" "$AP" || bad "admin reset" "$AP"
CA=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d "{\"email\":\"$CEMAIL\",\"password\":\"custnew77\"}")
[[ "$CA" == 200 ]] && ok "customer login w/ new password" "" || bad "customer login" "$CA"
# issuing a second link invalidates the first (fresh issue replaces hash)
AR2=$(curl -s -X POST $BASE/api/admin/customers/$CID/reset-password -H "Authorization: Bearer $AT")
AURL2=$(echo "$AR2" | JQ "['resetUrl']"); ATOK2="${AURL2##*token=}"
VD2=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/auth/reset-password/verify?token=$ATOK")
VD3=$(curl -s "$BASE/api/auth/reset-password/verify?token=$ATOK2")
[[ "$VD2" == 400 && "$VD3" == *'"valid":true'* ]] && ok "new link invalidates old" "$VD2 vs valid" || bad "invalidate" "$VD2/$VD3"

# ── 11. admin's own forgot flow → /admin/reset-password link ────────────────
AF=$(curl -s -X POST $BASE/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit"}')
AADMIN=$(echo "$AF" | JQ "['resetUrl']")
[[ "$AADMIN" == *"/admin/reset-password?token="* ]] && ok "admin role → admin reset URL" "${AADMIN:0:75}…" || bad "admin URL" "$AF"
ATAL="${AADMIN##*token=}"
APW=$(curl -s -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$ATAL\",\"password\":\"ForgeAdmin2026\"}")
AL=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
[[ "$APW" == *"Password updated"* && "$AL" == 200 ]] && ok "admin reset→same pw→login ok" "" || bad "admin self reset" "$APW/$AL"

# ── 12. restore demo password (forge2026) ───────────────────────────────────
DF=$(curl -s -X POST $BASE/api/auth/forgot-password -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit"}')
DURL=$(echo "$DF" | JQ "['resetUrl']"); DTOK="${DURL##*token=}"
DR=$(curl -s -X POST $BASE/api/auth/reset-password -H 'Content-Type: application/json' -d "{\"token\":\"$DTOK\",\"password\":\"forge2026\"}")
DL=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"demo@forged.fit","password":"forge2026"}')
[[ "$DR" == *"Password updated"* && "$DL" == 200 ]] && ok "demo password restored" "" || bad "demo restore" "$DR/$DL"

echo "══════════════════════════════"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
exit $FAIL
