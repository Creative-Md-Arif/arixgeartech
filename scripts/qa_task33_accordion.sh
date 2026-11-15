#!/usr/bin/env bash
# FORGED — Task 33 QA: Settings page accordion refactor (frontend-only change)
# · settings GET/PUT round-trip unchanged (same API contract)
# · sizeGuide + categories merge semantics intact
# · public endpoint regression (storefront unaffected)
# Usage: bash /home/z/my-project/scripts/qa_task33_accordion.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 33 — Settings accordion (API contract guard) ══"

# ── 0. health (NO reseed — keep whatever state the browser QA left) ─────────
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health" "" || { bad "health" "$H"; exit 1; }

# ── 1. auth ─────────────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']"); AH="Authorization: Bearer $AT"
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || { bad "admin login" "$AD"; exit 1; }

# ── 2. GET settings — shape the new accordion consumes ──────────────────────
S=$(curl -s $BASE/api/admin/settings -H "$AH")
[[ "$(echo "$S" | JQ "['setting']['store']['name']")" != "None" ]] && ok "GET settings — store block" "$(echo "$S" | JQ "['setting']['store']['name']")" || bad "GET settings" "$S"
[[ "$(echo "$S" | JQ "['setting']['payments']['bkash']['number']")" != "None" ]] && ok "GET settings — payments block" "$(echo "$S" | JQ "['setting']['payments']['bkash']['number']")" || bad "payments block" "missing"
[[ "$(echo "$S" | JQ "['setting']['sizeGuide']")" != "None" ]] && ok "GET settings — sizeGuide block" "headers=$(echo "$S" | JQ "['setting']['sizeGuide']['headers']")" || bad "sizeGuide block" "missing"

# ── 3. PUT round-trip — exact body the new toBody() sends ───────────────────
echo "$S" > /tmp/t33_settings.json
BODY=$(python3 - <<'PY'
import json
s=json.load(open('/tmp/t33_settings.json'))['setting']
body={
 "payments":{m:{"number":s.get("payments",{}).get(m,{}).get("number",""),"ussd":s.get("payments",{}).get(m,{}).get("ussd","")} for m in ["bkash","nagad","rocket"]},
 "shipping":{"divisions":{},"freeThreshold":s.get("shipping",{}).get("freeThreshold",0)},
 "store":{k:s.get("store",{}).get(k,"") for k in ["name","email","phone","address"]},
 "pixel":{"enabled":bool(s.get("pixel",{}).get("enabled")),"pixelId":s.get("pixel",{}).get("pixelId","")},
 "chat":{"enabled":s.get("chat",{}).get("enabled",True),"whatsapp":s.get("chat",{}).get("whatsapp",""),"telegram":s.get("chat",{}).get("telegram",""),"greeting":s.get("chat",{}).get("greeting","")},
 "courier":s.get("courier",{}),
 "sizeGuide":s.get("sizeGuide",{}),
}
for dv in ["dhaka","chattogram","rajshahi","khulna","barishal","sylhet","rangpur","mymensingh"]:
    body["shipping"]["divisions"][dv]=s.get("shipping",{}).get("divisions",{}).get(dv,0)
print(json.dumps(body))
PY
)
UP=$(curl -s -X PUT $BASE/api/admin/settings -H "$AH" -H 'Content-Type: application/json' -d "$BODY")
[[ "$(echo "$UP" | JQ "['setting']['store']['name']")" != "None" ]] && ok "PUT round-trip (toBody-shaped payload)" "store=$(echo "$UP" | JQ "['setting']['store']['name']")" || bad "PUT round-trip" "$(echo "$UP" | head -c 300)"
[[ "$(echo "$UP" | JQ "['setting']['sizeGuide']['headers']")" != "None" ]] && ok "sizeGuide survives round-trip" "$(echo "$UP" | JQ "['setting']['sizeGuide']['headers']")" || bad "sizeGuide round-trip" "missing"

# ── 4. categories merge semantics still intact (flag-only PUT must not wipe) ─
N_CAT=$(echo "$UP" | JQ "['setting']['sizeGuide']['categories']")
FB='{"shipping":{"divisions":{"dhaka":60,"chattogram":120,"rajshahi":130,"khulna":130,"barishal":130,"sylhet":140,"rangpur":140,"mymensingh":140},"freeThreshold":150}}'
UP2=$(curl -s -X PUT $BASE/api/admin/settings -H "$AH" -H 'Content-Type: application/json' -d "$FB")
N_CAT2=$(echo "$UP2" | JQ "['setting']['sizeGuide']['categories']")
[[ "$N_CAT" == "$N_CAT2" ]] && ok "flag-only PUT keeps sizeGuide.categories (merge)" "" || bad "merge semantics" "before=$N_CAT after=$N_CAT2"

# ── 5. public regression ────────────────────────────────────────────────────
for EP in products categories settings/size-guide settings/payment settings/shipping settings/content settings/pixel settings/chat; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE/api/$EP)
  [[ "$CODE" == "200" ]] && ok "public /api/$EP" "200" || bad "public /api/$EP" "$CODE"
done
SG=$(curl -s $BASE/api/settings/size-guide)
NCAT=$(echo "$SG" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('categories') or {}))" 2>/dev/null)
[[ -n "$NCAT" && "$NCAT" != "0" ]] && ok "public size-guide exposes categories map" "$NCAT category table(s)" || bad "public size-guide categories" "missing/empty"

# ── 6. admin SPA served fresh ───────────────────────────────────────────────
AJ=$(curl -s $BASE/admin/ | rg -o 'assets/index-[^"]+\.js' | head -1)
[[ -n "$AJ" ]] && ok "admin SPA index served" "$AJ" || bad "admin SPA" "no asset ref"
ACODE=$(curl -s -o /dev/null -w "%{http_code}" $BASE/admin/$AJ)
[[ "$ACODE" == "200" ]] && ok "admin bundle 200" "$ACODE" || bad "admin bundle" "$ACODE"

echo "══ Task 33 curl QA: PASS=$PASS FAIL=$FAIL ══"
[[ $FAIL -eq 0 ]]
