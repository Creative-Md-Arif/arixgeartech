#!/usr/bin/env bash
# ArixGear — Phase 2 API QA suite (v2 catalog: brands · tree · pagination · SKU · warranty)
# Usage: bash scripts/qa_phase2_api.sh [base-url]   (default http://localhost:4000)
# Assumes the in-memory mongo + seeded tech catalog (npm run mongo && npm run seed).
set -u
BASE="${1:-http://localhost:4000}"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ # check <desc> <expected> <actual>
  if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected '$2', got '$3'"; fi
}
jget(){ python3 -c "
import json,sys
d=json.load(sys.stdin)
$1
"; }

echo "── Phase 2 · API QA → $BASE ──"

# 1. health
H=$(curl -s "$BASE/api/health" | jget "print(d.get('ok'))")
check "health.ok" "True" "$H"

# 2. brands facet
R=$(curl -s "$BASE/api/brands")
check "brands.total" "18" "$(echo "$R" | jget "print(d['total'])")"
check "brands.asus.products" "2" "$(echo "$R" | jget "print([i['products'] for i in d['items'] if i['slug']=='asus'][0])")"
check "brands.featured-first" "True" "$(echo "$R" | jget "print(d['items'][0]['featured'])")"

# 3. brand detail
B=$(curl -s "$BASE/api/brands/asus")
check "brand.asus.name" "ASUS" "$(echo "$B" | jget "print(d['brand']['name'])")"
check "brand.asus.count" "2" "$(echo "$B" | jget "print(d['brand']['products'])")"

# 4. categories + branch counts
C=$(curl -s "$BASE/api/categories")
check "categories.laptops.count" "4" "$(echo "$C" | jget "print([i['productCount'] for i in d['items'] if i['slug']=='laptops'][0])")"
check "categories.ultrabooks.parent-set" "True" "$(echo "$C" | jget "print(bool([i for i in d['items'] if i['slug']=='ultrabooks'][0].get('parent')))")"

# 5. tree
T=$(curl -s "$BASE/api/categories/tree")
check "tree.roots" "11" "$(echo "$T" | jget "print(len(d['items']))")"
check "tree.laptops.children" "3" "$(echo "$T" | jget "print(len([r for r in d['items'] if r['slug']=='laptops'][0]['children']))")"

# 6. pagination
P=$(curl -s "$BASE/api/products?limit=12&page=2&sort=price-asc")
check "products.total" "40" "$(echo "$P" | jget "print(d['total'])")"
check "products.pages" "4" "$(echo "$P" | jget "print(d['pages'])")"
check "products.page2.count" "12" "$(echo "$P" | jget "print(len(d['items']))")"
check "products.page2.price-asc" "True" "$(echo "$P" | jget "print(d['items'][0]['price'] >= 4100 and d['items'][-1]['price'] >= d['items'][0]['price'])")"

# 7. branch filter (root slug → whole subtree)
check "filter.cat=laptops (branch)" "4" "$(curl -s "$BASE/api/products?cat=laptops" | jget "print(d['total'])")"
check "filter.cat=laptops,monitors (union)" "8" "$(curl -s "$BASE/api/products?cat=laptops,monitors" | jget "print(d['total'])")"
check "filter.cat=gaming-laptops (leaf)" "1" "$(curl -s "$BASE/api/products?cat=gaming-laptops" | jget "print(d['total'])")"

# 8. brand filter
check "filter.brand=asus,msi" "4" "$(curl -s "$BASE/api/products?brand=asus,msi" | jget "print(d['total'])")"
check "filter.brand+category" "2" "$(curl -s "$BASE/api/products?brand=samsung&cat=monitors,storage" | jget "print(d['total'])")"

# 9. sorts
check "sort=newest.ordering" "True" "$(curl -s "$BASE/api/products?sort=newest&limit=5" | jget "ts=[i.get('createdAt','') for i in d['items']]; print(all(ts[i]>=ts[i+1] for i in range(len(ts)-1)))")"
check "sort=trending" "True" "$(curl -s "$BASE/api/products?sort=trending&limit=5" | jget "vs=[i.get('views',0) for i in d['items']]; print(all(vs[i]>=vs[i+1] for i in range(len(vs)-1)))")"

# 10. PDP detail — brand populate + SKU + warranty + tree path
D=$(curl -s "$BASE/api/products/laptop-strix-g15")
check "pdp.brand" "ASUS" "$(echo "$D" | jget "print(d['product']['brand']['name'])")"
check "pdp.sku" "ARG-LAP-002" "$(echo "$D" | jget "print(d['product']['sku'])")"
check "pdp.warranty.months" "24" "$(echo "$D" | jget "print(d['product']['warranty']['months'])")"
check "pdp.categoryPath" "['laptops', 'gaming-laptops']" "$(echo "$D" | jget "print(d['product']['categoryPath'])")"
check "pdp.related.branch-fill" "3" "$(echo "$D" | jget "print(len(d['related']))")"
check "pdp.flash.live-price" "142900" "$(echo "$D" | jget "print(d['product']['price'])")"

# 11. facets
F=$(curl -s "$BASE/api/products/filters")
check "facets.brands.present" "True" "$(echo "$F" | jget "print(len(d.get('brands',[])) >= 8)")"
check "facets.price.bounds" "True" "$(echo "$F" | jget "print(d['price']['min'] >= 1000 and d['price']['max'] >= 150000)")"
check "facets.sizes.have-storage" "True" "$(echo "$F" | jget "print('1TB' in [s['s'] for s in d['sizes']])")"

# 12. suggest
S=$(curl -s "$BASE/api/products/search/suggest?q=rtx")
check "suggest.rtx>=1" "True" "$(echo "$S" | jget "print(len(d['items']) >= 1)")"

# 13. vertical removal
check "membership.API-dead" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/membership/plans")"
check "membership.admin-dead" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/members")" # route gone; auth gate answers first

# 14. admin — login → brands CRUD → tree CRUD → product v2 fields
# audit fix — this suite used to depend on /tmp/qa-p2.png created ad-hoc in an
# old sandbox; a fresh environment silently failed 5 checks. The fixture is
# generated here (tiny valid PNG), so the suite is self-contained.
FIX_PNG="/tmp/qa-p2-$$.png"
python3 - "$FIX_PNG" <<'PY'
import sys, struct, zlib
w=h=8
raw=b''.join(b'\x00'+bytes([120,90,240])*w for _ in range(h))
def chunk(t,d):
    c=struct.pack('>I',len(d))+t+d
    return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open(sys.argv[1],'wb').write(png)
PY
AJ=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}')
TOK=$(echo "$AJ" | jget "print(d.get('token',''))")
[ -n "$TOK" ] && ok "admin.login" || bad "admin.login — no token"
AUTH="Authorization: Bearer $TOK"

NB=$(curl -s -X POST "$BASE/api/admin/brands" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"QA Test Brand","featured":false}')
BRAND_ID=$(echo "$NB" | jget "print(d.get('brand',{}).get('_id',''))")
[ -n "$BRAND_ID" ] && ok "admin.brand.create" || bad "admin.brand.create"
check "admin.brand.update" "QA Renamed" "$(curl -s -X PUT "$BASE/api/admin/brands/$BRAND_ID" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"QA Renamed"}' | jget "print(d['brand']['name'])")"

NC=$(curl -s -X POST "$BASE/api/admin/categories" -H "$AUTH" -H 'Content-Type: application/json' -d '{"name":"QA Root","slug":"qa-root"}')
CAT_ID=$(echo "$NC" | jget "print(d.get('category',{}).get('_id',''))")
NS=$(curl -s -X POST "$BASE/api/admin/categories" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"name\":\"QA Sub\",\"slug\":\"qa-sub\",\"parent\":\"$CAT_ID\"}")
SUB_ID=$(echo "$NS" | jget "print(d.get('category',{}).get('_id',''))")
check "admin.category.sub.path" "['qa-root', 'qa-sub']" "$(echo "$NS" | jget "print(d['category']['path'])")"
CY=$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/categories/$CAT_ID" -H "$AUTH" -H 'Content-Type: application/json' -d "{\"parent\":\"$SUB_ID\"}")
check "admin.category.cycle-guard" "400" "$CY"

NP=$(curl -s -X POST "$BASE/api/admin/products" -H "$AUTH" \
  -F "name=QA Widget Pro" -F "price=999" -F "category=qa-sub" -F "brandSlug=qa-renamed" \
  -F "sku=ARG-QA-001" -F 'warranty={"months":18,"type":"seller","note":"qa"}' -F "variantLabel=Bundle" \
  -F "shortDesc=QA product" -F "images=@$FIX_PNG")
PID=$(echo "$NP" | jget "print(d.get('product',{}).get('_id',''))")
[ -n "$PID" ] && ok "admin.product.create (v2 fields)" || bad "admin.product.create"
check "admin.product.sku-set" "ARG-QA-001" "$(echo "$NP" | jget "print(d['product'].get('sku',''))")"
check "admin.product.warranty" "18" "$(echo "$NP" | jget "print(d['product']['warranty']['months'])")"
check "admin.product.catRef" "True" "$(echo "$NP" | jget "print(d['product'].get('categoryRef') is not None and d['product'].get('categoryPath')==['qa-root','qa-sub'])")"
DUP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/products" -H "$AUTH" -F "name=QA Dup" -F "price=1" -F "sku=ARG-QA-001")
check "admin.product.sku-dupe-guard" "409" "$DUP"

# cleanup QA rows
curl -s -X DELETE "$BASE/api/admin/products/$PID" -H "$AUTH" > /dev/null
curl -s -X DELETE "$BASE/api/admin/categories/$SUB_ID" -H "$AUTH" > /dev/null
curl -s -X DELETE "$BASE/api/admin/categories/$CAT_ID" -H "$AUTH" > /dev/null
curl -s -X DELETE "$BASE/api/admin/brands/$BRAND_ID" -H "$AUTH" > /dev/null
rm -f "$FIX_PNG"
ok "cleanup (QA rows removed)"

echo "── RESULT: $PASS passed · $FAIL failed ──"
[ "$FAIL" -eq 0 ] && echo "✅ PHASE 2 API QA GREEN" || { echo "❌ FAILURES PRESENT"; exit 1; }
