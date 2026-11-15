#!/bin/bash
# FORGED — production browser e2e: add to cart → checkout COD → success → admin verify
set -u
B=http://127.0.0.1:5000
AB="agent-browser"

# React-compatible fill (native setter + input/change events)
rfill(){
  $AB eval "(function(){const el=document.querySelector('$1');if(!el)return 'no-el';const proto=el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:(el instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype);const d=Object.getOwnPropertyDescriptor(proto,'value').set;d.call(el,'$2');el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()" >/dev/null 2>&1
}
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ $1"; FAIL=$((FAIL+1)); }
curl -sf -m 2 $B/api/health >/dev/null || { echo "STACK DOWN"; exit 1; }

$AB close >/dev/null 2>&1; sleep 1

echo "== 1. STOREFRONT: fresh cart → quick-add belt =="
$AB open $B/index.html >/dev/null 2>&1; sleep 2.5
$AB eval "localStorage.removeItem('forged_v1'); location.reload()" >/dev/null 2>&1; sleep 2.5
CNT0=$($AB eval "(typeof state!=='undefined')?Object.keys(state.cart).length:'-1'" 2>/dev/null | tail -1 | tr -d '"')
echo "  cart before: $CNT0"
[ "$CNT0" = "0" ] && ok "cart starts empty" || bad "cart not empty ($CNT0)"
$AB eval "document.querySelector('[data-add=\"belt\"]').click()" >/dev/null 2>&1; sleep 1
CNT1=$($AB eval "Object.keys(state.cart).length" 2>/dev/null | tail -1 | tr -d '"')
echo "  cart after add: $CNT1"
[ "$CNT1" = "1" ] && ok "belt added to cart" || bad "add failed ($CNT1)"

echo "== 2. CHECKOUT: fill COD form → place order =="
$AB open $B/checkout.html >/dev/null 2>&1; sleep 2
rfill "#coFirst" "Prod" >/dev/null; rfill "#coLast" "Runner" >/dev/null
rfill "#coPhone" "01711997766" >/dev/null
rfill "#coEmail" "prodrunner@t.com" >/dev/null
rfill "#coAddr" "House 9, Road 12, Dhanmondi" >/dev/null
rfill "#coCity" "Dhaka" >/dev/null
$AB eval "const s=document.querySelector('#coDivision'); s.value='dhaka'; s.dispatchEvent(new Event('change'))" >/dev/null 2>&1
$AB eval "document.querySelector('.pm[data-pay=cod]').click()" >/dev/null 2>&1; sleep 0.5
PMS=$($AB eval "document.querySelector('.pm.sel')?.dataset.pay||''" 2>/dev/null | tail -1 | tr -d '"')
echo "  payMethod: $PMS"
[ "$PMS" = "cod" ] && ok "COD selected" || bad "payMethod=$PMS"
TOT=$($AB eval "document.querySelector('#coTotal').textContent" 2>/dev/null | tail -1 | tr -d '"')
echo "  total shown: $TOT"
case "$TOT" in *8,550*) ok "checkout total ৳8,550 (belt ৳8,490 + Dhaka ৳60)";; *) bad "total: $TOT";; esac
$AB eval "document.querySelector('#placeOrder').click()" >/dev/null 2>&1; sleep 3.5
URL=$($AB get url 2>/dev/null | tail -1)
echo "  landed: $URL"
case "$URL" in */success*) ok "redirected to success page";; *) bad "not on success: $URL";; esac

echo "== 3. SUCCESS PAGE =="
SUCNO=$($AB eval "document.querySelector('#succNo')?.textContent||''" 2>/dev/null | tail -1 | tr -d '"')
echo "  order no: $SUCNO"
case "$SUCNO" in FRG-*) ok "order number on success page: $SUCNO";; *) bad "succNo: $SUCNO";; esac
BTEXT=$($AB eval "document.body.innerText" 2>/dev/null | tail -1)
echo "$BTEXT" | grep -q "৳" && ok "BDT amount shown on success page" || bad "no ৳ on success"

echo "== 4. ADMIN: verify the new order =="
$AB open $B/admin/index.html >/dev/null 2>&1; sleep 1.5
rfill "#liEmail" "admin@forged.fit" >/dev/null 2>&1
rfill "#liPass" "ForgeAdmin2026" >/dev/null 2>&1
$AB find text "Sign In" click >/dev/null 2>&1; sleep 2
$AB open $B/admin/orders.html >/dev/null 2>&1; sleep 2
rfill "#ofSearch" "01711997766" >/dev/null 2>&1; sleep 1.5
ROW=$($AB eval "document.querySelectorAll('tbody tr').length + ' rows'" 2>/dev/null | tail -1 | tr -d '"')
echo "  search result: $ROW"
$AB eval "const r=document.querySelector('tbody tr'); if(r) r.querySelector('a,button,[data-open],.row-click')?.click() || r.click()" >/dev/null 2>&1; sleep 2.5
U=$($AB get url 2>/dev/null | tail -1)
case "$U" in */admin/orders/*) ok "order-detail opened";; *) bad "detail url: $U";; esac
$AB find text "Verify" click >/dev/null 2>&1; sleep 1
$AB eval "const b=[...document.querySelectorAll('button')].find(x=>/confirm|yes/i.test(x.textContent)); b&&b.click()" >/dev/null 2>&1; sleep 2
STAT=$($AB eval "document.body.innerText.match(/processing|verifying|packed|shipped|delivered/i)?.[0]||''" 2>/dev/null | tail -1 | tr -d '"')
echo "  status after verify: $STAT"
case "$STAT" in *processing*|*PROCESSING*) ok "order verified → PROCESSING";; *) bad "status: $STAT";; esac

echo "== 5. CONSOLE ERRORS =="
ERRS=$($AB get console 2>/dev/null | grep -ci "error" || true)
[ "$ERRS" = "0" ] && ok "0 console errors" || { $AB get console 2>/dev/null | grep -i error | head -3; bad "$ERRS console errors"; }
$AB screenshot /home/z/my-project/scripts/qa_prod_e2e_verified.png >/dev/null 2>&1
echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
