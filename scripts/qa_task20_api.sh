#!/usr/bin/env bash
# FORGED — Task 20 API verification
# Membership system: duration packages (3/6/12 mo) + monthly (Admission Fee first month,
# Monthly Fee only afterwards) · join/apply · admin verify/reject · track · renew · plans CRUD
B="http://localhost:5000/api"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  ✗ $1"; }
jqpy(){ python3 -c "import sys,json;d=json.load(sys.stdin);$1"; }
PROOF="/home/z/my-project/backend/src/seed/demo-proof.png"
[ -f "$PROOF" ] || PROOF=$(ls /home/z/my-project/backend/uploads/*.png 2>/dev/null | head -1)
PH1="01700000001"; PH2="01700000002"; PH3="01700000003"; PH4="01700000004"

echo "── 1. plans (grouped duration/monthly, fee math) ──"
curl -s $B/membership/plans | jqpy 'assert len(d["duration"])==3 and len(d["monthly"])==1' >/dev/null 2>&1 && ok "3 duration + 1 monthly plan" || bad "plan grouping"
MONTHLY_ID=$(curl -s $B/membership/plans | jqpy 'print(d["monthly"][0]["id"])')
STARTER_ID=$(curl -s $B/membership/plans | jqpy 'print([p for p in d["duration"] if p["name"]=="Starter"][0]["id"])')
curl -s $B/membership/plans | jqpy 'm=d["monthly"][0];assert m["admissionFee"]==1000 and m["monthlyFee"]==800 and m["firstMonthTotal"]==1800 and m["renewalAmount"]==800' >/dev/null 2>&1 && ok "monthly: admission ৳1000 + monthly ৳800 → first month ৳1800, renewal ৳800" || bad "monthly fee math"
curl -s $B/membership/plans | jqpy 's=[p for p in d["duration"] if p["name"]=="Starter"][0];assert s["price"]==3000 and s["durationMonths"]==3 and s["firstMonthTotal"]==3000' >/dev/null 2>&1 && ok "Starter: ৳3000 · 3 months" || bad "duration fee math"

echo "── 2. join (apply) — first month = Admission + Monthly ──"
RES=$(curl -s -X POST $B/membership/apply -F "name=QA Member One" -F "phone=$PH1" -F "email=qa1@test.fit" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20JOIN1" -F "proof=@$PROOF")
echo "$RES" | jqpy 'm=d["member"];assert m["due"]==1800 and m["status"]=="pending"' >/dev/null 2>&1 && ok "apply → due ৳1800 (admission+1st month), status pending" || bad "apply due/status: $RES"
CODE1=$(echo "$RES" | jqpy 'print(d["member"]["code"])')
echo "$CODE1" | grep -qE '^FRG-M-[0-9]{4,}$' && ok "member code format ($CODE1)" || bad "member code format: $CODE1"
curl -s -X POST $B/membership/apply -F "name=QA Dup" -F "phone=$PH1" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20DUP01" -F "proof=@$PROOF" | grep -q 'Track & Renew' && ok "duplicate phone → 409 with Track & Renew hint" || bad "duplicate phone guard"
curl -s -X POST $B/membership/apply -F "name=QA Dup Tx" -F "phone=$PH2" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20JOIN1" -F "proof=@$PROOF" | grep -q 'already used' && ok "duplicate TrxID → 409 anti-fraud" || bad "txid anti-fraud"
curl -s -X POST $B/membership/apply -F "name=QA Bad Phone" -F "phone=12345" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20BAD01" -F "proof=@$PROOF" | grep -q 'valid Bangladeshi' && ok "invalid phone → 400" || bad "phone validation"
curl -s "$B/membership/track/$PH1?code=$CODE1" | jqpy 'm=d["member"];assert d["found"] is True and m["status"]=="pending" and m["dueNow"]==1800 and m["admissionPaid"] is False' >/dev/null 2>&1 && ok "track (pre-verify): pending · dueNow ৳1800 · admission not settled" || bad "track pre-verify"

echo "── 3. admin — verify join → active, admission settled, expiry +1 month ──"
AT=$(curl -s -X POST $B/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c "import sys,json;print(json.load(sys.stdin).get('token',''))")
AH="Authorization: Bearer $AT"
[ ${#AT} -gt 30 ] && ok "admin login" || bad "admin login"
MID=$(curl -s "$B/admin/members?q=$PH1" -H "$AH" | jqpy 'print(d["items"][0]["_id"])')
PAYJ=$(curl -s "$B/admin/members/$MID" -H "$AH" | jqpy 'print(d["member"]["payments"][0]["_id"])')
NOW=$(date +%s)
curl -s -X PATCH $B/admin/members/$MID/payments/$PAYJ/verify -H "$AH" -H 'Content-Type: application/json' -d '{}' | jqpy 'm=d["member"];assert m["status"]=="active" and m["admissionPaid"] is True' >/dev/null 2>&1 && ok "verify join → active + admissionPaid" || bad "verify join"
curl -s "$B/admin/members/$MID" -H "$AH" | jqpy "import datetime;m=d['member'];days=(datetime.datetime.fromisoformat(m['expiryDate'].replace('Z','+00:00'))-datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)).days;assert 28<=days<=33, days" >/dev/null 2>&1 && ok "expiry = +1 month (28-33 days)" || bad "expiry math"
curl -s "$B/membership/track/$PH1?code=$CODE1" | jqpy 'm=d["member"];assert m["status"]=="active" and m["nextRenew"]==800 and m["payments"][0]["status"]=="verified"' >/dev/null 2>&1 && ok "track (post-verify): active · nextRenew ৳800" || bad "track post-verify"

echo "── 4. renew — Monthly Fee ONLY (no admission again) ──"
curl -s -X POST $B/membership/renew -F "phone=$PH1" -F "method=nagad" -F "txid=QA20REN1" -F "proof=@$PROOF" | jqpy 'assert d["member"]["due"]==800' >/dev/null 2>&1 && ok "renew → due ৳800 only (admission never again)" || bad "renew amount"
EXP1=$(curl -s "$B/membership/track/$PH1?code=$CODE1" | jqpy 'print(d["member"]["expiryDate"])')
curl -s -X POST $B/membership/renew -F "phone=$PH1" -F "method=nagad" -F "txid=QA20REN2" -F "proof=@$PROOF" | grep -q 'awaiting verification' && ok "second renew while pending → 409" || bad "pending renew guard"
PAYR=$(curl -s "$B/admin/members/$MID" -H "$AH" | jqpy "p=[x for x in d['member']['payments'] if x['status']=='pending'];print(p[0]['_id'])")
curl -s -X PATCH $B/admin/members/$MID/payments/$PAYR/verify -H "$AH" -H 'Content-Type: application/json' -d '{}' >/dev/null
EXP2=$(curl -s "$B/membership/track/$PH1?code=$CODE1" | jqpy 'print(d["member"]["expiryDate"])')
python3 -c "
import datetime
a=datetime.datetime.fromisoformat('$EXP1'.replace('Z','+00:00'))
b=datetime.datetime.fromisoformat('$EXP2'.replace('Z','+00:00'))
dd=(b-a).days
assert 27<=dd<=32, dd
" 2>/dev/null && ok "verify renew → expiry extended exactly +1 month" || bad "renew extension math ($EXP1 → $EXP2)"

echo "── 5. duration package (Starter 3 months) ──"
curl -s -X POST $B/membership/apply -F "name=QA Member Three" -F "phone=$PH3" -F "planId=$STARTER_ID" -F "method=rocket" -F "txid=QA20DUR3" -F "proof=@$PROOF" | jqpy 'assert d["member"]["due"]==3000' >/dev/null 2>&1 && ok "duration apply → due ৳3000" || bad "duration apply"
MID3=$(curl -s "$B/admin/members?q=$PH3" -H "$AH" | jqpy 'print(d["items"][0]["_id"])')
PAYD=$(curl -s "$B/admin/members/$MID3" -H "$AH" | jqpy 'print(d["member"]["payments"][0]["_id"])')
curl -s -X PATCH $B/admin/members/$MID3/payments/$PAYD/verify -H "$AH" -H 'Content-Type: application/json' -d '{}' >/dev/null
curl -s "$B/admin/members/$MID3" -H "$AH" | jqpy "import datetime;m=d['member'];days=(datetime.datetime.fromisoformat(m['expiryDate'].replace('Z','+00:00'))-datetime.datetime.utcnow().replace(tzinfo=datetime.timezone.utc)).days;assert 88<=days<=94, days" >/dev/null 2>&1 && ok "duration verify → expiry = +3 months (88-94 days)" || bad "3-month expiry math"
curl -s -X POST $B/membership/renew -F "phone=$PH3" -F "method=bkash" -F "txid=QA20DUR3R" -F "proof=@$PROOF" | jqpy 'assert d["member"]["due"]==3000' >/dev/null 2>&1 && ok "duration renew = package re-buy ৳3000" || bad "duration renew amount"

echo "── 6. reject flow ──"
curl -s -X POST $B/membership/apply -F "name=QA Member Four" -F "phone=$PH4" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20REJ1" -F "proof=@$PROOF" >/dev/null
MID4=$(curl -s "$B/admin/members?q=$PH4" -H "$AH" | jqpy 'print(d["items"][0]["_id"])')
PAY4=$(curl -s "$B/admin/members/$MID4" -H "$AH" | jqpy 'print(d["member"]["payments"][0]["_id"])')
curl -s -X PATCH $B/admin/members/$MID4/payments/$PAY4/reject -H "$AH" -H 'Content-Type: application/json' -d '{}' | jqpy 'assert d["member"]["status"]=="rejected"' >/dev/null 2>&1 && ok "reject join → member rejected" || bad "reject join"
curl -s -X POST $B/membership/renew -F "phone=$PH4" -F "method=bkash" -F "txid=QA20REJ2" -F "proof=@$PROOF" | grep -q 'join again' && ok "rejected member cannot renew" || bad "rejected renew guard"

echo "── 7. plans admin CRUD ──"
NP=$(curl -s -X POST $B/admin/membership/plans -H "$AH" -H 'Content-Type: application/json' -d '{"type":"monthly","name":"QA Plan","tagline":"QA","admissionFee":500,"monthlyFee":600,"features":"Feature A\nFeature B","order":9}')
echo "$NP" | jqpy 'p=d["plan"];assert p["firstMonthTotal"]==1100 and len(p["features"])==2' >/dev/null 2>&1 && ok "admin create monthly plan (features from newline text)" || bad "plan create"
NPID=$(echo "$NP" | jqpy 'print(d["plan"]["_id"])')
curl -s $B/membership/plans | grep -q 'QA Plan' && ok "new plan live on storefront API" || bad "plan not public"
curl -s -X PUT $B/admin/membership/plans/$NPID -H "$AH" -H 'Content-Type: application/json' -d '{"monthlyFee":650}' | jqpy 'assert d["plan"]["monthlyFee"]==650 and d["plan"]["firstMonthTotal"]==1150' >/dev/null 2>&1 && ok "admin update plan fees" || bad "plan update"
curl -s -X POST $B/admin/membership/plans -H "$AH" -H 'Content-Type: application/json' -d '{"type":"duration","name":"Bad Plan","durationMonths":0,"price":100}' | grep -q '1-36 months' && ok "duration 1-36 months validated" || bad "duration validation"
curl -s -X DELETE $B/admin/membership/plans/$NPID -H "$AH" | grep -q '"ok":true' && ok "admin delete plan" || bad "plan delete"
curl -s $B/membership/plans | grep -q 'QA Plan' && bad "deleted plan still public" || ok "deleted plan gone from storefront"

echo "── 8. member list filters + counts ──"
curl -s "$B/admin/members?status=active" -H "$AH" | jqpy 'assert all(i["status"]=="active" for i in d["items"])' >/dev/null 2>&1 && ok "status=active filter" || bad "active filter"
curl -s "$B/admin/members" -H "$AH" | jqpy 'c=d["counts"];assert c["all"]>=3 and c["active"]>=2 and c["rejected"]>=1' >/dev/null 2>&1 && ok "counts (all/active/rejected)" || bad "counts"
curl -s "$B/admin/members?q=$CODE1" -H "$AH" | jqpy 'assert len(d["items"])==1 and d["items"][0]["code"]=="'$CODE1'"' >/dev/null 2>&1 && ok "search by member code" || bad "code search"

echo "── 9. guards + regression ──"
curl -s "$B/membership/track/01999999999?code=FRG-M-0000" | jqpy 'assert d["found"] is False' >/dev/null 2>&1 && ok "track unknown phone → found:false" || bad "track unknown"
curl -s -X POST $B/membership/apply -F "name=QA No Proof" -F "phone=01700000005" -F "planId=$MONTHLY_ID" -F "method=bkash" -F "txid=QA20NOPF1" | grep -q 'screenshot is required' && ok "payment screenshot required" || bad "screenshot guard"
GUARD=$(curl -s -o /dev/null -w '%{http_code}' "$B/admin/members")
[ "$GUARD" = "401" ] && ok "members list is admin-only (401)" || bad "admin guard ($GUARD)"
curl -s $B/health | grep -q '"ok":true' && ok "health regression" || bad "health"
curl -s "$B/products?limit=4" | jqpy 'assert len(d["items"])==4' >/dev/null 2>&1 && ok "products regression" || bad "products"

echo "── 10. cleanup QA data ──"
for M in $MID $MID3 $MID4; do curl -s -X DELETE $B/admin/members/$M -H "$AH" >/dev/null; done
LEFT=$(curl -s "$B/admin/members" -H "$AH" | jqpy 'print(len([i for i in d["items"] if i["phone"].startswith("017000000")]))')
[ "$LEFT" = "0" ] && ok "QA members removed" || bad "cleanup left $LEFT members"

echo ""
echo "════════ TASK 20 MEMBERSHIP: $PASS passed · $FAIL failed ════════"
[ $FAIL -eq 0 ]
