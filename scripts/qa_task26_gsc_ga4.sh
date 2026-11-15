#!/usr/bin/env bash
# FORGED — Task 26 QA: Google Search Console submission automation + GA4 funnel report
# Covers: gsc status/settings, PEM+URL validation, submit-url/sitemap (live-fail + dry-run),
#         index-sitemap batch, submission log, product auto-notify hooks, sitemap auto-resubmit,
#         GA4 funnel endpoint (unconfigured/configured/error/validation), state restore.
# Usage: bash /home/z/my-project/scripts/qa_task26_gsc_ga4.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }
AJ() { python3 -c "import sys,json;d=json.load(open('$1'));print(eval('d'+sys.argv[1]))" "$2" 2>/dev/null; }
AH=""
VCODE=""; VBODY=""
V() { # PUT gsc settings — sets VCODE (http code) + VBODY (json)
  local OUT; OUT=$(curl -s -w '\n%{http_code}' -X PUT $BASE/api/admin/seo/gsc/settings -H "$AH" -H 'Content-Type: application/json' -d "$1")
  VCODE=$(echo "$OUT" | tail -1); VBODY=$(echo "$OUT" | head -n -1)
}

echo "══ QA Task 26 — GSC automation + GA4 funnel ══"

# ── 0. health / regression smoke ────────────────────────────────────────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "" || bad "health" "$H"
X=$(curl -s $BASE/sitemap.xml); [[ "$X" == *"<urlset"* ]] && ok "sitemap.xml still served" "$(echo "$X" | grep -c '<url>') urls" || bad "sitemap" "$(echo "$X" | head -1)"
R=$(curl -s $BASE/robots.txt); [[ "$R" == *"User-agent: *"* ]] && ok "robots.txt still served" "" || bad "robots" "$R"

# ── 1. admin auth ───────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']")
AH="Authorization: Bearer $AT"
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || { bad "admin login" "$AD"; exit 1; }
NC=$(curl -s -o /tmp/q26a -w '%{http_code}' $BASE/api/admin/seo/gsc)
[[ "$NC" == 401 ]] && ok "gsc status unauth 401" "$(cat /tmp/q26a)" || bad "unauth" "$NC $(cat /tmp/q26a)"
NC=$(curl -s -o /tmp/q26b -w '%{http_code}' "$BASE/api/admin/analytics/funnel?days=28")
[[ "$NC" == 401 ]] && ok "funnel unauth 401" "$(cat /tmp/q26b)" || bad "funnel unauth" "$NC"

# ── 2. reset to clean state (no SA, no property) ────────────────────────────
RS=$(curl -s -X PUT $BASE/api/admin/seo/gsc/settings -H "$AH" -H 'Content-Type: application/json' \
  -d '{"clientEmail":"","gscSiteUrl":"","autoSubmitProducts":false,"autoSubmitSitemap":false,"ga4PropertyId":""}')
[[ "$(echo "$RS" | JQ "['ok']")" == "True" ]] && ok "reset google settings" "" || bad "reset" "$RS"

# ── 3. status: unconfigured ─────────────────────────────────────────────────
ST=$(curl -s $BASE/api/admin/seo/gsc -H "$AH")
[[ "$(echo "$ST" | JQ "['configured']")" == "False" && "$(echo "$ST" | JQ "['hasKey']")" == "False" ]] \
  && ok "status: configured=false hasKey=false" "" || bad "status" "$ST"

# ── 4. settings validation ──────────────────────────────────────────────────
openssl genrsa -out /tmp/q26_key.pem 2048 2>/dev/null
PEM=$(python3 -c "print(open('/tmp/q26_key.pem').read().strip().replace(chr(10),'\\\\n'))")
V '{"clientEmail":"not-an-email"}'; [[ "$VCODE" == 400 ]] && ok "bad service-account email 400" "$VBODY" || bad "email validation" "$VCODE $VBODY"
V '{"clientEmail":"qa@forged.iam.gserviceaccount.com","privateKey":"-----BEGIN GARBAGE-----\\nnope\\n-----END GARBAGE-----"}'; [[ "$VCODE" == 400 ]] && ok "bad PEM key 400" "$VBODY" || bad "pem validation" "$VCODE $VBODY"
V '{"clientEmail":"qa@forged.iam.gserviceaccount.com","gscSiteUrl":"ftp://bad.example"}'; [[ "$VCODE" == 400 ]] && ok "bad GSC property 400" "$VBODY" || bad "property validation" "$VCODE"
V '{"clientEmail":"qa@forged.iam.gserviceaccount.com","ga4PropertyId":"4x1y2"}'; [[ "$VCODE" == 400 ]] && ok "bad GA4 property id 400" "$VBODY" || bad "propertyId validation" "$VCODE"

# site.siteUrl is needed for URL expansion + automations (Site & Schema field)
SS=$(curl -s -X PUT $BASE/api/admin/seo/site -H "$AH" -H 'Content-Type: application/json' -d '{"siteUrl":"https://forged.fit","titleTemplate":"%s","brandName":"FORGED.","twitterHandle":"","defaultOgImage":"","gscVerification":"","analytics":{"enabled":false,"ga4Id":""},"productSchema":true,"breadcrumbSchema":true,"org":{"enabled":true,"name":"FORGED.","logo":"","phone":"","address":"","sameAs":""},"sitemap":{"includeStatic":true,"includeCategories":false,"extraUrls":[]},"robotsTxt":""}')
[[ "$(echo "$SS" | JQ "['site']['siteUrl']")" == "https://forged.fit" ]] && ok "site.siteUrl set (SEO → Site & Schema)" "" || bad "siteUrl" "$SS"

# ── 5. save full settings (fake SA — will fail against Google, by design) ───
V "{\"clientEmail\":\"qa@forged.iam.gserviceaccount.com\",\"privateKey\":\"$PEM\",\"gscSiteUrl\":\"https://forged.fit/\",\"ga4PropertyId\":\"412345678\",\"autoSubmitProducts\":false,\"autoSubmitSitemap\":false}"
[[ "$VCODE" == 200 && "$(echo "$VBODY" | JQ "['ok']")" == "True" && "$(echo "$VBODY" | JQ "['hasKey']")" == "True" ]] \
  && ok "settings saved (key accepted)" "" || bad "settings save" "$VCODE $VBODY"
ST=$(curl -s $BASE/api/admin/seo/gsc -H "$AH")
[[ "$(echo "$ST" | JQ "['configured']")" == "True" && "$ST" != *privateKey* && "$ST" != *BEGIN* ]] \
  && ok "status live + privateKey never leaks" "configured=true" || bad "key leak/status" "$ST"
[[ "$(echo "$ST" | JQ "['ga4PropertyId']")" == "412345678" && "$(echo "$ST" | JQ "['gsc']['siteUrl']")" == "https://forged.fit" ]] \
  && ok "property + gsc siteUrl round-trip" "" || bad "roundtrip" "$ST"

# ── 6. submit-url (live mode with fake SA → graceful failure) ───────────────
SU=$(curl -s -X POST $BASE/api/admin/seo/gsc/submit-url -H "$AH" -H 'Content-Type: application/json' -d '{"url":"/shop"}')
[[ "$(echo "$SU" | JQ "['mode']")" == "live" && "$(echo "$SU" | JQ "['ok']")" == "False" ]] \
  && ok "submit-url live fails gracefully (fake SA)" "msg: $(echo "$SU" | JQ "['message']" | head -c 80)" || bad "submit-url" "$SU"
[[ "$(echo "$SU" | JQ "['target']")" == "https://forged.fit/shop" ]] \
  && ok "relative URL expanded with siteUrl" "" || bad "url expand" "$(echo "$SU" | JQ "['target']")"
sleep 1
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
KIND0=$(echo "$LG" | JQ "['items'][0]['kind']"); TGT0=$(echo "$LG" | JQ "['items'][0]['target']")
[[ "$KIND0" == "url" && "$TGT0" == "https://forged.fit/shop" ]] \
  && ok "submission logged (kind=url, target)" "mode=$(echo "$LG" | JQ "['items'][0]['mode']")" || bad "log" "$KIND0 $TGT0"

# ── 7. submit-sitemap (live mode, fake SA) ──────────────────────────────────
SS=$(curl -s -X POST $BASE/api/admin/seo/gsc/submit-sitemap -H "$AH")
[[ "$(echo "$SS" | JQ "['mode']")" == "live" && "$(echo "$SS" | JQ "['type']")" == "SITEMAP_SUBMIT" ]] \
  && ok "submit-sitemap reaches GSC API (fails gracefully)" "$(echo "$SS" | JQ "['message']" | head -c 70)" || bad "submit-sitemap" "$SS"

# ── 8. clear SA → dry-run mode ──────────────────────────────────────────────
V '{"clientEmail":"","gscSiteUrl":"https://forged.fit","autoSubmitProducts":false,"autoSubmitSitemap":true,"ga4PropertyId":"412345678"}' > /dev/null
ST=$(curl -s $BASE/api/admin/seo/gsc -H "$AH")
[[ "$(echo "$ST" | JQ "['configured']")" == "False" && "$(echo "$ST" | JQ "['hasKey']")" == "False" ]] \
  && ok "clearing email wipes the whole SA pair" "" || bad "clear" "$ST"
DU=$(curl -s -X POST $BASE/api/admin/seo/gsc/submit-url -H "$AH" -H 'Content-Type: application/json' -d '{"url":"https://forged.fit/landing/qa"}')
[[ "$(echo "$DU" | JQ "['mode']")" == "dry-run" && "$(echo "$DU" | JQ "['ok']")" == "True" ]] \
  && ok "submit-url dry-run (no credentials)" "" || bad "dry-run url" "$DU"

# ── 9. index-sitemap batch (dry-run — deterministic) ────────────────────────
BX=$(curl -s -X POST $BASE/api/admin/seo/gsc/index-sitemap -H "$AH")
TOT=$(echo "$BX" | JQ "['total']"); SUB=$(echo "$BX" | JQ "['submitted']")
[[ "$(echo "$BX" | JQ "['mode']")" == "dry-run" && "$SUB" == "$TOT" && "$SUB" != "None" && "$SUB" -ge 5 ]] \
  && ok "index-sitemap batch dry-run" "submitted=$SUB total=$TOT ok=$(echo "$BX" | JQ "['okCount']")" || bad "batch" "$BX"
sleep 1
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
NBATCH=$(echo "$LG" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len([i for i in d['items'] if i['kind']=='batch' and i['mode']=='dry-run']))")
[[ "$NBATCH" -ge 1 ]] && ok "batch summary logged" "batch entries=$NBATCH" || bad "batch log" "$NBATCH"
NDRY=$(echo "$LG" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len([i for i in d['items'] if i['kind']=='url' and i['mode']=='dry-run']))")
[[ "$NDRY" -ge 5 ]] && ok "per-URL dry-run entries logged" "count=$NDRY" || bad "per-url logs" "$NDRY"

# ── 10. product auto-notify (dry-run, deterministic) ────────────────────────
python3 -c "import base64;open('/tmp/q26.png','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='))"
V '{"clientEmail":"","gscSiteUrl":"https://forged.fit","autoSubmitProducts":true,"autoSubmitSitemap":false,"ga4PropertyId":"412345678"}' > /dev/null
PR=$(curl -s -X POST $BASE/api/admin/products -H "$AH" -F "name=QA GSC Product" -F "price=999" -F "category=accessories" -F "stock=5" -F "shortDesc=qa auto-notify product" -F "images=@/tmp/q26.png;type=image/png")
PID=$(echo "$PR" | JQ "['product']['_id']"); PSLUG=$(echo "$PR" | JQ "['product']['slug']")
[[ -n "$PID" && "$PID" != "None" ]] && ok "qa product created (multipart)" "slug=$PSLUG" || bad "product create" "$PR"
sleep 1.5
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
AUTO=$(echo "$LG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=[i for i in d['items'] if i.get('message','').find('auto: product created')>=0]
print(json.dumps(hits[0]) if hits else '{}')")
[[ "$AUTO" == *"/shop"* && "$AUTO" == *dry-run* ]] \
  && ok "auto-notify on product CREATE (log entry)" "target=https://forged.fit/shop" || bad "auto create" "$AUTO"
UP=$(curl -s -o /dev/null -w '%{http_code}' -X PUT $BASE/api/admin/products/$PID -H "$AH" -F "stock=9")
[[ "$UP" == 200 ]] && ok "product updated" "" || bad "product update" "$UP"
sleep 1.5
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
echo "$LG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=[i for i in d['items'] if 'auto: product updated' in i.get('message','')]
sys.exit(0 if hits else 1)" && ok "auto-notify on product UPDATE" "" || bad "auto update" ""
DE=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE $BASE/api/admin/products/$PID -H "$AH")
[[ "$DE" == 200 ]] && ok "qa product deleted" "" || bad "delete" "$DE"
sleep 1.5
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
echo "$LG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=[i for i in d['items'] if 'auto: product deleted' in i.get('message','')]
sys.exit(0 if hits else 1)" && ok "auto-notify on product DELETE" "" || bad "auto delete" ""

# ── 11. sitemap auto-resubmit on settings change (dry-run) ──────────────────
SE=$(curl -s -X PUT $BASE/api/admin/seo/site -H "$AH" -H 'Content-Type: application/json' \
  -d '{"siteUrl":"https://forged.fit","titleTemplate":"%s","brandName":"FORGED.","twitterHandle":"","defaultOgImage":"","gscVerification":"","analytics":{"enabled":false,"ga4Id":""},"productSchema":true,"breadcrumbSchema":true,"org":{"enabled":true,"name":"FORGED.","logo":"","phone":"","address":"","sameAs":""},"sitemap":{"includeStatic":true,"includeCategories":false,"extraUrls":[]},"robotsTxt":"# qa task26 robots probe\nUser-agent: *\nAllow: /\n"}')
[[ "$(echo "$SE" | JQ "['site']['robotsTxt']")" == *task26* ]] && ok "site settings saved (robots changed)" "" || bad "site save" "$SE"
sleep 1.5
LG=$(curl -s $BASE/api/admin/seo/gsc/log -H "$AH")
echo "$LG" | python3 -c "
import sys,json
d=json.load(sys.stdin)
hits=[i for i in d['items'] if i['kind']=='sitemap' and i['mode']=='dry-run']
sys.exit(0 if hits else 1)" && ok "sitemap auto-resubmit fired (dry-run log)" "" || bad "sitemap auto" ""

# ── 12. GA4 funnel ──────────────────────────────────────────────────────────
NC=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/analytics/funnel?days=abc" -H "$AH")
[[ "$NC" == 400 ]] && ok "funnel days=abc 400" "" || bad "days validation" "$NC"
NC=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/analytics/funnel?days=0" -H "$AH")
[[ "$NC" == 400 ]] && ok "funnel days=0 400" "" || bad "days=0" "$NC"
NC=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/analytics/funnel?days=401" -H "$AH")
[[ "$NC" == 400 ]] && ok "funnel days=401 400" "" || bad "days=401" "$NC"
F1=$(curl -s "$BASE/api/admin/analytics/funnel?days=28" -H "$AH")
# propertyId is still set (412345678) but SA cleared → unconfigured (missing.serviceAccount)
[[ "$(echo "$F1" | JQ "['configured']")" == "False" && "$F1" == *serviceAccount* ]] \
  && ok "funnel unconfigured (no SA)" "missing: $(echo "$F1" | JQ "['missing']" | tr -d ' ')" || bad "funnel unconfigured" "$F1"
# restore full fake config → configured=true + graceful GA4 error (fake creds)
V "{\"clientEmail\":\"qa@forged.iam.gserviceaccount.com\",\"privateKey\":\"$PEM\",\"gscSiteUrl\":\"https://forged.fit\",\"autoSubmitProducts\":false,\"autoSubmitSitemap\":false,\"ga4PropertyId\":\"412345678\"}" > /dev/null
F2=$(curl -s "$BASE/api/admin/analytics/funnel?days=28" -H "$AH")
[[ "$(echo "$F2" | JQ "['configured']")" == "True" && "$(echo "$F2" | JQ "['propertyId']")" == "412345678" ]] \
  && ok "funnel configured with SA + property" "" || bad "funnel configured" "$F2"
ERRMSG=$(echo "$F2" | JQ "['error']")
[[ "$ERRMSG" != "None" && -n "$ERRMSG" ]] \
  && ok "GA4 API failure surfaces as graceful error" "err: $(echo "$ERRMSG" | head -c 70)" || bad "ga4 error" "$F2"

# ── 13. state restore (ship clean defaults) ─────────────────────────────────
V '{"clientEmail":"","gscSiteUrl":"","autoSubmitProducts":false,"autoSubmitSitemap":false,"ga4PropertyId":""}' > /dev/null
SE=$(curl -s -X PUT $BASE/api/admin/seo/site -H "$AH" -H 'Content-Type: application/json' \
  -d '{"siteUrl":"","titleTemplate":"%s","brandName":"FORGED.","twitterHandle":"","defaultOgImage":"","gscVerification":"","analytics":{"enabled":false,"ga4Id":""},"productSchema":true,"breadcrumbSchema":true,"org":{"enabled":true,"name":"FORGED.","logo":"","phone":"","address":"","sameAs":""},"sitemap":{"includeStatic":true,"includeCategories":false,"extraUrls":[]},"robotsTxt":""}')
[[ "$(echo "$SE" | JQ "['site']['robotsTxt']")" == "" ]] && ok "robots restored to default" "" || bad "robots restore" "$(echo "$SE" | JQ "['site']['robotsTxt']")"
ST=$(curl -s $BASE/api/admin/seo/gsc -H "$AH")
[[ "$(echo "$ST" | JQ "['configured']")" == "False" && "$(echo "$ST" | JQ "['ga4PropertyId']")" == "" ]] \
  && ok "google settings fully reset" "" || bad "reset" "$ST"
STILL=$(curl -s "$BASE/api/admin/analytics/funnel?days=28" -H "$AH")
[[ "$STILL" == *'"configured":false'* ]] && ok "funnel back to unconfigured" "" || bad "funnel reset" "$STILL"

# ── summary ─────────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "PASS: $PASS  FAIL: $FAIL"
[[ $FAIL -eq 0 ]] && echo "ALL GREEN ✓" || exit 1
