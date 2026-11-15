#!/bin/bash
# Task 39 QA — sub-admin roles + audit trail + team management (API level)
B=http://localhost:5000/api
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✓ $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  ✗ $1  →  ${2:-}"; }
expect(){ # desc expected actual
  if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (want $2 got $3)" "${4:-}"; fi
}
jqt(){ python3 -c "import sys,json; d=json.load(sys.stdin); print(d$1)" 2>/dev/null; }

echo "— logins —"
SA=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
SAT=$(echo "$SA" | jqt "['token']")
expect "super admin login" "admin" "$(echo "$SA" | jqt "['user']['role']")"

SB=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"manager@forged.fit","password":"ForgeSub2026"}')
SBT=$(echo "$SB" | jqt "['token']")
expect "sub-admin login (seed)" "sub_admin" "$(echo "$SB" | jqt "['user']['role']")"
expect "sub-admin permissions present" "7" "$(echo "$SB" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['user']['permissions']))")"
expect "sub-admin lastLoginAt stamped" "True" "$(echo "$SB" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['user']['lastLoginAt'] is not None)")"

WRONG=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"manager@forged.fit","password":"wrong-pass"}')
expect "failed sub-admin login → 401" "401" "$WRONG"

echo "— sub-admin permission matrix —"
expect "GET /orders (orders.view ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/orders -H "Authorization: Bearer $SBT")"
OID=$(curl -s "$B/admin/orders?limit=1" -H "Authorization: Bearer $SAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['_id'] if d.get('items') else '')")
expect "GET /orders/:id (orders.view ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/orders/$OID -H "Authorization: Bearer $SBT")"
expect "GET /stats (dashboard.view ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/stats -H "Authorization: Bearer $SBT")"
expect "GET /products (products.view ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/products -H "Authorization: Bearer $SBT")"
expect "GET /returns (returns.view ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/returns -H "Authorization: Bearer $SBT")"
expect "GET /messages (messages.manage ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/messages -H "Authorization: Bearer $SBT")"
expect "GET /coupons (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/coupons -H "Authorization: Bearer $SBT")"
expect "GET /settings (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/settings -H "Authorization: Bearer $SBT")"
expect "GET /customers (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/customers -H "Authorization: Bearer $SBT")"
expect "GET /banners (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/banners -H "Authorization: Bearer $SBT")"
expect "GET /reviews (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/reviews -H "Authorization: Bearer $SBT")"
expect "GET /members (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/members -H "Authorization: Bearer $SBT")"
expect "GET /seo (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/seo -H "Authorization: Bearer $SBT")"
expect "GET /reports/sales (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/reports/sales" -H "Authorization: Bearer $SBT")"
expect "GET /team (superOnly ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/team -H "Authorization: Bearer $SBT")"
expect "GET /audit (superOnly ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/audit -H "Authorization: Bearer $SBT")"

# orders.manage allowed mutation: pick an order id and patch status to same value
OID=$(curl -s "$B/admin/orders?limit=1" -H "Authorization: Bearer $SAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['items'][0]['_id'] if d.get('items') else '')")
CUR=$(curl -s "$B/admin/orders/$OID" -H "Authorization: Bearer $SAT" | jqt "['order']['status']")
expect "PATCH /orders/:id/status (orders.manage ✓)" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PATCH "$B/admin/orders/$OID/status" -H "Authorization: Bearer $SBT" -H 'Content-Type: application/json' -d "{\"status\":\"$CUR\"}")"
expect "POST /coupons (no perm ✗)" "403" "$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/admin/coupons -H "Authorization: Bearer $SBT" -H 'Content-Type: application/json' -d '{"code":"X","percent":5}')"

echo "— team CRUD (super) —"
CAT=$(curl -s $B/admin/team/permissions -H "Authorization: Bearer $SAT")
expect "catalog groups" "4" "$(echo "$CAT" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['groups']))")"
expect "catalog rejects unauth sub" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/team/permissions -H "Authorization: Bearer $SBT")"

NEW=$(curl -s -X POST $B/admin/team -H "Authorization: Bearer $SAT" -H 'Content-Type: application/json' -d '{"name":"Content Editor","email":"editor@forged.fit","password":"ForgeEd2026","permissions":["dashboard.view","products.view","products.manage","content.manage"]}')
NID=$(echo "$NEW" | jqt "['user']['id']")
expect "create sub-admin" "Content Editor" "$(echo "$NEW" | jqt "['user']['name']")"
DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/admin/team -H "Authorization: Bearer $SAT" -H 'Content-Type: application/json' -d '{"name":"Dup","email":"editor@forged.fit","password":"ForgeEd2026","permissions":[]}')
expect "duplicate email → 409" "409" "$DUP"
BADP=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/admin/team -H "Authorization: Bearer $SAT" -H 'Content-Type: application/json' -d '{"name":"Bad","email":"bad@forged.fit","password":"ForgeEd2026","permissions":["orders.view","hax.pwn"]}')
expect "unknown permission → 400" "400" "$BADP"

ED=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"editor@forged.fit","password":"ForgeEd2026"}')
EDT=$(echo "$ED" | jqt "['token']")
expect "new sub-admin can login" "sub_admin" "$(echo "$ED" | jqt "['user']['role']")"
expect "editor GET /products ✓" "200" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/products -H "Authorization: Bearer $EDT")"
expect "editor GET /orders ✗" "403" "$(curl -s -o /dev/null -w '%{http_code}' $B/admin/orders -H "Authorization: Bearer $EDT")"

UPD=$(curl -s -X PUT $B/admin/team/$NID -H "Authorization: Bearer $SAT" -H 'Content-Type: application/json' -d '{"active":false}')
expect "deactivate sub-admin" "False" "$(echo "$UPD" | jqt "['user']['active']")"
DEAD=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"editor@forged.fit","password":"ForgeEd2026"}')
expect "disabled login → 403" "403" "$DEAD"
DEADAPI=$(curl -s -o /dev/null -w '%{http_code}' $B/admin/products -H "Authorization: Bearer $EDT")
expect "disabled token → 403" "403" "$DEADAPI"
REAN=$(curl -s -X PUT $B/admin/team/$NID -H "Authorization: Bearer $SAT" -H 'Content-Type: application/json' -d '{"active":true,"password":"ForgeEd99"}' )
expect "reactivate + password" "True" "$(echo "$REAN" | jqt "['user']['active']")"
RELOGIN=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"editor@forged.fit","password":"ForgeEd99"}')
expect "login with new password" "200" "$RELOGIN"

DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $B/admin/team/$NID -H "Authorization: Bearer $SAT")
expect "delete sub-admin" "200" "$DEL"
GONE=$(curl -s -o /dev/null -w '%{http_code}' -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"editor@forged.fit","password":"ForgeEd99"}')
expect "deleted cannot login" "401" "$GONE"

echo "— audit trail —"
AUD=$(curl -s "$B/admin/audit?limit=50" -H "Authorization: Bearer $SAT")
expect "audit has login entry" "login" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['action']=='login'),'NONE'))")"
expect "audit has login-failed" "login-failed" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['action']=='login-failed'),'NONE'))")"
expect "audit has team.create" "team.create" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['action']=='team.create'),'NONE'))")"
expect "audit has team.update" "team.update" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['action']=='team.update'),'NONE'))")"
expect "audit has team.delete" "team.delete" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['action']=='team.delete'),'NONE'))")"
expect "audit has order status update" "update" "$(echo "$AUD" | python3 -c "import sys,json; d=json.load(sys.stdin); print(next((i['action'] for i in d['items'] if i['route'].endswith('/status') and i['actorRole']=='sub_admin'),'NONE'))")"
expect "audit redacts passwords" "True" "$(echo "$AUD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
leak=[i for i in d['items'] if isinstance(i.get('body'),dict) and any('Forge' in str(v) for k,v in i['body'].items() if 'pass' in k.lower())]
print(not leak)")"
expect "audit actor captured (sub)" "True" "$(echo "$AUD" | python3 -c "
import sys,json
d=json.load(sys.stdin)
subs=[i['actorEmail'] for i in d['items'] if i['actorRole']=='sub_admin']
print(bool(subs) and all(s in ('manager@forged.fit','editor@forged.fit') for s in subs))")"
FACETS=$(echo "$AUD" | python3 -c "import sys,json; print(len(json.load(sys.stdin)['facets']['actions']))")
[ "$FACETS" -ge 5 ] 2>/dev/null && ok "action facets ≥5 ($FACETS)" || bad "action facets" "$FACETS"
ST=$(curl -s $B/admin/audit/stats -H "Authorization: Bearer $SAT")
expect "audit stats byDay present" "True" "$(echo "$ST" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('byDay',[]))>=1)")"

echo
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
