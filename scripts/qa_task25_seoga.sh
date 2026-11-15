#!/usr/bin/env bash
# FORGED — Task 25 QA: Per-product SEO override + Google Analytics 4 integration
# Covers: site analytics config (validation + public exposure), product SEO list/save,
#         sanitization, guards, public product reflection, restore, regressions.
# Usage: bash /home/z/my-project/scripts/qa_task25_seoga.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 25 — Product SEO Override + GA4 ══"

# ── 0. regressions ──────────────────────────────────────────────────────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "" || bad "health" "$H"
P=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/products?limit=1"); [[ "$P" == 200 ]] && ok "products 200" "" || bad "products" "$P"
S=$(curl -s $BASE/api/seo)
echo "$S" | grep -q '"analytics":{"enabled":false,"ga4Id":""}' \
  && ok "public /api/seo has analytics (default off)" "enabled=false ga4Id=''" || bad "analytics default" "$(echo "$S" | grep -o '"analytics":[^}]*}')"

# ── 1. admin auth + guards ──────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || bad "admin login" "$AD"
U1=$(curl -s -o /tmp/q25u1 -w '%{http_code}' $BASE/api/admin/seo/products)
[[ "$U1" == 401 ]] && ok "product seo list unauth 401" "$(cat /tmp/q25u1)" || bad "unauth list" "$U1"
U2=$(curl -s -o /tmp/q25u2 -w '%{http_code}' -X PUT $BASE/api/admin/seo/product/000000000000000000000000 -H 'Content-Type: application/json' -d '{}')
[[ "$U2" == 401 ]] && ok "product seo save unauth 401" "$(cat /tmp/q25u2)" || bad "unauth save" "$U2"

# ── 2. GA4 site config ──────────────────────────────────────────────────────
SITE=$(curl -s $BASE/api/admin/seo -H "Authorization: Bearer $AT")
SITE_JSON=$(echo "$SITE" | python3 -c "import sys,json;print(json.dumps(json.load(sys.stdin)['site']))")

# 2.1 invalid measurement id → 400
R=$(curl -s -o /tmp/q25g1 -w '%{http_code}' -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "$(echo "$SITE_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);d['analytics']={'enabled':True,'ga4Id':'ABC123'};print(json.dumps(d))")")
[[ "$R" == 400 ]] && ok "invalid GA4 id rejected 400" "$(cat /tmp/q25g1)" || bad "invalid ga4" "$R $(cat /tmp/q25g1)"
# 2.2 enabled without id → 400
R=$(curl -s -o /tmp/q25g2 -w '%{http_code}' -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "$(echo "$SITE_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);d['analytics']={'enabled':True,'ga4Id':''};print(json.dumps(d))")")
[[ "$R" == 400 ]] && ok "enable-without-id rejected 400" "$(cat /tmp/q25g2)" || bad "enable no id" "$R $(cat /tmp/q25g2)"
# 2.3 valid save (lowercase normalized to uppercase)
R=$(curl -s -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "$(echo "$SITE_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);d['analytics']={'enabled':True,'ga4Id':'g-test12345'};print(json.dumps(d))")")
[[ "$(echo "$R" | JQ "['site']['analytics']['ga4Id']")" == "G-TEST12345" && "$(echo "$R" | JQ "['site']['analytics']['enabled']")" == "True" ]] \
  && ok "GA4 saved + normalized uppercase" "G-TEST12345 enabled" || bad "ga4 save" "$(echo "$R" | grep -o '"analytics":[^}]*}')"
# 2.4 public exposure
S2=$(curl -s $BASE/api/seo)
echo "$S2" | grep -q '"analytics":{"enabled":true,"ga4Id":"G-TEST12345"}' \
  && ok "public /api/seo reflects GA4 on" "enabled=true G-TEST12345" || bad "public ga4" "$(echo "$S2" | grep -o '"analytics":[^}]*}')"
# 2.5 other site fields survived the save (no wipe)
[[ "$(echo "$R" | JQ "['site']['brandName']")" == "FORGED." && "$R" == *'"robotsTxt"'* ]] \
  && ok "full-body save keeps other site fields" "brand + robotsTxt intact" || bad "site wipe" "$(echo "$R" | head -c 200)"

# ── 3. per-product SEO override ─────────────────────────────────────────────
PRODS=$(curl -s $BASE/api/admin/seo/products -H "Authorization: Bearer $AT")
CNT=$(echo "$PRODS" | python3 -c "import sys,json;print(len(json.load(sys.stdin)['items']))")
[[ "$CNT" -gt 0 ]] && ok "admin product seo list" "$CNT products" || bad "product list" "$PRODS"
PID=$(echo "$PRODS" | python3 -c "import sys,json;its=json.load(sys.stdin)['items'];w=[x for x in its if 'whey' in x['slug']] or its;print(w[0]['_id'])")
PSLUG=$(echo "$PRODS" | python3 -c "import sys,json;its=json.load(sys.stdin)['items'];w=[x for x in its if 'whey' in x['slug']] or its;print(w[0]['slug'])")
OV0=$(echo "$PRODS" | python3 -c "import sys,json;its=json.load(sys.stdin)['items'];w=[x for x in its if 'whey' in x['slug']] or its;print(w[0]['hasOverride'])")
[[ "$OV0" == "False" ]] && ok "target starts without override" "$PSLUG hasOverride=false" || note "target already had override ($OV0) — continuing"

# 3.1 save override (sanitize + robots + schema)
SV=$(curl -s -X PUT $BASE/api/admin/seo/product/$PID -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{
  "metaTitle":"Custom Whey SEO <script>alert(1)</script> Title",
  "metaDescription":"Override description for QA — clean & safe",
  "metaKeywords":"whey override, qa protein",
  "canonicalUrl":"https://forged.fit/shop",
  "metaRobots":"noindex, nofollow",
  "og":{"title":"OG Whey Title","description":"OG whey desc","image":"/assets/prod-whey-b.png"},
  "twitter":{"title":"TW Whey","description":"TW whey desc","image":"/assets/prod-whey.png"},
  "customSchema":"{\"@context\":\"https://schema.org\",\"@type\":\"FAQPage\",\"mainEntity\":[]}"
}')
[[ "$(echo "$SV" | JQ "['hasOverride']")" == "True" && "$(echo "$SV" | JQ "['product']['seo']['metaRobots']")" == "noindex, nofollow" ]] \
  && ok "override saved" "metaRobots=noindex, nofollow" || bad "override save" "$(echo "$SV" | head -c 300)"
echo "$SV" | grep -q '<script>' && bad "meta injection NOT sanitized" "$SV" || ok "angle brackets sanitized" "no <script> in stored title"
ST=$(echo "$SV" | JQ "['product']['seo']['metaTitle']")
[[ "$ST" == "Custom Whey SEO scriptalert(1)/script Title" ]] && ok "sanitized title exact" "$ST" || note "title after clean: $ST"
echo "$SV" | grep -q 'FAQPage' && ok "custom schema stored as JSON string" "FAQPage" || bad "schema store" "$(echo "$SV" | grep -o 'customSchema[^,]*')"

# 3.2 public product API carries the override
PUB=$(curl -s $BASE/api/products/$PSLUG)
[[ "$(echo "$PUB" | JQ "['product']['seo']['metaTitle']")" == "$ST" && "$(echo "$PUB" | JQ "['product']['seo']['og']['image']")" == "/assets/prod-whey-b.png" ]] \
  && ok "public /api/products/:slug exposes override" "seo.metaTitle + og.image" || bad "public seo" "$(echo "$PUB" | grep -o '"seo":.*' | head -c 200)"

# 3.3 list reflects override
P2=$(curl -s $BASE/api/admin/seo/products -H "Authorization: Bearer $AT")
echo "$P2" | python3 -c "import sys,json;its=json.load(sys.stdin)['items'];w=[x for x in its if 'whey' in x['slug']] or its;assert w[0]['hasOverride'] is True" \
  && ok "product list hasOverride true" "" || bad "list override" ""

# 3.4 validation: bad schema / bad robots / bad id / 404
B1=$(curl -s -o /tmp/q25b1 -w '%{http_code}' -X PUT $BASE/api/admin/seo/product/$PID -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"customSchema":"{not json"}')
[[ "$B1" == 400 ]] && ok "invalid custom schema 400" "$(cat /tmp/q25b1)" || bad "schema 400" "$B1"
B2=$(curl -s -o /tmp/q25b2 -w '%{http_code}' -X PUT $BASE/api/admin/seo/product/$PID -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{"metaRobots":"DROP; TABLE products"}')
[[ "$B2" == 400 ]] && ok "invalid robots directive 400" "$(cat /tmp/q25b2)" || bad "robots 400" "$B2"
B3=$(curl -s -o /tmp/q25b3 -w '%{http_code}' -X PUT $BASE/api/admin/seo/product/not-an-id -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{}')
[[ "$B3" == 400 ]] && ok "bogus id 400" "$(cat /tmp/q25b3)" || bad "bogus id" "$B3"
B4=$(curl -s -o /tmp/q25b4 -w '%{http_code}' -X PUT $BASE/api/admin/seo/product/aaaaaaaaaaaaaaaaaaaaaaaa -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' -d '{}')
[[ "$B4" == 404 ]] && ok "unknown id 404" "$(cat /tmp/q25b4)" || bad "404" "$B4"

# 3.5 clear override → auto restored
CL=$(curl -s -X PUT $BASE/api/admin/seo/product/$PID -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d '{"metaTitle":"","metaDescription":"","metaKeywords":"","canonicalUrl":"","metaRobots":"","og":{},"twitter":{},"customSchema":""}')
[[ "$(echo "$CL" | JQ "['hasOverride']")" == "False" ]] && ok "override cleared" "hasOverride=false" || bad "clear" "$(echo "$CL" | grep -o '"hasOverride":[a-z]*')"
PUB2=$(curl -s $BASE/api/products/$PSLUG)
echo "$PUB2" | grep -q '"metaTitle":""' && ok "public product seo empty after clear" "auto template takes over" || bad "clear public" "$(echo "$PUB2" | grep -o '"seo":.*' | head -c 150)"

# ── 4. restore + regressions ────────────────────────────────────────────────
RS=$(curl -s -X PUT $BASE/api/admin/seo/site -H "Authorization: Bearer $AT" -H 'Content-Type: application/json' \
  -d "$(echo "$SITE_JSON" | python3 -c "import sys,json;d=json.load(sys.stdin);d['analytics']={'enabled':False,'ga4Id':''};print(json.dumps(d))")")
echo "$RS" | grep -q '"analytics":{"enabled":false,"ga4Id":""}' \
  && ok "GA4 restored off (clean state)" "" || bad "restore" "$(echo "$RS" | grep -o '"analytics":[^}]*}')"
R=$(curl -s -o /dev/null -w '%{http_code}' $BASE/robots.txt);   [[ "$R" == 200 ]] && ok "robots.txt still 200" "" || bad "robots" "$R"
X=$(curl -s -o /dev/null -w '%{http_code}' $BASE/sitemap.xml);  [[ "$X" == 200 ]] && ok "sitemap.xml still 200" "" || bad "sitemap" "$X"
SP=$(curl -s -o /dev/null -w '%{http_code}' $BASE/);            [[ "$SP" == 200 ]] && ok "SPA fallback still 200" "" || bad "spa" "$SP"
PDL=$(curl -s "$BASE/api/products/$PSLUG" | JQ "['product']['name']")
[[ -n "$PDL" && "$PDL" != "None" ]] && ok "public product intact" "$PDL" || bad "product" "$PDL"

echo "════════════════════════════════════"
echo "PASS=$PASS FAIL=$FAIL"
[[ $FAIL -eq 0 ]] && echo "ALL GREEN" || echo "HAS FAILURES"
exit $FAIL
