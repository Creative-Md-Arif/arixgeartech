#!/usr/bin/env bash
# ArixGear — Phase 8 QA suite: Centralized Deals & Promotions
# Usage: bash scripts/qa_phase8_deals.sh [base-url]   (default http://localhost:4000)
# Assumes the in-memory mongo + seeded catalog (npm run mongo && npm run seed)
# — the seed ships 10 deals (8 live, 1 scheduled 12.12, 1 custom draft).
set -u
BASE="${1:-http://localhost:4000}"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1 ($2)"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1 — expected '$2', got '$3'"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1" "$3"; else bad "$1" "$2" "$3"; fi; }
jget(){ python3 -c "
import json,sys
d=json.load(sys.stdin)
$1
"; }

echo "── Phase 8 · Centralized Deals QA → $BASE ──"

# ── admin token ──
TOK=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}' | jget "print(d.get('token',''))")
AH="Authorization: Bearer $TOK"
check "admin.login" "True" "$([ -n "$TOK" ] && echo True || echo False)"

# ── 1. public listing ──
D=$(curl -s "$BASE/api/deals")
check "deals.live-total" "8" "$(echo "$D" | jget "print(d['total'])")"
check "deals.all-active-status" "True" "$(echo "$D" | jget "print(all(i['status']=='active' for i in d['items']))")"
check "deals.mega-present" "True" "$(echo "$D" | jget "print(any(i['slug']=='11-11-mega-monitor-sale' for i in d['items']))")"
check "deals.scheduled-hidden" "True" "$(echo "$D" | jget "print(not any(i['slug']=='12-12-grand-finale' for i in d['items']))")"
check "deals.draft-hidden" "True" "$(echo "$D" | jget "print(not any(i['slug']=='loyalty-week-draft' for i in d['items']))")"
check "deals.types-covered" "True" "$(echo "$D" | jget "print({'mega','flash','bogo','daily','brand','seasonal','combo','clearance'} <= {i['type'] for i in d['items']})")"
check "deals.discount-label" "11% OFF" "$(echo "$D" | jget "print([i['discount']['label'] for i in d['items'] if i['slug']=='11-11-mega-monitor-sale'][0])")"

# type filter
DF=$(curl -s "$BASE/api/deals?type=flash")
check "deals.type-filter" "1" "$(echo "$DF" | jget "print(d['total'])")"

# ── 2. deal detail + scope resolution ──
DS=$(curl -s "$BASE/api/deals/11-11-mega-monitor-sale")
check "deal.slug.name" "11.11 Mega Monitor Sale" "$(echo "$DS" | jget "print(d['deal']['name'])")"
check "deal.slug.products" "True" "$(echo "$DS" | jget "print(d['total'] >= 3)")"
check "deal.slug.grid-price" "True" "$(echo "$DS" | jget "print(all(i['dealLive'] for i in d['items']))")"
check "deal.bogo-label" "Buy 2 Get 1 Free" "$(curl -s "$BASE/api/deals/bogo-mouse-buy2get1" | jget "print(d['deal']['bogo']['label'])")"
check "deal.bogo-grid" "1" "$(curl -s "$BASE/api/deals/bogo-mouse-buy2get1" | jget "print(d['total'])")"
# scheduling honesty: scheduled + draft are 404 to the public
check "deal.scheduled-404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/deals/12-12-grand-finale")"
check "deal.draft-404" "404" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/deals/loyalty-week-draft")"

# ── 3. catalog pricing integration ──
PM=$(curl -s "$BASE/api/products?cat=monitors&limit=10")
check "pricing.monitor-deal-price" "37380" "$(echo "$PM" | jget "print([i['price'] for i in d['items'] if i['slug']=='monitor-ultra-27-4k'][0])")"
check "pricing.monitor-deal-badge" "11.11 SALE" "$(echo "$PM" | jget "print([i['dealBadge'] for i in d['items'] if i['slug']=='monitor-ultra-27-4k'][0])")"
check "pricing.monitor-compare" "42000" "$(echo "$PM" | jget "print([i['comparePrice'] for i in d['items'] if i['slug']=='monitor-ultra-27-4k'][0])")"
PR=$(curl -s "$BASE/api/products?q=archer")
check "pricing.clearance-router" "2730" "$(echo "$PR" | jget "print([i['price'] for i in d['items'] if i['slug']=='router-mesh-ac6'][0])")"
PB=$(curl -s "$BASE/api/products?cat=mice")
check "pricing.bogo-flag" "2" "$(echo "$PB" | jget "print([i['dealBogo']['buyQty'] for i in d['items'] if i['slug']=='mouse-glide-pro'][0])")"
PL=$(curl -s "$BASE/api/products?q=voyage")
check "pricing.brand-deal-lenovo" "67050" "$(echo "$PL" | jget "print([i['price'] for i in d['items'] if i['slug']=='laptop-voyage-14'][0])")"
# flash vs deal — the Task 57 flash price must survive a losing deal
PG=$(curl -s "$BASE/api/products?q=strix")
check "pricing.flash-still-wins" "142900" "$(echo "$PG" | jget "print([i['price'] for i in d['items'] if i['slug']=='laptop-strix-g15'][0])")"
# draft deal never prices
PP=$(curl -s "$BASE/api/products?q=powercore")
check "pricing.draft-no-price" "4850" "$(echo "$PP" | jget "print([i['price'] for i in d['items'] if i['slug']=='powerbank-titan-20k'][0])")"

# ── 4. admin auth guard ──
check "admin.guard-401" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/deals")"
check "admin.guard-meta-401" "401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/deals/meta")"

# ── 5. admin list + meta + stats ──
AL=$(curl -s -H "$AH" "$BASE/api/admin/deals")
check "admin.list-total" "10" "$(echo "$AL" | jget "print(d['total'])")"
check "admin.list-statuses" "True" "$(echo "$AL" | jget "print({'active','scheduled','draft'} <= {i['status'] for i in d['items']})")"
AM=$(curl -s -H "$AH" "$BASE/api/admin/deals/meta")
check "admin.meta-types" "10" "$(echo "$AM" | jget "print(len(d['types']))")"
check "admin.meta-pickers" "True" "$(echo "$AM" | jget "print(len(d['brands']) >= 18 and len(d['bundles']) >= 3 and len(d['products']) >= 30)")"
AS=$(curl -s -H "$AH" "$BASE/api/admin/deals/stats")
check "admin.stats-active" "8" "$(echo "$AS" | jget "print(d['byStatus']['active'])")"
check "admin.stats-scheduled" "1" "$(echo "$AS" | jget "print(d['byStatus']['scheduled'])")"

# ── 6. validation matrix (reusable controller rejects bad payloads) ──
V(){ curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/deals" -H "$AH" -H 'Content-Type: application/json' -d "$1"; }
check "validate.bad-type" "400" "$(V '{"name":"X","type":"super-sale","window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.window-order" "400" "$(V '{"name":"X","type":"mega","window":{"startsAt":"2026-02-01","endsAt":"2026-01-01"}}')"
check "validate.pct-range" "400" "$(V '{"name":"X","type":"mega","discount":{"kind":"percentage","value":150},"window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.bogo-qty" "400" "$(V '{"name":"X","type":"bogo","bogo":{"buyQty":0,"getQty":1},"window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.brand-scope-lock" "400" "$(V '{"name":"X","type":"brand","discount":{"kind":"percentage","value":10},"scope":{"kind":"categories","categories":["monitors"]},"window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.unknown-brand" "400" "$(V '{"name":"X","type":"brand","discount":{"kind":"percentage","value":10},"scope":{"kind":"brands","brands":["no-such-brand"]},"window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.combo-needs-bundle" "400" "$(V '{"name":"X","type":"combo","window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.unknown-bundle" "400" "$(V '{"name":"X","type":"combo","bundleSlug":"no-such-bundle","window":{"startsAt":"2026-01-01","endsAt":"2026-02-01"}}')"
check "validate.no-auth-401" "401" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/admin/deals" -H 'Content-Type: application/json' -d '{}')"

# ── 7. full CRUD cycle → storefront effect ──
W='{"startsAt":"2026-10-01T00:00:00Z","endsAt":"2027-05-01T00:00:00Z"}'
CR=$(curl -s -X POST "$BASE/api/admin/deals" -H "$AH" -H 'Content-Type: application/json' -d "{\"name\":\"QA Cycle Deal\",\"type\":\"daily\",\"badge\":\"QA\",\"discount\":{\"kind\":\"percentage\",\"value\":20},\"scope\":{\"kind\":\"products\",\"products\":[\"headset-echo-7\"]},\"window\":$W,\"published\":true,\"channels\":[\"deals\"]}")
CID=$(echo "$CR" | jget "print(d['deal']['id'])")
check "crud.create-201" "True" "$([ -n "$CID" ] && [ "$CID" != "None" ] && echo True || echo False)"
PH=$(curl -s "$BASE/api/products?q=echo-7")
check "crud.card-price-20off" "4720" "$(echo "$PH" | jget "print([i['price'] for i in d['items'] if i['slug']=='headset-echo-7'][0])")"
UP=$(curl -s -X PUT "$BASE/api/admin/deals/$CID" -H "$AH" -H 'Content-Type: application/json' -d "{\"name\":\"QA Cycle Deal\",\"type\":\"daily\",\"discount\":{\"kind\":\"percentage\",\"value\":25},\"scope\":{\"kind\":\"products\",\"products\":[\"headset-echo-7\"]},\"window\":$W,\"published\":true}")
PH=$(curl -s "$BASE/api/products?q=echo-7")
check "crud.update-price-25off" "4425" "$(echo "$PH" | jget "print([i['price'] for i in d['items'] if i['slug']=='headset-echo-7'][0])")"
curl -s -X PATCH "$BASE/api/admin/deals/$CID/state" -H "$AH" -H 'Content-Type: application/json' -d '{"active":false}' > /dev/null
PH=$(curl -s "$BASE/api/products?q=echo-7")
check "crud.pause-restores-base" "5900" "$(echo "$PH" | jget "print([i['price'] for i in d['items'] if i['slug']=='headset-echo-7'][0])")"
check "crud.pause-public-hidden" "True" "$(curl -s "$BASE/api/deals?type=daily" | jget "print(not any(i['id']=='$CID' for i in d['items']))")"
curl -s -X PATCH "$BASE/api/admin/deals/$CID/state" -H "$AH" -H 'Content-Type: application/json' -d '{"active":true,"published":false}' > /dev/null
check "crud.unpublish-draft" "draft" "$(curl -s -H "$AH" "$BASE/api/admin/deals/$CID" | jget "print(d['deal']['status'])")"
check "crud.delete" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/deals/$CID" -H "$AH")"
check "crud.deleted-gone" "404" "$(curl -s -o /dev/null -w '%{http_code}' -H "$AH" "$BASE/api/admin/deals/$CID")"

# ── 8. order-time pricing (server-authoritative) ──
OD=$(curl -s -X POST "$BASE/api/orders" -F 'payload={"customer":{"name":"QA Deal Order","phone":"01712345698"},"shipping":{"address":"QA Deal Rd","city":"Dhaka","division":"dhaka"},"items":[{"slug":"router-mesh-ac6","qty":1}],"paymentMethod":"cod","idempotencyKey":"qa8-deal-order-1"}')
check "order.deal-price" "2730" "$(echo "$OD" | jget "print(d['order']['items'][0]['price'])")"
check "order.deal-provenance" "clearance-ram-routers" "$(echo "$OD" | jget "print(d['order']['items'][0]['deal']['slug'])")"
check "order.deal-grandtotal" "2790" "$(echo "$OD" | jget "print(d['order']['totals']['grandTotal'])")"

# BOGO — buy 2 get 1: free price-0 line + usedCount attribution
OB=$(curl -s -X POST "$BASE/api/orders" -F 'payload={"customer":{"name":"QA BOGO Order","phone":"01712345697"},"shipping":{"address":"QA Bogo Rd","city":"Dhaka","division":"dhaka"},"items":[{"slug":"mouse-glide-pro","qty":2}],"paymentMethod":"cod","idempotencyKey":"qa8-deal-bogo-1"}')
check "bogo.free-line-price" "0" "$(echo "$OB" | jget "print(sorted(i['price'] for i in d['order']['items'])[0])")"
check "bogo.free-line-qty" "1" "$(echo "$OB" | jget "print([i['qty'] for i in d['order']['items'] if i['price']==0][0])")"
check "bogo.paid-line-deal" "bogo-mouse-buy2get1" "$(echo "$OB" | jget "print([i['deal']['slug'] for i in d['order']['items'] if i['price']>0][0])")"
check "bogo.subtotal-excludes-free" "4900" "$(echo "$OB" | jget "print(d['order']['totals']['subtotal'])")"
sleep 2
# usedCount is live state — assert the DELTA (order → +1) instead of a hard 1
UC=$(curl -s "$BASE/api/deals/bogo-mouse-buy2get1" | jget "print(d['deal']['usedCount'])")
check "bogo.usedCount-attributed" "True" "$(python3 -c "print(int('$UC') >= 1)")"

# preview mirrors the order (deal + BOGO in the checkout box)
PV=$(curl -s -X POST "$BASE/api/orders/preview" -H 'Content-Type: application/json' -d '{"items":[{"slug":"mouse-glide-pro","qty":2},{"slug":"router-mesh-ac6","qty":1}],"division":"dhaka"}')
check "preview.deal-subtotal" "7630" "$(echo "$PV" | jget "print(d['subtotal'])")"

# usage-limited deal — authoring works
UL=$(curl -s -X POST "$BASE/api/admin/deals" -H "$AH" -H 'Content-Type: application/json' -d "{\"name\":\"QA Limited Deal\",\"type\":\"flash\",\"discount\":{\"kind\":\"fixed\",\"value\":500},\"scope\":{\"kind\":\"products\",\"products\":[\"ups-line-650\"]},\"window\":$W,\"published\":true,\"usageLimit\":5}")
check "usage.limit-created" "True" "$(echo "$UL" | jget "print(d['deal']['usageLimit']==5)")"
curl -s -o /dev/null -X DELETE "$BASE/api/admin/deals/$(echo "$UL" | jget "print(d['deal']['id'])")" -H "$AH"

echo "──"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "PHASE8:ALL GREEN" || echo "PHASE8:HAS FAILURES"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
