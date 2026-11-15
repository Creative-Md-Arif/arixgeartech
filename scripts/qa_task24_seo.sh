#!/usr/bin/env bash
# FORGED — Task 24 QA: Centralized SEO Management System
# Covers: public /api/seo, admin CRUD (page meta + site), robots.txt, sitemap.xml,
#         schema validation, guards, regressions.
# Usage: bash /home/z/my-project/scripts/qa_task24_seo.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 24 — SEO Management ══"

# ── 0. regressions ──────────────────────────────────────────────────────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "" || bad "health" "$H"
P=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/products?limit=1"); [[ "$P" == 200 ]] && ok "products 200" "" || bad "products" "$P"

# ── 1. public /api/seo ──────────────────────────────────────────────────────
S=$(curl -s $BASE/api/seo)
N=$(echo "$S" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['pages']))" 2>/dev/null)
[[ "$N" == 10 && "$S" == *'"gscVerification"'* && "$S" == *'"productSchema"'* ]] \
  && ok "public /api/seo (10 pages + site)" "pages=$N" || bad "public seo" "pages=$N"
HT=$(echo "$S" | JQ "['pages']['home']['metaTitle']")
[[ "$HT" == FORGED* ]] && ok "home default title seeded" "${HT:0:50}" || bad "home title" "$HT"
CR=$(echo "$S" | JQ "['pages']['checkout']['metaRobots']")
[[ "$CR" == "noindex, nofollow" ]] && ok "checkout noindex default" "$CR" || bad "checkout robots" "$CR"

# ── 2. robots.txt ───────────────────────────────────────────────────────────
R=$(curl -s $BASE/robots.txt)
[[ "$R" == *"User-agent: *"* && "$R" == *"Disallow: /admin"* && "$R" == *"Sitemap: "* ]] \
  && ok "robots.txt served (default)" "$(echo "$R" | head -1)" || bad "robots" "$R"
CT=$(curl -s -o /dev/null -w '%{content_type}' $BASE/robots.txt)
[[ "$CT" == text/plain* ]] && ok "robots content-type text/plain" "$CT" || bad "robots ct" "$CT"

# ── 3. sitemap.xml ──────────────────────────────────────────────────────────
X=$(curl -s $BASE/sitemap.xml)
[[ "$X" == *"<urlset"* && "$X" == *"<loc>$BASE/</loc>"* && "$X" == *"<loc>$BASE/shop</loc>"* ]] \
  && ok "sitemap.xml served (static pages)" "$(echo "$X" | grep -c '<url>') urls" || bad "sitemap" "$(echo "$X" | head -3)"
echo "$X" | grep -q "$BASE/checkout" && bad "noindex page in sitemap" "checkout present" || ok "noindex pages excluded" "checkout absent"
echo "$X" | grep -q "$BASE/account" && bad "noindex page in sitemap" "account present" || ok "noindex pages excluded" "account absent"
CT=$(curl -s -o /dev/null -w '%{content_type}' $BASE/sitemap.xml)
[[ "$CT" == application/xml* || "$CT" == text/xml* ]] && ok "sitemap content-type xml" "$CT" || bad "sitemap ct" "$CT"

# ── 4. admin auth ───────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || bad "admin login" "$AD"
NA=$(curl -s -o /tmp/q24a -w '%{http_code}' $BASE/api/admin/seo)
[[ "$NA" == 401 ]] && ok "admin seo unauth 401" "$(cat /tmp/q24a)" || bad "unauth" "$NA $(cat /tmp/q24a)"

# ── 5. admin list ───────────────────────────────────────────────────────────
L=$(curl -s $BASE/api/admin/seo -H "Authorization: Bearer $AT")
LP=$(echo "$L" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['pages']))")
[[ "$LP" == 10 && "$L" == *'"robotsTxt"'* ]] && ok "admin list (10 pages + site doc)" "" || bad "admin list" "pages=$LP"

# ── 6. page update ──────────────────────────────────────────────────────────
U=$(curl -s -X PUT $BASE/api/admin/seo/pages/about -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
  "metaTitle":"About Us — The FORGED Story","metaDescription":"Our story <script>alert(1)</script> cleaned",
  "metaKeywords":"about, forged, story","canonicalUrl":"https://forged.fit/about","metaRobots":"index, follow",
  "og":{"title":"About OG","description":"OG desc","image":"/assets/cat-apparel.png","type":"website"},
  "twitter":{"title":"About TW","description":"TW desc","image":"","card":"summary"},
  "customSchema":"{\"@context\":\"https://schema.org\",\"@type\":\"AboutPage\",\"name\":\"About FORGED\"}"}')
T=$(echo "$U" | JQ "['page']['metaTitle']"); D=$(echo "$U" | JQ "['page']['metaDescription']")
[[ "$T" == "About Us — The FORGED Story" ]] && ok "page update saved" "$T" || bad "page update" "$U"
[[ "$D" == *"script"* && "$D" != *"<script>"* ]] && ok "meta sanitized (angle brackets stripped)" "$D" || bad "sanitize" "$D"
V=$(curl -s $BASE/api/seo | JQ "['pages']['about']['metaTitle']")
[[ "$V" == "About Us — The FORGED Story" ]] && ok "public API reflects update" "" || bad "public update" "$V"

# invalid pageKey
IP=$(curl -s -o /tmp/q24b -w '%{http_code}' -X PUT $BASE/api/admin/seo/pages/nope -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"metaTitle":"x"}')
[[ "$IP" == 400 ]] && ok "unknown pageKey 400" "$(cat /tmp/q24b)" || bad "pageKey" "$IP $(cat /tmp/q24b)"

# invalid schema JSON
IS=$(curl -s -o /tmp/q24c -w '%{http_code}' -X PUT $BASE/api/admin/seo/pages/shop -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"metaTitle":"Shop","customSchema":"{not json}"}')
[[ "$IS" == 400 && "$(cat /tmp/q24c)" == *"valid JSON"* ]] && ok "invalid schema JSON 400" "$(cat /tmp/q24c)" || bad "schema check" "$IS $(cat /tmp/q24c)"

# robots directive validation
IR=$(curl -s -o /tmp/q24d -w '%{http_code}' -X PUT $BASE/api/admin/seo/pages/shop -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"metaRobots":"index, follow <evil>"}')
[[ "$IR" == 400 ]] && ok "invalid robots directive 400" "$(cat /tmp/q24d)" || bad "robots validation" "$IR $(cat /tmp/q24d)"

# ── 7. site update (schema + sitemap extra URLs) ────────────────────────────
SU=$(curl -s -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
  "siteUrl":"https://forged.fit","titleTemplate":"%s | FORGED.","brandName":"FORGED.","twitterHandle":"@forgedfit",
  "defaultOgImage":"","gscVerification":"test-code-123",
  "org":{"enabled":true,"name":"FORGED.","logo":"/assets/athlete-1.png","phone":"01712-345678","address":"Banani, Dhaka","sameAs":"https://facebook.com/forgedfit\nhttps://instagram.com/forgedfit"},
  "productSchema":true,"breadcrumbSchema":true,
  "sitemap":{"includeStatic":true,"includeCategories":true,"extraUrls":[{"path":"/landing/ramadan","changefreq":"daily","priority":"0.9"},{"path":"bad path no slash","changefreq":"weekly","priority":"0.5"}]},
  "robotsTxt":""}')
SUURL=$(echo "$SU" | JQ "['site']['siteUrl']")
SUEX=$(echo "$SU" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['site']['sitemap']['extraUrls']))")
[[ "$SUURL" == "https://forged.fit" ]] && ok "site update saved" "$SUURL" || bad "site update" "$SU"
[[ "$SUEX" == 1 ]] && ok "bad extra URL dropped (sanitized)" "extraUrls=$SUEX" || bad "extra urls" "$SUEX"

# gsc verification now in public payload
GS=$(curl -s $BASE/api/seo | JQ "['site']['gscVerification']")
[[ "$GS" == "test-code-123" ]] && ok "gscVerification published" "$GS" || bad "gsc" "$GS"

# ── 8. sitemap now includes categories + custom URL + siteUrl base ─────────
X2=$(curl -s $BASE/sitemap.xml)
echo "$X2" | grep -q "<loc>https://forged.fit/landing/ramadan</loc>" && ok "custom URL in sitemap" "landing/ramadan" || bad "custom url" "$(echo "$X2" | grep landing)"
echo "$X2" | grep -q "shop?category=" && ok "category URLs included" "$(echo "$X2" | grep -c 'shop?category=') cats" || bad "categories" "missing"
echo "$X2" | grep -q "lastmod" && ok "lastmod dates present" "" || bad "lastmod" "missing"

# ── 9. robots custom → served; reset → default ─────────────────────────────
curl -s -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"robotsTxt":"User-agent: *\nDisallow: /private-lab\nSitemap: https://forged.fit/sitemap.xml"}' > /dev/null
R2=$(curl -s $BASE/robots.txt)
[[ "$R2" == *"Disallow: /private-lab"* ]] && ok "custom robots served" "$(echo "$R2" | tr '\n' ' ')" || bad "custom robots" "$R2"
RP=$(curl -s $BASE/api/admin/seo/robots/preview -H "Authorization: Bearer $AT")
[[ "$RP" == *'"isDefault":false'* ]] && ok "robots preview isDefault:false" "" || bad "preview" "$RP"
curl -s -X POST $BASE/api/admin/seo/robots/reset -H "Authorization: Bearer $AT" > /dev/null
R3=$(curl -s $BASE/robots.txt)
[[ "$R3" == *"Disallow: /admin"* ]] && ok "robots reset to default" "$(echo "$R3" | head -1)" || bad "reset" "$R3"

# ── 10. restore sensible site state (empty siteUrl = auto, clean extra urls) ─
curl -s -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
  "siteUrl":"","titleTemplate":"%s","brandName":"FORGED.","twitterHandle":"","defaultOgImage":"","gscVerification":"",
  "org":{"enabled":true,"name":"FORGED.","logo":"","phone":"","address":"","sameAs":""},
  "productSchema":true,"breadcrumbSchema":true,
  "sitemap":{"includeStatic":true,"includeCategories":false,"extraUrls":[]},"robotsTxt":""}' > /dev/null
X3=$(curl -s $BASE/sitemap.xml)
[[ "$X3" == *"<loc>$BASE/</loc>"* ]] && ok "site restored (auto base URL)" "" || bad "restore" "$(echo "$X3" | head -2)"
# about page meta restored to default for clean state
curl -s -X PUT $BASE/api/admin/seo/pages/about -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"metaTitle":"About FORGED. — Built for People Who Show Up","metaDescription":"The FORGED. story — premium fitness gear from Dhaka, Bangladesh. Our mission, our athletes, our standard.","metaKeywords":"about forged, gym brand bangladesh","metaRobots":"index, follow"}' > /dev/null
ok "about meta restored" ""

# ── 11. SPA fallback intact ─────────────────────────────────────────────────
FE=$(curl -s -o /dev/null -w '%{http_code}' $BASE/shop); AD2=$(curl -s -o /dev/null -w '%{http_code}' $BASE/admin/seo)
[[ "$FE" == 200 && "$AD2" == 200 ]] && ok "SPA routes intact (/, /admin/seo)" "" || bad "spa" "$FE/$AD2"

echo "══════════════════════════════"
echo "RESULT: PASS=$PASS FAIL=$FAIL"
exit $FAIL
