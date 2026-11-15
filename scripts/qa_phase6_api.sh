#!/usr/bin/env bash
# ArixGear — Phase 6 API QA suite (account pack + support/discovery endpoints).
# Covers the two net-new Phase 6 endpoints (reviews/mine, orders/my/returns),
# the account pack APIs the 6b pages call (profile/addresses/password/loyalty),
# and the public surfaces behind 6c/6d (service centers, warranty gate, brands,
# flash, discounted catalog). SPA pages themselves are exercised by the build +
# browser; this file proves the API contracts they wire to.
# Usage: bash scripts/qa_phase6_api.sh [base-url]   (default http://localhost:4000)
set -u
BASE="${1:-http://localhost:4000}"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1 ($2)"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1 — expected '$2', got '$3'"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1" "$3"; else bad "$1" "$2" "$3"; fi; }
jget(){ python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
$1
"; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "── Phase 6 · API QA → $BASE ──"

# ── auth: demo customer token ──
TOK=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"identifier":"demo@arixgear.tech","password":"arix2026"}' | jget "print(d.get('token',''))")
A="Authorization: Bearer $TOK"
check "auth.demo-token" "True" "$([ -n "$TOK" ] && echo True || echo False)"

# ── NEW: GET /api/reviews/mine ──
C=$(code -H "$A" "$BASE/api/reviews/mine")
check "reviews.mine.auth-code" "200" "$C"
R=$(curl -s -H "$A" "$BASE/api/reviews/mine")
check "reviews.mine.items-array" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list))")"
C=$(code "$BASE/api/reviews/mine")
check "reviews.mine.noauth-401" "401" "$C"

# ── NEW: GET /api/orders/my/returns ──
C=$(code -H "$A" "$BASE/api/orders/my/returns")
check "returns.mine.auth-code" "200" "$C"
R=$(curl -s -H "$A" "$BASE/api/orders/my/returns")
check "returns.mine.items-array" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list))")"
C=$(code "$BASE/api/orders/my/returns")
check "returns.mine.noauth-401" "401" "$C"

# ── account pack: my orders (JWT) ──
R=$(curl -s -H "$A" "$BASE/api/orders/my")
check "orders.my-array" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list))")"
ON=$(echo "$R" | jget "print(d['items'][0]['orderNumber'] if d['items'] else '')")
check "orders.my-has-order" "True" "$([ -n "$ON" ] && echo True || echo False)"

# owner passes the phone gate on track — seeded demo orders are GUEST rows
# (user:null), so the phone-suffix proof is the correct contract path here
PH=$(echo "$R" | jget "print((d['items'][0].get('customer') or {}).get('phone',''))")
L6=$(echo "$PH" | python3 -c "import sys,re;print(''.join(re.findall(r'\d', sys.stdin.read()))[-6:])")
C=$(code "$BASE/api/orders/track/$ON?phone=$L6")
check "orders.track.phone-proof-200" "200" "$C"

# ── profile PATCH + revert ──
NM="QA Six $(date +%s | tail -c 5)"
C=$(code -X PATCH -H "$A" -H 'Content-Type: application/json' -d "{\"name\":\"$NM\"}" "$BASE/api/auth/profile")
check "profile.patch-200" "200" "$C"
R=$(curl -s -X PATCH -H "$A" -H 'Content-Type: application/json' -d '{"name":"Demo Customer"}' "$BASE/api/auth/profile")
check "profile.revert" "Demo Customer" "$(echo "$R" | jget "print(d['user']['name'])")"

# ── address book CRUD (index contract) ──
R=$(curl -s -X POST -H "$A" -H 'Content-Type: application/json' \
  -d '{"label":"QA Lair","line":"QA Line 6, Sector 6","city":"Dhaka","division":"dhaka","postal":"1213"}' \
  "$BASE/api/auth/addresses")
check "addr.add-201" "True" "$(echo "$R" | jget "print(any(a.get('label')=='QA Lair' for a in d.get('addresses',[])))")"
IDX=$(echo "$R" | jget "print([i for i,a in enumerate(d['addresses']) if a.get('label')=='QA Lair'][0])")
R=$(curl -s -X PUT -H "$A" -H 'Content-Type: application/json' -d '{"label":"QA Lair 2"}' "$BASE/api/auth/addresses/$IDX")
check "addr.update" "QA Lair 2" "$(echo "$R" | jget "print(d['addresses'][$IDX]['label'])")"
R=$(curl -s -X DELETE -H "$A" "$BASE/api/auth/addresses/$IDX")
check "addr.delete" "True" "$(echo "$R" | jget "print(all(a.get('label')!='QA Lair 2' for a in d.get('addresses',[])))")"

# ── change-password guard (wrong current → 401; no state change) ──
C=$(code -X POST -H "$A" -H 'Content-Type: application/json' -d '{"current":"wrong-pass","next":"arix2026x"}' "$BASE/api/auth/change-password")
check "auth.changepw-wrong-401" "401" "$C"
C=$(code -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"identifier":"demo@arixgear.tech","password":"arix2026"}')
check "auth.demo-login-still-200" "200" "$C"

# ── loyalty (profile page card) ──
R=$(curl -s -H "$A" "$BASE/api/auth/loyalty")
check "loyalty.referralCode" "True" "$(echo "$R" | jget "print(bool(d.get('referralCode')))")"

# ── notifications (account page) ──
C=$(code -H "$A" "$BASE/api/notifications")
check "notif.list-200" "200" "$C"

# ── service surfaces (6d) ──
R=$(curl -s "$BASE/api/service/centers")
check "centers.items" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list))")"
C=$(code -X POST -H 'Content-Type: application/json' -d '{}' "$BASE/api/service/warranty")
check "warranty.gate-400" "400" "$C"
C=$(code "$BASE/api/service/warranty/ARG-W-NOPE?phone=01712345678")
check "warranty.lookup-404" "404" "$C"

# ── discovery surfaces (6d) ──
R=$(curl -s "$BASE/api/brands")
check "brands.total" "18" "$(echo "$R" | jget "print(d.get('total'))")"
R=$(curl -s "$BASE/api/products?discounted=true&limit=4")
check "products.discounted" "True" "$(echo "$R" | jget "print(d.get('total',0) >= 0 and isinstance(d.get('items'), list))")"
R=$(curl -s "$BASE/api/products?sort=newest&limit=4")
check "products.newest-sort" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list) and len(d['items'])<=4)")"
R=$(curl -s "$BASE/api/products?sort=popular&limit=4")
check "products.popular-sort" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list) and len(d['items'])<=4)")"
R=$(curl -s "$BASE/api/products?featured=true&limit=4")
check "products.featured-flag" "True" "$(echo "$R" | jget "print(isinstance(d.get('items'), list))")"
R=$(curl -s "$BASE/api/products/flash")
check "flash.endpoint" "True" "$(echo "$R" | jget "print('items' in d)")"

# ── spa shell served by the same port (route registry is client-side) ──
C=$(code "$BASE/login")
check "spa.served-200" "200" "$C"

echo "──"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "QA PHASE 6 · ALL GREEN" || echo "QA PHASE 6 · FAILURES PRESENT"
exit $FAIL
