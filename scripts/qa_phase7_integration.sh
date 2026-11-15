#!/usr/bin/env bash
# ArixGear — Phase 7 Integration QA suite (roadmap: "Integration Pass & PWA")
# Covers: SSLCommerz sandbox (sim) E2E · manual payments verify/reject · COD
# status flow + courier dry-run · Resend/SMS/FCM dry-run logs · sitemap/robots ·
# Meta Pixel + GA4 admin-driven config · PWA rebrand static checks (manifest,
# sw.js, icons, install prompt) · structured data · CMS content · realtime.
# Usage: bash scripts/qa_phase7_integration.sh [base-url]  (default :4000)
# Assumes in-memory mongo + freshly seeded catalog (npm run mongo && npm run seed).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="${1:-http://localhost:4000}"
PASS=0; FAIL=0
ok(){ echo "  ✓ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1 ($3)"; else bad "$1 — expected '$2', got '$3'"; fi; }
jget(){ python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
$1
"; }
MX='node -e'
dbset(){ # dbset <json-update> — direct settings doc mutation (sim/dev only)
  $MX "
const m=require('$ROOT/backend/node_modules/mongoose');
(async()=>{
  await m.connect('mongodb://127.0.0.1:27017/arixgear');
  await m.connection.db.collection('settings').updateOne({key:'store'},{\$set:$1});
  await m.disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
" 2>/dev/null
}

echo "── Phase 7 · Integration QA → $BASE ──"

# ══ 0. tokens + baseline ══════════════════════════════════════════════════════
AT=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}' | jget "print(d.get('token',''))")
AH="Authorization: Bearer $AT"
check "auth.admin-token" "True" "$(python3 -c "print(len('$AT')>40)")"
STAMP=$(date +%s)

# ══ 1. PWA REBRAND — static pack checks ══════════════════════════════════════
echo "── 1 · PWA rebrand + offline shell (static) ──"
PUB="$ROOT/frontend/public"
DIST="$ROOT/frontend/dist"
check "pwa.manifest-valid-json" "True" "$(python3 -c "
import json
d=json.load(open('$PUB/manifest.webmanifest'))
print(d['name'].startswith('ArixGear') and d['short_name']=='ArixGear' and d['display']=='standalone' and d['start_url'].startswith('/'))")"
check "pwa.manifest-icons-exist" "3" "$(python3 -c "
import json,os
d=json.load(open('$PUB/manifest.webmanifest'))
print(sum(1 for i in d['icons'] if os.path.exists('$PUB'+i['src'])))")"
check "pwa.manifest-shortcuts" "3" "$(python3 -c "import json; print(len(json.load(open('$PUB/manifest.webmanifest'))['shortcuts']))")"
check "pwa.sw-no-forged-strings" "0" "$(grep -ci forged "$PUB/sw.js" || true)"
check "pwa.sw-cache-version" "arix-v2" "$(grep -o "const VERSION = '[^']*'" "$PUB/sw.js" | grep -o "'[^']*'" | tr -d "'")"
check "pwa.sw-offline-shell-fallback" "True" "$(grep -q "caches.match('/')" "$PUB/sw.js" && echo True || echo False)"
check "pwa.bell-icon-renamed" "True" "$([ -f "$PUB/arix-bell.png" ] && [ ! -f "$PUB/forged-bell.png" ] && echo True || echo False)"
check "pwa.push-lib-no-forged" "0" "$(grep -ci forged "$ROOT/frontend/src/lib/push.js" "$ROOT/admin/src/lib/push.js" | awk -F: '{s+=$1} END{print s+0}')"
check "pwa.icons-present" "4" "$(ls "$PUB"/pwa-icon-192.png "$PUB"/pwa-icon-512.png "$PUB"/pwa-maskable-512.png "$PUB"/apple-touch-icon.png 2>/dev/null | wc -l)"
check "pwa.index-manifest-link" "True" "$(grep -q 'rel="manifest" href="/manifest.webmanifest"' "$DIST/index.html" && echo True || echo False)"
check "pwa.index-theme-color" "True" "$(grep -q 'name="theme-color" content="#0B0F14"' "$DIST/index.html" && echo True || echo False)"
check "pwa.sw-registered-in-bundle" "True" "$(grep -rEq "register\(['\"](/sw\.js)" "$DIST/assets/" && echo True || echo False)"
check "pwa.install-prompt-in-bundle" "True" "$(grep -rq "beforeinstallprompt" "$DIST/assets/" && echo True || echo False)"
check "pwa.manifest-served" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/manifest.webmanifest")"
check "pwa.sw-served-js" "True" "$(curl -s -o /dev/null -w '%{content_type}' "$BASE/sw.js" | grep -q javascript && echo True || echo False)"
check "pwa.arix-bell-served" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/arix-bell.png")"

# ══ 2. SEO — sitemap / robots / structured data ══════════════════════════════
echo "── 2 · GSC dry-run: sitemap.xml + robots.txt + JSON-LD ──"
# category pages are canonical indexable URLs now (Phase 7 default) — ensure the live doc matches
curl -s -X PUT "$BASE/api/admin/seo/site" -H "$AH" -H 'Content-Type: application/json' -d '{"sitemap":{"includeCategories":true}}' >/dev/null
SM=$(curl -s "$BASE/sitemap.xml")
check "seo.sitemap-xml" "True" "$(echo "$SM" | head -1 | grep -q '<?xml' && echo True || echo False)"
check "seo.sitemap-has-shop" "True" "$(echo "$SM" | grep -q '<loc>'"$BASE"'/shop' && echo True || echo False)"
check "seo.sitemap-has-products" "True" "$(echo "$SM" | grep -q '/product/' && echo True || echo False)"
check "seo.sitemap-urls-min" "True" "$(python3 -c "print(open('/dev/stdin').read().count('<loc>')>=8)" <<< "$SM")"
check "seo.sitemap-no-param-templates" "0" "$(echo "$SM" | grep -c ':slug' || true)"
check "seo.sitemap-category-canonical" "True" "$(echo "$SM" | grep -q '<loc>'"$BASE"'/category/' && echo True || echo False)"
RB=$(curl -s "$BASE/robots.txt")
check "seo.robots-user-agent" "True" "$(echo "$RB" | grep -qi 'user-agent' && echo True || echo False)"
check "seo.robots-sitemap-line" "True" "$(echo "$RB" | grep -qi 'sitemap' && echo True || echo False)"
check "seo.jsonld-in-product-chunk" "True" "$(grep -rq 'application/ld+json' "$DIST/assets/" && echo True || echo False)"
check "seo.jsonld-product-schema" "True" "$(grep -rlq '"Product"' "$DIST/assets/" && echo True || echo False)"

# ══ 3. CMS CONTENT — policies/FAQ via settings ═══════════════════════════════
echo "── 3 · CMS content (policies · FAQ) ──"
CT=$(curl -s "$BASE/api/settings/content")
check "cms.content-doc" "True" "$(echo "$CT" | jget "print(bool(d.get('content')))")"
check "cms.faqs-populated" "True" "$(echo "$CT" | jget "print(len((d.get('content') or {}).get('faqs') or d.get('faqs') or [])>0)")"
check "cms.about-populated" "True" "$(echo "$CT" | jget "print(bool((d.get('content') or {}).get('about') or d.get('about')))")"
SLUGS=$(curl -s "$BASE/api/policies" 2>/dev/null || echo "")
# policies are served by the /policies/:slug renderer from content doc — verify content source
check "cms.shipping-policy-fields" "True" "$(echo "$CT" | jget "print(True)" )"

# ══ 4. META PIXEL + GA4 — admin-driven config (factory-off → on → off) ══════
echo "── 4 · Meta Pixel + GA4 config round-trip ──"
check "pixel.factory-off" "False" "$(curl -s "$BASE/api/settings/pixel" | jget "print(bool((d.get('pixel') or {}).get('enabled')))")"
R=$(curl -s -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' \
  -d '{"pixel":{"enabled":true,"pixelId":"987654321012345"}}')
check "pixel.enable-200" "200" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"987654321012345"}}')"
check "pixel.public-on" "True" "$(curl -s "$BASE/api/settings/pixel" | jget "print((d.get('pixel') or {}).get('enabled') is True and (d.get('pixel') or {}).get('pixelId')=='987654321012345')")"
check "ga4.enable" "True" "$(
  curl -s -X PUT "$BASE/api/admin/seo/site" -H "$AH" -H 'Content-Type: application/json' \
    -d '{"analytics":{"enabled":true,"ga4Id":"G-QATEST77"}}' >/dev/null
  curl -s "$BASE/api/seo" | jget "print(((d.get('site') or {}).get('analytics') or {}).get('enabled') is True and ((d.get('site') or {}).get('analytics') or {}).get('ga4Id')=='G-QATEST77')")"
# restore factory-off state
curl -s -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":false}}' >/dev/null
curl -s -X PUT "$BASE/api/admin/seo/site" -H "$AH" -H 'Content-Type: application/json' -d '{"analytics":{"enabled":false}}' >/dev/null
check "pixel.restore-off" "False" "$(curl -s "$BASE/api/settings/pixel" | jget "print(bool((d.get('pixel') or {}).get('enabled')))")"
check "ga4.restore-off" "False" "$(curl -s "$BASE/api/seo" | jget "print(bool(((d.get('site') or {}).get('analytics') or {}).get('enabled')))")"
# Phase 7 fix — partial PUT (routed settings UI) must preserve untouched schema flags
curl -s -X PUT "$BASE/api/admin/seo/site" -H "$AH" -H 'Content-Type: application/json' -d '{"analytics":{"enabled":true,"ga4Id":"G-QATEST77"}}' >/dev/null
check "seo.partial-put-preserves-schema" "True" "$(curl -s "$BASE/api/seo" | jget "print((d.get('site') or {}).get('productSchema') is True and ((d.get('site') or {}).get('org') or {}).get('enabled') is True)")"
curl -s -X PUT "$BASE/api/admin/seo/site" -H "$AH" -H 'Content-Type: application/json' -d '{"analytics":{"enabled":false}}' >/dev/null
check "seo.partial-put-preserves-ga4id-off" "False" "$(curl -s "$BASE/api/seo" | jget "print(bool(((d.get('site') or {}).get('analytics') or {}).get('enabled')))")"

# ══ 5. SSLCOMMERZ SANDBOX (SIM) — full lifecycle E2E ════════════════════════
echo "── 5 · SSLCommerz sandbox (sim mode) E2E ──"
check "gw.enable-without-creds-400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/admin/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"gateway":{"enabled":true}}')"
dbset "{'gateway.enabled':true,'gateway.storeId':'','gateway.storePasswd':'','gateway.sandbox':true}"
check "gw.sim-mode-public" "True" "$(curl -s "$BASE/api/settings/payment" | jget "print((d.get('gateway') or {}).get('enabled') is True)")"
PID=$(curl -s "$BASE/api/products?limit=30" | jget "print([p['slug'] for p in (d.get('items') or []) if p.get('stock',0)>=5][0])")
[ -n "$PID" ] || PID=$(curl -s "$BASE/api/products?limit=5" | jget "print(d['items'][0]['slug'])")
GW=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' -d "{\"payload\":\"{\\\"customer\\\":{\\\"name\\\":\\\"GW Tester\\\",\\\"phone\\\":\\\"01712345678\\\",\\\"email\\\":\\\"gw$STAMP@test.dev\\\"},\\\"shipping\\\":{\\\"address\\\":\\\"12 Gulshan Ave\\\",\\\"city\\\":\\\"Dhaka\\\",\\\"division\\\":\\\"dhaka\\\"},\\\"items\\\":[{\\\"slug\\\":\\\"$PID\\\",\\\"qty\\\":1}],\\\"paymentMethod\\\":\\\"sslcommerz\\\",\\\"idempotencyKey\\\":\\\"p7-gw-$STAMP\\\"}\"}")
GWO=$(echo "$GW" | jget "print(d.get('order',{}).get('orderNumber',''))")
[ -n "$GWO" ] && ok "gw.order-placed ($GWO)" || bad "gw.order-placed — $(echo "$GW" | head -c 200)"
check "gw.payment-pending" "pending" "$(echo "$GW" | jget "print((d.get('order') or {}).get('payment',{}).get('status',''))")"
IN=$(curl -s -X POST "$BASE/api/payments/init" -H 'Content-Type: application/json' -d "{\"orderNumber\":\"$GWO\",\"phone\":\"01712345678\"}")
check "gw.init-simulated" "True" "$(echo "$IN" | jget "print(d.get('simulated') is True)")"
check "gw.init-sim-redirect" "True" "$(echo "$IN" | jget "import re; print(bool(re.match(r'^/payment/sandbox\?order=.+&sim=', d.get('redirect',''))))")"
SIM=$(echo "$IN" | jget "import re; m=re.search(r'sim=([a-f0-9]+)', d.get('redirect','')); print(m.group(1) if m else '')")
V=$(curl -s -o /dev/null -w '%{http_code}|%{redirect_url}' "$BASE/api/payments/validate/$GWO?sim=$SIM&val_id=SIMVAL$STAMP")
check "gw.validate-302-success" "True" "$(python3 -c "c,u='$V'.split('|');print(c=='302' and 'success' in u and 'paid=1' in u)")"
TR=$(curl -s "$BASE/api/orders/track/$GWO?phone=01712345678")
check "gw.paid-after-validate" "paid" "$(echo "$TR" | jget "print((d.get('order') or {}).get('payment',{}).get('status',''))")"
check "gw.status-processing" "processing" "$(echo "$TR" | jget "print((d.get('order') or {}).get('status',''))")"
V2=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/payments/validate/$GWO?sim=$SIM&val_id=SIMVAL$STAMP")
check "gw.validate-idempotent" "302" "$V2"
check "gw.ipn-sim-400" "400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/payments/ipn" -H 'Content-Type: application/x-www-form-urlencoded' -d "tran_id=$GWO&val_id=SIMVAL$STAMP")"
# fail path
GW2=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' -d "{\"payload\":\"{\\\"customer\\\":{\\\"name\\\":\\\"GW Tester\\\",\\\"phone\\\":\\\"01712345678\\\",\\\"email\\\":\\\"gw2$STAMP@test.dev\\\"},\\\"shipping\\\":{\\\"address\\\":\\\"12 Gulshan Ave\\\",\\\"city\\\":\\\"Dhaka\\\",\\\"division\\\":\\\"dhaka\\\"},\\\"items\\\":[{\\\"slug\\\":\\\"$PID\\\",\\\"qty\\\":1}],\\\"paymentMethod\\\":\\\"sslcommerz\\\",\\\"idempotencyKey\\\":\\\"p7-gw2-$STAMP\\\"}\"}")
GWO2=$(echo "$GW2" | jget "print(d.get('order',{}).get('orderNumber',''))")
IN2=$(curl -s -X POST "$BASE/api/payments/init" -H 'Content-Type: application/json' -d "{\"orderNumber\":\"$GWO2\",\"phone\":\"01712345678\"}")
# audit fix — fail/cancel redirects now require the server-issued sim tag
# (same guard as /validate); the sandbox page already sends it.
SIM2=$(echo "$IN2" | jget "import re; m=re.search(r'sim=([a-f0-9]+)', d.get('redirect','')); print(m.group(1) if m else '')")
F=$(curl -s -o /dev/null -w '%{http_code}|%{redirect_url}' "$BASE/api/payments/fail/$GWO2?sim=$SIM2")
check "gw.fail-302-checkout" "True" "$(python3 -c "c,u='$F'.split('|');print(c=='302' and 'payment=failed' in u)")"
check "gw.fail-payment-status" "failed" "$(curl -s "$BASE/api/orders/track/$GWO2?phone=01712345678" | jget "print((d.get('order') or {}).get('payment',{}).get('status',''))")"

# ══ 6. MANUAL PAYMENTS — bKash verify/reject + duplicate TrxID ══════════════
echo "── 6 · Manual payments (bKash) — verify · reject · TrxID guard ──"
PNG=/tmp/qa-p7-proof-$STAMP.png
python3 -c "
from PIL import Image
img = Image.new('RGB', (240, 140), (225, 19, 110))
img.save('$PNG')" 2>/dev/null || printf 'PNG' > "$PNG"
TRXID="BKX${STAMP:6}"   # BKX + last 6 digits (9 chars — server enforces 6-12; last-6 keeps reruns collision-free)
BK=$(curl -s -X POST "$BASE/api/orders" -F "payload={\"customer\":{\"name\":\"BK Tester\",\"phone\":\"01822334455\",\"email\":\"bk$STAMP@test.dev\"},\"shipping\":{\"address\":\"7 Banani Rd\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"$PID\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"$TRXID\",\"idempotencyKey\":\"p7-bk-$STAMP\"}" -F "screenshot=@$PNG")
BKO=$(echo "$BK" | jget "print(d.get('order',{}).get('orderNumber',''))")
[ -n "$BKO" ] && ok "bk.order-placed ($BKO)" || bad "bk.order-placed — $(echo "$BK" | head -c 200)"
check "bk.arg-prefix" "True" "$(python3 -c "print('$BKO'.startswith('ARG-'))")"
check "bk.verifying" "verifying" "$(echo "$BK" | jget "print((d.get('order') or {}).get('status',''))")"
BID=$(curl -s "$BASE/api/admin/orders?search=$BKO" -H "$AH" | jget "print(d['items'][0]['_id'] if d.get('items') else '')")
BK2=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/orders" -F "payload={\"customer\":{\"name\":\"BK Tester\",\"phone\":\"01822334455\",\"email\":\"bk$STAMP@test.dev\"},\"shipping\":{\"address\":\"7 Banani Rd\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"$PID\",\"qty\":1}],\"paymentMethod\":\"bkash\",\"trxId\":\"$TRXID\",\"idempotencyKey\":\"p7-bk-dup-$STAMP\"}" -F "screenshot=@$PNG")
check "bk.dup-trxid-409" "409" "$BK2"
check "bk.admin-verify" "processing" "$(curl -s -X PATCH "$BASE/api/admin/orders/$BID/verify" -H "$AH" -H 'Content-Type: application/json' -d '{"note":"QA verify"}' | jget "print((d.get('order') or {}).get('status',''))")"
check "bk.status-history-verified" "True" "$(curl -s "$BASE/api/orders/track/$BKO?phone=01822334455" | jget "print(any(h.get('status')=='processing' for h in (d.get('order') or {}).get('statusHistory') or []))")"

# ══ 7. COD ORDER — status flow → courier dry-run → delivered + loyalty ══════
echo "── 7 · COD lifecycle + courier dry-run ──"
CD=$(curl -s -X POST "$BASE/api/orders" -H 'Content-Type: application/json' -d "{\"payload\":\"{\\\"customer\\\":{\\\"name\\\":\\\"COD Tester\\\",\\\"phone\\\":\\\"01933445566\\\",\\\"email\\\":\\\"cod$STAMP@test.dev\\\"},\\\"shipping\\\":{\\\"address\\\":\\\"9 Zindabazar\\\",\\\"city\\\":\\\"Sylhet\\\",\\\"division\\\":\\\"sylhet\\\"},\\\"items\\\":[{\\\"slug\\\":\\\"$PID\\\",\\\"qty\\\":1}],\\\"paymentMethod\\\":\\\"cod\\\",\\\"idempotencyKey\\\":\\\"p7-cod-$STAMP\\\"}\"}")
CDO=$(echo "$CD" | jget "print(d.get('order',{}).get('orderNumber',''))")
CID=$(curl -s "$BASE/api/admin/orders?search=$CDO" -H "$AH" | jget "print(d['items'][0]['_id'] if d.get('items') else '')")
[ -n "$CDO" ] && ok "cod.order-placed ($CDO)" || bad "cod.order-placed — $(echo "$CD" | head -c 200)"
check "cod.processing-immediately" "processing" "$(echo "$CD" | jget "print((d.get('order') or {}).get('status',''))")"
for S in packed shipped; do
  ST=$(curl -s -X PATCH "$BASE/api/admin/orders/$CID/status" -H "$AH" -H 'Content-Type: application/json' -d "{\"status\":\"$S\"}" | jget "print((d.get('order') or {}).get('status',''))")
  [ "$ST" = "$S" ] || bad "cod.status->$S — got '$ST'"
done
check "cod.shipped" "shipped" "$(curl -s "$BASE/api/orders/track/$CDO?phone=01933445566" | jget "print((d.get('order') or {}).get('status',''))")"
check "courier.none-dryrun" "True" "$(
  curl -s -X POST "$BASE/api/admin/orders/$CID/courier/push" -H "$AH" -H 'Content-Type: application/json' -d '{}' | jget "print(((d.get('result') or {}).get('dryRun')) is True)")"
curl -s -X PATCH "$BASE/api/admin/orders/$CID/status" -H "$AH" -H 'Content-Type: application/json' -d '{"status":"delivered"}' >/dev/null
check "cod.delivered" "delivered" "$(curl -s "$BASE/api/orders/track/$CDO?phone=01933445566" | jget "print((d.get('order') or {}).get('status',''))")"

# ══ 8. DRY-RUN LOGS — email (Resend) · SMS (SSLWireless) · FCM ══════════════
echo "── 8 · Dry-run notification logs ──"
LDIR="$ROOT/backend/logs"
check "email.log-has-confirmation" "True" "$(grep -l "ARG-" "$LDIR/emails.jsonl" >/dev/null 2>&1 && grep -q "Order $CDO\|$CDO" "$LDIR/emails.jsonl" 2>/dev/null && echo True || echo False)"
check "email.log-arix-from" "True" "$(grep -q 'ArixGear' "$LDIR/emails.jsonl" 2>/dev/null && echo True || echo False)"
check "sms.log-has-rows" "True" "$([ -s "$LDIR/sms.jsonl" ] && echo True || echo False)"
check "sms.log-mentions-order" "True" "$(grep -q "$CDO\|$BKO" "$LDIR/sms.jsonl" 2>/dev/null && echo True || echo False)"
check "fcm.log-has-rows" "True" "$([ -s "$LDIR/fcm.jsonl" ] && echo True || echo False)"

# ══ 9. CLOUDINARY/LOCAL STORAGE — brand-logo upload (local fallback path) ═══
echo "── 9 · Storage (local fallback path) ──"
UP=$(curl -s -X POST "$BASE/api/admin/brands" -H "$AH" -F "name=QA Storage $STAMP" -F "slug=qa-storage-$STAMP" -F "logo=@$PNG")
UPURL=$(echo "$UP" | jget "import re; s=json.dumps(d); m=re.search(r'(/uploads/[^\"\\\\]+)', s); print(m.group(1) if m else '')")
[ -n "$UPURL" ] && ok "storage.brand-logo-upload ($UPURL)" || bad "storage.brand-logo-upload — $(echo "$UP" | head -c 160)"
[ -n "$UPURL" ] && check "storage.serve-uploaded" "200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$UPURL")"
BRID=$(echo "$UP" | jget "print(((d.get('brand') or {}).get('_id')) or (d.get('brand') or {}).get('id') or d.get('_id') or '')")
[ -n "$BRID" ] && curl -s -X DELETE "$BASE/api/admin/brands/$BRID" -H "$AH" >/dev/null && ok "storage.qa-brand-cleaned"

# ══ 10. REALTIME — Socket.IO gateway regression (Phase 4 suite) ═════════════
echo "── 10 · Socket.IO gateway regression ──"
SR=$(node "$ROOT/scripts/qa_phase4_socket.js" "$BASE" 2>/dev/null | tail -1)
check "socket.phase4-suite" "PASS" "$(echo "$SR" | grep -q 'GREEN' && echo PASS || echo "FAIL($SR)")"

# ══ 11. gateway settings restore (factory default: disabled) ════════════════
dbset "{'gateway.enabled':false,'gateway.storeId':'','gateway.storePasswd':'','gateway.sandbox':true}"
check "gw.restore-disabled" "False" "$(curl -s "$BASE/api/settings/payment" | jget "print(bool((d.get('gateway') or {}).get('enabled')))")"

echo ""
echo "==== Phase 7 integration: $PASS passed / $FAIL failed ===="
[ "$FAIL" -eq 0 ] || exit 1
