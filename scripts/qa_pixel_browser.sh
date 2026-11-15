#!/bin/bash
# FORGED — Facebook Pixel browser E2E: admin toggles pixel → storefront injects + fires events
set -u
B=http://127.0.0.1:5000
API=http://localhost:5000/api
AB="agent-browser"

# React-compatible fill (native setter + input/change events)
rfill(){
  $AB eval "(function(){const el=document.querySelector('$1');if(!el)return 'no-el';const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype);const d=Object.getOwnPropertyDescriptor(proto,'value').set;d.call(el,'$2');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
}
ROOT=/home/z/my-project
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }
evs(){ $AB eval "JSON.stringify((window.__fbEvents||[]).map(e=>e.event+(e.event==='Purchase'?':'+(e.params.order_id||''):'')))" 2>/dev/null | tail -1 | tr -d '"'; }
curl -sf -m 3 $API/health >/dev/null || { echo "STACK DOWN"; exit 1; }

TOK=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | jqpy 'print(d["token"])' 2>/dev/null)
AH="Authorization: Bearer $TOK"
[ -n "$TOK" ] || { echo "admin login failed"; exit 1; }

$AB close >/dev/null 2>&1; sleep 1

echo "== 0. PREP: pixel OFF in DB → storefront must stay dark =="
curl -s -X PUT $API/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":false,"pixelId":"9876543210987654"}}' > /dev/null
$AB open $B/index.html >/dev/null 2>&1; sleep 2.5
DARK=$($AB eval "window.forgedPixel&&forgedPixel.enabled" 2>/dev/null | tail -1 | tr -d '"')
[ "$DARK" = "false" ] && ok "pixel off → forgedPixel.enabled=false" || bad "off state ($DARK)"
FBQ=$($AB eval "typeof window.fbq" 2>/dev/null | tail -1 | tr -d '"')
[ "$FBQ" = "undefined" ] && ok "no fbq injected while disabled" || bad "fbq leaked ($FBQ)"
NEV=$($AB eval "(window.__fbEvents||[]).length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NEV" = "0" ] && ok "zero events tracked while disabled" || bad "events while off ($NEV)"

echo "== 1. ADMIN ENABLES PIXEL → reload storefront → pixel live =="
curl -s -X PUT $API/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true,"pixelId":"9876543210987654"}}' > /dev/null
$AB open $B/index.html >/dev/null 2>&1; sleep 3
LIVE=$($AB eval "window.forgedPixel&&forgedPixel.enabled&&forgedPixel.pixelId" 2>/dev/null | tail -1 | tr -d '"')
[ "$LIVE" = "9876543210987654" ] && ok "forgedPixel enabled with admin ID" || bad "pixel not live ($LIVE)"
FBQ=$($AB eval "typeof window.fbq" 2>/dev/null | tail -1 | tr -d '"')
[ "$FBQ" = "function" ] && ok "fbq base code injected" || bad "fbq type ($FBQ)"
INIT=$($AB eval "window.fbq&&fbq.queue!==undefined" 2>/dev/null | tail -1 | tr -d '"')
[ "$INIT" = "true" ] && ok "pixel queue initialized" || bad "queue ($INIT)"
E=$(evs)
echo "$E" | grep -q "PageView" && ok "PageView fired on homepage ($E)" || bad "no PageView ($E)"

echo "== 2. ADD TO CART → AddToCart event =="
$AB eval "localStorage.removeItem('forged_v1');location.reload()" >/dev/null 2>&1; sleep 2.5
$AB eval "document.querySelector('[data-add=\"belt\"]').click()" >/dev/null 2>&1; sleep 1.2
E=$(evs)
echo "$E" | grep -q "AddToCart" && ok "AddToCart fired" || bad "no AddToCart ($E)"
VAL=$($AB eval "(__fbEvents.find(e=>e.event==='AddToCart')||{}).params&&__fbEvents.find(e=>e.event==='AddToCart').params.value" 2>/dev/null | tail -1 | tr -d '"')
[ "$VAL" = "8490" ] && ok "AddToCart value ৳8,490 (belt)" || bad "AddToCart value ($VAL)"
CUR=$($AB eval "__fbEvents.find(e=>e.event==='AddToCart').params.currency" 2>/dev/null | tail -1 | tr -d '"')
[ "$CUR" = "BDT" ] && ok "currency BDT" || bad "currency ($CUR)"

echo "== 3. PDP → ViewContent =="
$AB eval "document.querySelector('.card-media[data-open=\"belt\"]')?.click() || document.querySelector('[data-open=\"belt\"]').click()" >/dev/null 2>&1; sleep 1.2
E=$(evs); echo "$E" | grep -q "ViewContent" && ok "ViewContent fired on PDP" || bad "no ViewContent ($E)"
$AB eval "closePDP&&closePDP()" >/dev/null 2>&1; sleep 0.5

echo "== 4. CHECKOUT → InitiateCheckout =="
$AB open $B/checkout.html >/dev/null 2>&1; sleep 2.5
E=$(evs); echo "$E" | grep -q "InitiateCheckout" && ok "InitiateCheckout fired" || bad "no InitiateCheckout ($E)"
NIT=$($AB eval "__fbEvents.filter(e=>e.event==='InitiateCheckout').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NIT" = "1" ] && ok "InitiateCheckout exactly once per page view" || bad "count ($NIT)"
IVAL=$($AB eval "__fbEvents.find(e=>e.event==='InitiateCheckout').params.value" 2>/dev/null | tail -1 | tr -d '"')
[ "$IVAL" = "8490" ] && ok "InitiateCheckout value ৳8,490" || bad "InitiateCheckout value ($IVAL)"

echo "== 5. PLACE COD ORDER → Purchase on success =="
rfill "#coFirst" "Pixel" >/dev/null; rfill "#coLast" "Tester" >/dev/null
rfill "#coPhone" "01711445566" >/dev/null
rfill "#coEmail" "pixeltester@t.com" >/dev/null
rfill "#coAddr" "Road 5, Banani" >/dev/null
rfill "#coCity" "Dhaka" >/dev/null
$AB eval "const s=document.querySelector('#coDivision'); s.value='dhaka'; s.dispatchEvent(new Event('change'))" >/dev/null 2>&1
$AB eval "document.querySelector('.pm[data-pay=cod]').click()" >/dev/null 2>&1; sleep 0.4
$AB eval "document.querySelector('#placeOrder').click()" >/dev/null 2>&1; sleep 3.5
URL=$($AB get url 2>/dev/null | tail -1)
case "$URL" in *success.html*) ok "order placed → success page";; *) bad "not on success: $URL";; esac
E=$(evs)
echo "$E" | grep -q "Purchase" && ok "Purchase fired ($E)" || bad "no Purchase ($E)"
OID=$($AB eval "__fbEvents.find(e=>e.event==='Purchase').params.order_id" 2>/dev/null | tail -1 | tr -d '"')
case "$OID" in FRG-*) ok "Purchase carries order_id ($OID)";; *) bad "order_id ($OID)";; esac
PVAL=$($AB eval "__fbEvents.find(e=>e.event==='Purchase').params.value" 2>/dev/null | tail -1 | tr -d '"')
[ "$PVAL" = "8550" ] && ok "Purchase value ৳8,550 (belt + Dhaka shipping)" || bad "Purchase value ($PVAL)"
NPUR=$($AB eval "__fbEvents.filter(e=>e.event==='Purchase').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NPUR" = "1" ] && ok "Purchase fired exactly once" || bad "Purchase count ($NPUR)"
$AB eval "location.reload()" >/dev/null 2>&1; sleep 2.5
NPUR2=$($AB eval "JSON.parse(localStorage.getItem('forged_px_purchase_'+__fbEvents.find(e=>e.event==='Purchase')?.params.order_id||'x')||'0')||__fbEvents.filter(e=>e.event==='Purchase').length" 2>/dev/null | tail -1 | tr -d '"')
[ "$NPUR2" = "0" ] && ok "reload → Purchase NOT re-fired (dedup flag)" || bad "re-fired on reload ($NPUR2)"

echo "== 6. SEARCH event =="
$AB open $B/shop.html >/dev/null 2>&1; sleep 2
rfill "#shopSearch" "belt" >/dev/null 2>&1; sleep 1.5
E=$(evs); echo "$E" | grep -q "Search" && ok "Search fired on shop search" || bad "no Search ($E)"
SQ=$($AB eval "__fbEvents.filter(e=>e.event==='Search').pop().params.search_string" 2>/dev/null | tail -1 | tr -d '"')
[ "$SQ" = "belt" ] && ok "search_string='belt'" || bad "search_string ($SQ)"

echo "== 7. ADMIN DISABLES → next page load is dark =="
curl -s -X PUT $API/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":false}}' > /dev/null
$AB open $B/about.html >/dev/null 2>&1; sleep 2.5
DARK=$($AB eval "window.forgedPixel&&forgedPixel.enabled" 2>/dev/null | tail -1 | tr -d '"')
FBQ=$($AB eval "typeof window.fbq" 2>/dev/null | tail -1 | tr -d '"')
[ "$DARK" = "false" ] && [ "$FBQ" = "undefined" ] && ok "disabled → fresh page has no pixel at all" || bad "disable reflect ($DARK/$FBQ)"

echo "== 8. ADMIN SETTINGS PAGE shows pixel config =="
curl -s -X PUT $API/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"pixel":{"enabled":true}}' > /dev/null
$AB open $B/admin/index.html >/dev/null 2>&1; sleep 1.5
rfill "#liEmail" "admin@forged.fit" >/dev/null 2>&1
rfill "#liPass" "ForgeAdmin2026" >/dev/null 2>&1
$AB find text "Sign In" click >/dev/null 2>&1; sleep 1.5
$AB open $B/admin/settings.html >/dev/null 2>&1; sleep 2
PXV=$($AB eval "document.querySelector('#pxId')?.value||''" 2>/dev/null | tail -1 | tr -d '"')
[ "$PXV" = "9876543210987654" ] && ok "settings page shows saved Pixel ID" || bad "pxId field ($PXV)"
STS=$($AB eval "document.querySelector('#pxStatus')?.value||''" 2>/dev/null | tail -1)
echo "$STS" | grep -q "ACTIVE" && ok "status shows ACTIVE" || bad "status ($STS)"
SELO=$($AB eval "document.querySelector('#pxOn').value" 2>/dev/null | tail -1 | tr -d '"')
[ "$SELO" = "on" ] && ok "tracking toggle reflects ENABLED" || bad "toggle ($SELO)"
# flip via UI: disable + save
rfill "#pxOn" "off" >/dev/null 2>&1; $AB eval "document.querySelector('#saveSettings').click()" >/dev/null 2>&1; sleep 1.5
PUB=$(curl -s $API/settings/pixel | jqpy 'print(d["pixel"]["enabled"])' 2>/dev/null)
[ "$PUB" = "False" ] && ok "admin UI disable → public API goes dark (live round-trip)" || bad "UI disable ($PUB)"
# re-enable via UI for the delivered state
rfill "#pxOn" "on" >/dev/null 2>&1; $AB eval "document.querySelector('#saveSettings').click()" >/dev/null 2>&1; sleep 1.5
PUB=$(curl -s $API/settings/pixel | jqpy 'p=d["pixel"];print(str(p["enabled"])+"|"+p["pixelId"])' 2>/dev/null)
[ "$PUB" = "True|9876543210987654" ] && ok "admin UI re-enable → pixel live again" || bad "UI enable ($PUB)"

echo "== 9. CONSOLE =="
ERRS=$($AB get console 2>/dev/null | grep -ci "error" || true)
[ "$ERRS" = "0" ] && ok "0 console errors" || { $AB get console 2>/dev/null | grep -i error | head -3; bad "$ERRS console errors"; }

echo
echo "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ] && echo "QA_PIXEL_BROWSER: ALL PASS" || echo "QA_PIXEL_BROWSER: FAILURES"
exit $FAIL
