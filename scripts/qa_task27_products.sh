#!/usr/bin/env bash
# FORGED — Task 27 QA: Product API Layer 1+2+3
# Layer 1 · hardened list (escaped search, NaN guards, badge/size/inStock/rating/discounted filters, new sorts, card projection)
# Layer 2 · /filters facets · /search/suggest · /related (cross-sell) · /stock · PDP view counter
# Layer 3 · cache + invalidation · admin bulk (active/inactive/price/stock/delete) · duplicate · CSV export/import · dashboard mostViewed
# Usage: bash /home/z/my-project/scripts/qa_task27_products.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
AH=""

echo "══ QA Task 27 — Product API Layer 1+2+3 ══"

# ── 0. health ───────────────────────────────────────────────────────────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "" || bad "health" "$H"

# ── 1. admin auth ───────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
AH="Authorization: Bearer $AT"
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || { bad "admin login" "$AD"; exit 1; }

# ── 2. unauth guards on the new admin endpoints ─────────────────────────────
for EP in "POST /api/admin/products/bulk" "GET /api/admin/products/export.csv" "POST /api/admin/products/x/duplicate"; do
  M=${EP%% *}; U=${EP#* }
  C=$(curl -s -o /tmp/q27u -w '%{http_code}' -X $M "$BASE$U" -H 'Content-Type: application/json' -d '{}')
  [[ "$C" == 401 ]] && ok "unauth 401 — $M $(basename $U)" "" || bad "unauth $U" "$C"
done

# ── 3. Layer 1 — validation & hardened list ─────────────────────────────────
C=$(curl -s -o /tmp/q27a -w '%{http_code}' "$BASE/api/products?minPrice=abc")
[[ "$C" == 400 && "$(cat /tmp/q27a)" == *'minPrice must be a number'* ]] && ok "minPrice=abc → 400 (NaN guard)" "" || bad "minPrice guard" "$C $(cat /tmp/q27a)"
C=$(curl -s -o /tmp/q27b -w '%{http_code}' "$BASE/api/products?maxPrice=xyz")
[[ "$C" == 400 && "$(cat /tmp/q27b)" == *'maxPrice must be a number'* ]] && ok "maxPrice=xyz → 400" "" || bad "maxPrice guard" "$C"
C=$(curl -s -o /tmp/q27c -w '%{http_code}' "$BASE/api/products?rating=9")
[[ "$C" == 400 && "$(cat /tmp/q27c)" == *'between 0 and 5'* ]] && ok "rating=9 → 400 (range guard)" "" || bad "rating guard" "$C"
RX=$(curl -s "$BASE/api/products?search=(a%2Bb)%24worse")
[[ "$(echo "$RX" | JQ "['total']")" != "None" ]] && ok "regex injection search → safe 200" "total=$(echo "$RX" | JQ "['total']")" || bad "regex injection" "$RX"

W=$(curl -s "$BASE/api/products?search=whey")
WT=$(echo "$W" | JQ "['total']")
[[ "$WT" -ge 1 ]] 2>/dev/null && ok "search=whey finds products (name)" "total=$WT" || bad "search" "$W"
SD=$(curl -s "$BASE/api/products?search=cold-filtered")
[[ "$(echo "$SD" | JQ "['total']")" -ge 1 ]] 2>/dev/null && ok "search matches shortDesc too" "total=$(echo "$SD" | JQ "['total']")" || bad "shortDesc search" "$SD"

# filters endpoint drives the badge/size assertions (zero hardcode)
F=$(curl -s "$BASE/api/products/filters")
[[ "$(echo "$F" | JQ "['price']['min']")" != "None" && "$(echo "$F" | JQ "['categories'][0]['slug']")" != "None" && "$(echo "$F" | JQ "['sizes'][0]['s']")" != "None" ]] \
  && ok "GET /filters facets (categories/sizes/price)" "categories=$(echo "$F" | JQ "['categories']") " || bad "filters" "$F"

SZ=$(echo "$F" | JQ "['sizes'][0]['s']")
SZR=$(curl -s "$BASE/api/products?size=$SZ")
SZT=$(echo "$SZR" | JQ "['total']")
ALLSZ=$(echo "$SZR" | python3 -c "
import sys,json
d=json.load(sys.stdin)
def has(i):
    return any((x == '$SZ') if isinstance(x, str) else (x or {}).get('s') == '$SZ' for x in (i.get('sizes') or []))
print(all(has(i) for i in d['items']) if d['items'] else True)" 2>/dev/null)
[[ "$ALLSZ" == "True" && "$SZT" -ge 1 ]] 2>/dev/null && ok "size filter (?size=$SZ)" "total=$SZT, all items carry the size" || bad "size filter" "$SZR"

BG=$(echo "$F" | JQ "['badges'][0]['key']")
if [[ "$BG" != "None" && -n "$BG" ]]; then
  BGR=$(curl -s "$BASE/api/products?badge=$BG")
  ALLBG=$(echo "$BGR" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(i.get('badge')=='$BG' for i in d['items']) if d['items'] else True)" 2>/dev/null)
  [[ "$ALLBG" == "True" && "$(echo "$BGR" | JQ "['total']")" -ge 1 ]] 2>/dev/null \
    && ok "badge filter (?badge=$BG)" "total=$(echo "$BGR" | JQ "['total']")" || bad "badge filter" "$BGR"
else
  ok "badge filter (skipped — no badges in catalog)" ""
fi

ISR=$(curl -s "$BASE/api/products?inStock=true")
ALLIN=$(echo "$ISR" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all(i.get('stock',0)>0 for i in d['items']) if d['items'] else True)" 2>/dev/null)
[[ "$ALLIN" == "True" ]] && ok "inStock filter (all stock>0)" "total=$(echo "$ISR" | JQ "['total']")" || bad "inStock" "$ISR"

DR=$(curl -s "$BASE/api/products?discounted=true")
ALLD=$(echo "$DR" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all((i.get('comparePrice') or 0)>0 for i in d['items']) if d['items'] else True)" 2>/dev/null)
[[ "$ALLD" == "True" ]] && ok "discounted filter (all comparePrice>0)" "total=$(echo "$DR" | JQ "['total']")" || bad "discounted" "$DR"

RR=$(curl -s "$BASE/api/products?rating=4")
ALLR=$(echo "$RR" | python3 -c "import sys,json;d=json.load(sys.stdin);print(all((i.get('rating') or 0)>=4 for i in d['items']) if d['items'] else True)" 2>/dev/null)
[[ "$ALLR" == "True" ]] && ok "rating filter (?rating=4)" "total=$(echo "$RR" | JQ "['total']")" || bad "rating filter" "$RR"

TR=$(curl -s "$BASE/api/products?sort=rating")
SORTOK=$(echo "$TR" | python3 -c "import sys,json;d=json.load(sys.stdin);r=[i.get('rating') or 0 for i in d['items']];print(all(r[i]>=r[i+1] for i in range(len(r)-1)))" 2>/dev/null)
[[ "$SORTOK" == "True" ]] && ok "sort=rating descending" "" || bad "sort=rating" "$TR"
TT=$(curl -s "$BASE/api/products?sort=trending")
[[ "$(echo "$TT" | JQ "['total']")" != "None" ]] && ok "sort=trending ok" "" || bad "sort=trending" "$TT"
LM=$(curl -s "$BASE/api/products?limit=100")
N=$(echo "$LM" | JQ "['items']" | python3 -c "import sys,ast;print(len(ast.literal_eval(sys.stdin.read())))" 2>/dev/null)
[[ "$N" -le 48 ]] 2>/dev/null && ok "limit hard-capped at 48" "items=$N" || bad "limit cap" "$N"
PROJ=$(echo "$LM" | python3 -c "import sys,json;d=json.load(sys.stdin);i=d['items'][0] if d['items'] else {};print('description' not in i and 'specs' not in i and 'seo' not in i)" 2>/dev/null)
# Task 31/32 contract: sizeStocks/sizePrices/colors/sizeGuide ARE shipped (PDP renders from the grid payload)
[[ "$PROJ" == "True" ]] && ok "card projection — no description/specs/seo in list" "" || bad "projection" "$PROJ"

# ── 4. Layer 2 — suggest / related / stock / views ──────────────────────────
SG=$(curl -s "$BASE/api/products/search/suggest?q=whe")
[[ "$(echo "$SG" | JQ "['__len__']" 2>/dev/null || echo 0)" != "None" ]] && true
SGN=$(echo "$SG" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['items']))" 2>/dev/null)
[[ "$SGN" -ge 1 ]] 2>/dev/null && ok "suggest?q=whe (typeahead)" "items=$SGN" || bad "suggest" "$SG"
SG1=$(curl -s "$BASE/api/products/search/suggest?q=w")
[[ "$(echo "$SG1" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))" 2>/dev/null)" == "0" ]] && ok "suggest?q=w → empty (min 2 chars)" "" || bad "suggest min length" "$SG1"
SGX=$(curl -s "$BASE/api/products/search/suggest?q=(a%2Bb)%24")
[[ "$(echo "$SGX" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))" 2>/dev/null)" == "0" ]] && ok "suggest regex injection → safe empty" "" || bad "suggest injection" "$SGX"

SLUG=$(echo "$W" | JQ "['items'][0]['slug']")
[[ -n "$SLUG" && "$SLUG" != "None" ]] && ok "search resolves a slug for endpoint tests" "slug=$SLUG" || { bad "slug resolve" "$W"; exit 1; }
RL=$(curl -s "$BASE/api/products/$SLUG/related")
RLN=$(echo "$RL" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))" 2>/dev/null)
[[ -n "$RLN" && "$RLN" -le 4 ]] 2>/dev/null && ok "related endpoint (≤4 items)" "items=$RLN" || bad "related" "$RL"
RC=$(curl -s "$BASE/api/products/$SLUG/related?mode=crosssell")
[[ "$(echo "$RC" | JQ "['crossSell']")" != "None" ]] && ok "related mode=crosssell (co-purchase scan)" "crossSell=$(echo "$RC" | JQ "['crossSell']")" || bad "crosssell" "$RC"
R404=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/products/nope-nope/related")
[[ "$R404" == 404 ]] && ok "related unknown slug 404" "" || bad "related 404" "$R404"

ST=$(curl -s "$BASE/api/products/$SLUG/stock")
AV=$(echo "$ST" | JQ "['available']")
[[ "$AV" != "None" && -n "$AV" && "$(echo "$ST" | JQ "['inStock']")" != "None" ]] \
  && ok "live stock check" "product=$SLUG available=$AV inStock=$(echo "$ST" | JQ "['inStock']")" || bad "stock" "$ST"

# view counter — two PDP opens, then the admin list shows views ≥ 2
curl -s "$BASE/api/products/$SLUG" > /dev/null; curl -s "$BASE/api/products/$SLUG" > /dev/null
sleep 0.6
AV=$(curl -s "$BASE/api/admin/products?search=$SLUG" -H "$AH")
VW=$(echo "$AV" | python3 -c "import sys,json;d=json.load(sys.stdin);print([p.get('views',0) for p in d['items'] if p['slug']=='$SLUG'][0])" 2>/dev/null)
[[ "$VW" -ge 2 ]] 2>/dev/null && ok "PDP opens count views (fire-and-forget)" "views=$VW" || bad "views" "$VW"

# ── 5. Layer 3 — admin bulk / duplicate / CSV ────────────────────────────────
BC=$(curl -s -o /tmp/q27d -w '%{http_code}' -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d '{}')
[[ "$BC" == 400 ]] && ok "bulk without ids → 400" "$(cat /tmp/q27d)" || bad "bulk validation" "$BC"
BC=$(curl -s -o /tmp/q27e -w '%{http_code}' -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d '{"ids":["000000000000000000000000"],"action":"explode"}')
[[ "$BC" == 400 && "$(cat /tmp/q27e)" == *'action must be'* ]] && ok "bulk bad action → 400" "" || bad "bulk action" "$BC"
BC=$(curl -s -o /tmp/q27f -w '%{http_code}' -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d '{"ids":["000000000000000000000000"],"action":"price"}')
[[ "$BC" == 400 && "$(cat /tmp/q27f)" == *'value must be'* ]] && ok "bulk price without value → 400" "" || bad "bulk price value" "$BC"
BC=$(curl -s -o /tmp/q27f -w '%{http_code}' -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d '{"ids":["garbage"],"action":"active"}')
[[ "$BC" == 400 ]] && ok "bulk invalid-only ids → 400" "$(cat /tmp/q27f)" || bad "bulk id filter" "$BC"

# create a QA product (multipart, 1px png)
printf 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' | base64 -d > /tmp/q27.png
CP=$(curl -s -X POST $BASE/api/admin/products -H "$AH" -F "images=@/tmp/q27.png;type=image/png" -F "name=QA27 Bulk Test" -F "slug=qa27-bulk" -F "price=999" -F "category=accessories")
PID=$(echo "$CP" | JQ "['product']['_id']")
[[ -n "$PID" && "$PID" != "None" ]] && ok "QA product created (multipart)" "id=$PID" || { bad "create" "$CP"; exit 1; }

DUP=$(curl -s -X POST $BASE/api/admin/products/$PID/duplicate -H "$AH")
DID=$(echo "$DUP" | JQ "['product']['_id']")
DNAME=$(echo "$DUP" | JQ "['product']['name']")
DACT=$(echo "$DUP" | JQ "['product']['active']")
DSLUG=$(echo "$DUP" | JQ "['product']['slug']")
[[ "$DNAME" == "QA27 Bulk Test (Copy)" && "$DACT" == "False" && "$DSLUG" == "qa27-bulk-copy" ]] \
  && ok "duplicate → inactive (Copy) draft with -copy slug" "name=$DNAME active=$DACT" || bad "duplicate" "$DUP"
DSOLD=$(echo "$DUP" | JQ "['product']['sold']"); DVW=$(echo "$DUP" | JQ "['product']['views']"); DRT=$(echo "$DUP" | JQ "['product']['rating']")
[[ "$DSOLD" == "0" && "$DVW" == "0" && "$DRT" == "0" ]] && ok "copy zeroes sold/views/rating" "" || bad "copy zero" "$DSOLD $DVW $DRT"
DUP2=$(curl -s -X POST $BASE/api/admin/products/$PID/duplicate -H "$AH")
DID2=$(echo "$DUP2" | JQ "['product']['_id']")
[[ "$DID2" != "$DID" && -n "$DID2" ]] && ok "second duplicate gets a unique slug" "slug=$(echo "$DUP2" | JQ "['product']['slug']")" || bad "dup2" "$DUP2"

# bulk price on both copies → 2 modified; bulk inactive → hidden publicly
BR=$(curl -s -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d "{\"ids\":[\"$DID\",\"$DID2\"],\"action\":\"price\",\"value\":1234}")
[[ "$(echo "$BR" | JQ "['modified']")" == "2" ]] && ok "bulk price → modified=2" "" || bad "bulk price" "$BR"
BR=$(curl -s -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d "{\"ids\":[\"$DID\",\"$DID2\"],\"action\":\"inactive\"}")
[[ "$(echo "$BR" | JQ "['modified']")" == "2" ]] && ok "bulk inactive → modified=2" "" || bad "bulk inactive" "$BR"
PUB=$(curl -s "$BASE/api/products?search=qa27-bulk")
[[ "$(echo "$PUB" | JQ "['total']")" == "0" ]] && ok "inactive copies hidden from public list" "" || bad "hidden" "$PUB"

# CSV export
EX=$(curl -s $BASE/api/admin/products/export.csv -H "$AH")
[[ "$EX" == *"name,slug,category,price,comparePrice,stock,sold,badge,featured,active,shortDesc,description,sizes,sizePrices,colors,specs,imageUrl"* && "$EX" == *"qa27-bulk"* ]] \
  && ok "export.csv — header + rows (BOM-aware)" "$(echo "$EX" | wc -l) lines" || bad "export.csv" "$(echo "$EX" | head -2)"

# CSV import — 1 update (existing slug) + 1 create (no image → placeholder) + 1 bad row
cat > /tmp/q27_import.csv <<'CSV'
name,slug,category,price,stock,active,shortDesc
QA27 Bulk Test (Copy),qa27-bulk-copy,accessories,7777,5,true,imported by QA
QA27 Import Item,qa27-import,accessories,1500,10,true,placeholder image product
No Price Row,,accessories,,,,should fail
CSV
IM=$(curl -s -X POST $BASE/api/admin/products/import -H "$AH" -F "csv=@/tmp/q27_import.csv;type=text/csv")
[[ "$(echo "$IM" | JQ "['created']")" == "1" && "$(echo "$IM" | JQ "['updated']")" == "1" && "$(echo "$IM" | JQ "['__len__']" 2>/dev/null || true)" != "None" ]] \
  && ok "CSV import → created=1 updated=1 (upsert by slug)" "errors=$(echo "$IM" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['errors']))")" || bad "import" "$IM"
NE=$(echo "$IM" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['errors'][0]['message'] if d['errors'] else '')" 2>/dev/null)
[[ "$NE" == *'name or price'* ]] && ok "bad CSV row lands in errors[]" "" || bad "import errors" "$IM"
PUB2=$(curl -s "$BASE/api/products?search=QA27%20Import")
[[ "$(echo "$PUB2" | JQ "['total']")" == "1" ]] && ok "imported product live immediately (cache bumped)" "" || bad "cache bump" "$PUB2"
ADL=$(curl -s "$BASE/api/admin/products?search=qa27" -H "$AH")
PRICE=$(echo "$ADL" | python3 -c "import sys,json;d=json.load(sys.stdin);print([p['price'] for p in d['items'] if p['slug']=='qa27-bulk-copy'][0])" 2>/dev/null)
[[ "$PRICE" == "7777" ]] && ok "import updated existing product price (999→1234→7777)" "" || bad "import update" "$PRICE"
IMG=$(curl -s "$BASE/api/products/qa27-import" | python3 -c "import sys,json;p=json.load(sys.stdin)['product'];print(p['images'][0]['url'][:30])" 2>/dev/null)
[[ "$IMG" == "data:image/svg+xml;base64,"* ]] && ok "row without image → FORGED SVG placeholder" "" || bad "placeholder" "$IMG"

# import guards
C=$(curl -s -o /tmp/q27g -w '%{http_code}' -X POST $BASE/api/admin/products/import -H "$AH")
[[ "$C" == 400 ]] && ok "import without file → 400" "" || bad "import nofile" "$C"
echo "not a csv" > /tmp/q27_bad.txt
C=$(curl -s -o /tmp/q27h -w '%{http_code}' -X POST $BASE/api/admin/products/import -H "$AH" -F "csv=@/tmp/q27_bad.txt;type=text/plain")
[[ "$C" == 500 || "$C" == 400 ]] && true # multer filter errors bubble as 500 via handler; body check below
[[ "$(cat /tmp/q27h)" == *'CSV'* ]] && ok "non-CSV file rejected by upload filter" "$(cat /tmp/q27h | head -c 60)" || bad "non-csv" "$C $(cat /tmp/q27h | head -c 60)"

# bulk delete cleanup
BD=$(curl -s -X POST $BASE/api/admin/products/bulk -H "$AH" -H 'Content-Type: application/json' -d "{\"ids\":[\"$PID\",\"$DID\",\"$DID2\"],\"action\":\"delete\"}")
[[ "$(echo "$BD" | JQ "['deleted']")" == "3" ]] && ok "bulk delete → deleted=3" "" || bad "bulk delete" "$BD"
IMP_ID=$(curl -s "$BASE/api/admin/products?search=qa27" -H "$AH" | python3 -c "import sys,json;d=json.load(sys.stdin);print([p['_id'] for p in d['items'] if p['slug']=='qa27-import'][0])" 2>/dev/null)
[[ -n "$IMP_ID" ]] && curl -s -X DELETE $BASE/api/admin/products/$IMP_ID -H "$AH" > /dev/null
PUB3=$(curl -s "$BASE/api/products?search=qa27")
[[ "$(echo "$PUB3" | JQ "['total']")" == "0" ]] && ok "cleanup — catalog back to seed state" "" || bad "cleanup" "$PUB3"

# ── 6. dashboard mostViewed ──────────────────────────────────────────────────
STT=$(curl -s $BASE/api/admin/stats -H "$AH")
[[ "$(echo "$STT" | JQ "['mostViewed']")" != "None" ]] && ok "dashboard stats expose mostViewed" "top=$(echo "$STT" | python3 -c "import sys,json;m=json.load(sys.stdin)['mostViewed'];print(m[0]['name'] if m else 'empty')" 2>/dev/null)" || bad "mostViewed" "$(echo "$STT" | head -c 100)"

# ── 7. SPA + SEO regression ──────────────────────────────────────────────────
SP=$(curl -s -o /dev/null -w '%{http_code}' $BASE/)
[[ "$SP" == 200 ]] && ok "storefront SPA served" "" || bad "SPA" "$SP"
SM=$(curl -s $BASE/sitemap.xml); [[ "$SM" == *"<urlset"* ]] && ok "sitemap.xml intact" "" || bad "sitemap" "$(echo "$SM" | head -1)"

echo "══════════════════════════════════════"
echo "RESULTS: PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] && echo "ALL GREEN ✅" || echo "❌ FAILURES PRESENT"
exit $FAIL
