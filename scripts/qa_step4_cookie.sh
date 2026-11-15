#!/usr/bin/env bash
# Step 4 Group A — cookie-auth end-to-end smoke test (runs against :4000 stack)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="http://localhost:4000"
PASS=0; FAIL=0
ck() { # name expected_substr actual
  local name="$1" exp="$2" act="$3"
  if echo "$act" | grep -q "$exp"; then echo "✓ $name"; PASS=$((PASS+1));
  else echo "✗ $name — expected [$exp] got: $(echo "$act" | head -c 220)"; FAIL=$((FAIL+1)); fi
}

echo "── booting stack ──"
pkill -f dev-mongo.js 2>/dev/null; pkill -f "node server.js" 2>/dev/null; pkill -f "backend/server.js" 2>/dev/null; sleep 1
node "$ROOT/backend/scripts/dev-mongo.js" > /tmp/mongo.log 2>&1 &
for i in $(seq 1 40); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
ss -tln | grep -q 27017 || { echo "FATAL: mongo down"; tail -3 /tmp/mongo.log; exit 1; }
(cd backend && npm run seed > /tmp/seed.log 2>&1) && echo "✓ seed" || { echo "FATAL seed"; tail -5 /tmp/seed.log; exit 1; }
(cd backend && PORT=4000 node server.js > /tmp/api4000.log 2>&1) &
for i in $(seq 1 30); do curl -sf -m 2 "$BASE/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "$BASE/api/health" >/dev/null || { echo "FATAL: api down"; tail -8 /tmp/api4000.log; exit 1; }
echo "✓ api up"

echo "── 1. login sets HttpOnly cookie ──"
RESP=$(curl -s -D - -o /tmp/login_body.json -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"demo@arixgear.tech","password":"arix2026"}')
ck "login 200" '"token"' "$(cat /tmp/login_body.json | head -c 400)"
SETC=$(echo "$RESP" | grep -i '^set-cookie:' | head -1)
ck "Set-Cookie present" 'arix_session=' "$SETC"
ck "HttpOnly flag" 'HttpOnly' "$SETC"
ck "SameSite=Lax" 'SameSite=Lax' "$SETC"
ck "Path=/" 'Path=/' "$SETC"
ck "NOT Secure in dev" "0" "$(echo "$SETC" | grep -ci secure)"

COOKIE=$(echo "$SETC" | sed 's/^[Ss]et-[Cc]ookie: //' | cut -d';' -f1 | tr -d '\r')

echo "── 2. cookie-only /me (no Bearer) ──"
ME=$(curl -s "$BASE/api/auth/me" -H "Cookie: $COOKIE")
ck "cookie-only me returns user" '"email":"demo@arixgear.tech"' "$ME"

echo "── 3. Bearer still works (dual mode) ──"
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync('/tmp/login_body.json','utf8')).token)")
ME2=$(curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")
ck "bearer me returns user" '"email":"demo@arixgear.tech"' "$ME2"

echo "── 4. logout clears cookie ──"
LO_H=$(curl -s -D - -o /tmp/lo_body.json -X POST "$BASE/api/auth/logout" -H "Cookie: $COOKIE" -H "Origin: http://localhost:4000")
ck "logout 200" '"message":"Logged out"' "$(cat /tmp/lo_body.json)"
ck "logout clears cookie" 'Max-Age=0' "$(echo "$LO_H" | grep -i '^set-cookie:' | head -1)"

echo "── 5. CSRF: cookie + cross-origin POST → 403 ──"
AT=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/addresses" \
  -H "Cookie: $COOKIE" -H "Origin: http://evil.example" -H 'Content-Type: application/json' -d '{"label":"x"}')
ck "cross-origin cookie POST blocked (403)" '403' "$AT"

echo "── 6. CSRF: cookie + missing Origin → 403 ──"
AT2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/addresses" \
  -H "Cookie: $COOKIE" -H 'Content-Type: application/json' -d '{"label":"x"}')
ck "no-origin cookie POST blocked (403)" '403' "$AT2"

echo "── 7. CSRF: same-origin cookie POST → allowed ──"
AT3=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/auth/addresses" \
  -H "Cookie: $COOKIE" -H "Origin: http://localhost:4000" -H 'Content-Type: application/json' \
  -d '{"label":"Home","city":"Dhaka","line":"Test St","phone":"01712345678"}')
ck "same-origin cookie POST allowed" '201\|200' "$AT3"

echo "── 8. CSP header on HTML shells ──"
H1=$(curl -s -D - -o /dev/null "$BASE/")
ck "CSP header on storefront" 'Content-Security-Policy' "$(echo "$H1" | grep -i 'content-security' | head -1)"
ck "frame-ancestors none" "frame-ancestors 'none'" "$(echo "$H1" | grep -i content-security)"
ck "XFO DENY" 'X-Frame-Options: DENY' "$(echo "$H1" | grep -i x-frame)"
H2=$(curl -s -D - -o /dev/null "$BASE/admin/")
ck "CSP on admin shell" 'Content-Security-Policy' "$(echo "$H2" | grep -i content-security | head -1)"
H3=$(curl -s -D - -o /dev/null "$BASE/api/health")
ck "NO CSP on API JSON" "clean" "$(echo "$H3" | grep -ci content-security | sed 's/^0$/clean/')"

echo "── 9. admin login sets cookie too ──"
R2=$(curl -s -D - -o /dev/null -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}')
ck "admin Set-Cookie" 'arix_session=' "$(echo "$R2" | grep -i '^set-cookie:')"

echo ""
echo "═══ Group A smoke: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
