#!/bin/bash
# FORGED — Task 11 browser QA: catalog-from-API render · admin CSV button · settings SMS card
set -u
B=http://127.0.0.1:5000
AB="agent-browser"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }

curl -sf -m 2 $B/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }
TOK=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
AH="Authorization: Bearer $TOK"
PID=$(curl -s "$B/api/products" | python3 -c 'import sys,json;print([p["_id"] for p in json.load(sys.stdin)["items"] if p["slug"]=="tee"][0])')

$AB close >/dev/null 2>&1; sleep 1

echo "== 1. STOREFRONT RENDERS CATALOG FROM API (decisive: price edit propagates) =="
# bump tee price to 4790 server-side, then load the storefront fresh
curl -s -X PUT $B/api/admin/products/$PID -H "$AH" -F price=4790 > /dev/null
$AB open $B/index.html >/dev/null 2>&1; sleep 2.5
SRC=$($AB eval "CATALOG_SRC" 2>/dev/null | tail -1 | tr -d '"')
echo "  catalog source: $SRC"
[ "$SRC" = "api" ] && ok "CATALOG_SRC === 'api' (grid driven by backend)" || bad "CATALOG_SRC=$SRC"
TEE=$($AB eval "[...document.querySelectorAll('#gearGrid .card')].map(c=>c.querySelector('.price').textContent).find(t=>t.includes('4,790'))||'NOT-FOUND'" 2>/dev/null | tail -1)
[ "$TEE" != "NOT-FOUND" ] && ok "storefront shows admin-edited ৳4,790 for tee" || bad "edited price not rendered ($TEE)"
echo "$($AB eval "[...document.querySelectorAll('#gearGrid .card')].length" 2>/dev/null | tail -1) product cards rendered on index"
# PDP sanity: sizes come from sizeStocks
PDP=$($AB eval "openPDP('tee'); document.querySelector('#pdpSizes').children.length + ' sizes · ' + document.querySelector('#pdpPrice').textContent" 2>/dev/null | tail -1 | tr -d '"')
echo "  PDP: $PDP"
case "$PDP" in 5*sizes*4,790*) ok "PDP opens with 5 size chips (sizeStocks) + ৳4,790";; *) bad "PDP: $PDP";; esac
# revert and confirm live refresh
curl -s -X PUT $B/api/admin/products/$PID -H "$AH" -F price=4490 > /dev/null
$AB open $B/index.html >/dev/null 2>&1; sleep 2.2
TEE2=$($AB eval "[...document.querySelectorAll('#gearGrid .card')].map(c=>c.querySelector('.price').textContent).find(t=>t.includes('4,490'))||'NOT-FOUND'" 2>/dev/null | tail -1)
[ "$TEE2" != "NOT-FOUND" ] && ok "reverted price ৳4,490 renders (admin drives storefront both ways)" || bad "revert not rendered"

echo "== 2. SHOP PAGE FROM API CATALOG =="
$AB open $B/shop.html >/dev/null 2>&1; sleep 2
CNT=$($AB eval "document.querySelector('#shopCount').textContent" 2>/dev/null | tail -1 | tr -d '"')
echo "  shopCount: $CNT"
case "$CNT" in *"8"*) ok "shop lists 8/8 products from API catalog";; *) bad "shopCount=$CNT";; esac

echo "== 3. ADMIN ORDERS — CSV EXPORT BUTTON =="
$AB open $B/admin/index.html >/dev/null 2>&1; sleep 1.5
$AB fill "#liEmail" "admin@forged.fit" >/dev/null
$AB fill "#liPass" "ForgeAdmin2026" >/dev/null
$AB find text "Sign In" click >/dev/null; sleep 2
$AB open $B/admin/orders.html >/dev/null 2>&1; sleep 2
[ "$($AB get count '#ofExport' 2>/dev/null | tail -1)" = "1" ] && ok "Export CSV button present" || bad "export button missing"
$AB find text "Export CSV" click >/dev/null; sleep 1.5
TST=$($AB eval "document.querySelector('#toasts')?document.querySelector('#toasts').textContent:''" 2>/dev/null | tail -1 | tr -d '"')
case "$TST" in *CSV*) ok "export clicked → toast: $(echo $TST | head -c 60)";; *) bad "no export toast: $TST";; esac

echo "== 4. ADMIN SETTINGS — SMS STATUS CARD =="
$AB open $B/admin/settings.html >/dev/null 2>&1; sleep 2
SMS=$($AB eval "[...document.querySelectorAll('.card')].map(c=>c.querySelector('h3')?c.querySelector('h3').textContent:'').join('|')" 2>/dev/null | tail -1 | tr -d '"')
case "$SMS" in *SMS*) ok "SMS card present: $SMS";; *) bad "SMS card missing: $SMS";; esac
MODE=$($AB eval "[...document.querySelectorAll('.card input[readonly]')].map(i=>i.value).join(' / ')" 2>/dev/null | tail -1 | tr -d '"')
echo "  sms fields: $MODE"
case "$MODE" in *sslwireless*dry-run*) ok "settings shows provider=sslwireless · mode=dry-run";; *) bad "sms values: $MODE";; esac

echo "== 5. CONSOLE ERRORS =="
ERRS=$($AB get console 2>/dev/null | grep -ci "error" || true)
[ "$ERRS" = "0" ] && ok "0 console errors" || { echo "$($AB get console 2>/dev/null | grep -i error | head -3)"; bad "$ERRS console errors"; }

$AB screenshot /home/z/my-project/scripts/qa11_settings_sms.png >/dev/null 2>&1
echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
