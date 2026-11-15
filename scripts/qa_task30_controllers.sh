#!/usr/bin/env bash
# FORGED — Task 30 QA: Question/Membership/Banner controllers Layer 1+2+3 + ENV
# QUESTIONS  · rate-limit route · anti-spam (links/dup) · JWT auto-name + mine ·
#             admin search/counts · answer edit + unanswer · bulk delete ·
#             helpful votes · stats (response time / trend / top products)
# MEMBERSHIP · apply/renew/track limiters · track hardened (phone+code) ·
#             email validation · re-join after rejection · SMS hooks ·
#             CSV export · plan-delete guard · analytics (MRR/revenue/expiring)
# BANNERS    · strict validation · link sanitizer (XSS) · cache bump ·
#             schedule window · reorder · duplicate (shared-image safe) ·
#             click tracking · analytics
# ENV        · .env.example production checklist · admin system/status
# Usage: bash /home/z/my-project/scripts/qa_task30_controllers.sh
set -u
BASE="${BASE:-http://localhost:5000}"
PASS=0; FAIL=0; note() { echo "  └─ $1"; }
ok()   { PASS=$((PASS+1)); echo "PASS $1"; note "$2"; }
bad()  { FAIL=$((FAIL+1)); echo "FAIL $1"; note "$2"; }
JQ() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

echo "══ QA Task 30 — Questions + Membership + Banners + ENV ══"

# ── 0. fresh seed ───────────────────────────────────────────────────────────
cd /home/z/my-project/backend && node src/seed/seed.js > /dev/null 2>&1
H=$(curl -s $BASE/api/health); [[ "$H" == *'"ok":true'* ]] && ok "health (fresh seed)" "" || { bad "health" "$H"; exit 1; }

# ── 1. auth ─────────────────────────────────────────────────────────────────
AD=$(curl -s -X POST $BASE/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}')
AT=$(echo "$AD" | JQ "['token']"); AH="Authorization: Bearer $AT"
[[ -n "$AT" && "$AT" != "None" ]] && ok "admin login" "" || { bad "admin login" "$AD"; exit 1; }
RU=$(curl -s -X POST $BASE/api/auth/register -H 'Content-Type: application/json' \
  -d '{"name":"QA Asker","email":"qa30asker@forged.fit","password":"forge30ask","phone":"01755566688"}')
# Task 51 — register no longer returns a token; exchange the emailed OTP for one
UT=$(curl -s -X POST $BASE/api/auth/verify-email -H 'Content-Type: application/json' \
  -d "{\"email\":\"qa30asker@forged.fit\",\"code\":\"$(echo "$RU" | JQ "['devOtp']")\"}" | JQ "['token']")
UH="Authorization: Bearer $UT"
[[ -n "$UT" && "$UT" != "None" ]] && ok "asker account registered + verified (OTP)" "" || { bad "asker register" "$RU"; exit 1; }

# ── 2. unauth guards ────────────────────────────────────────────────────────
for EP in "GET /api/admin/questions/stats" "PATCH /api/admin/questions/bulk" "PATCH /api/admin/questions/000000000000000000000000/unanswer" "GET /api/admin/members/analytics" "GET /api/admin/members/export.csv" "PATCH /api/admin/banners/reorder" "POST /api/admin/banners/000000000000000000000000/duplicate" "GET /api/admin/banners/analytics" "GET /api/admin/system/status"; do
  M=${EP%% *}; U=${EP#* }
  C=$(curl -s -o /tmp/q30u -w '%{http_code}' -X $M "$BASE$U" -H 'Content-Type: application/json' -d '{}')
  [[ "$C" == 401 ]] && ok "unauth 401 — $M $(basename $U)" "" || bad "unauth $U" "$C"
done

# ── 3. QUESTIONS L1 — ask + anti-spam + dup guard ───────────────────────────
Q1=$(curl -s -X POST $BASE/api/products/whey/questions -H 'Content-Type: application/json' -d '{"name":"Rakib","question":"Does this whey mix well with water only?"}')
[[ "$(echo "$Q1" | JQ "['ok']")" == "True" ]] && ok "guest question submitted (pending)" "" || bad "guest question" "$Q1"
for TP in '{"name":"X","question":"hi"}' '{"question":"no name given for this one"}' '{"name":"Spam Bot","question":"cheap gear http://a.co http://b.co http://c.co now"}'; do
  C=$(curl -s -o /tmp/q30q -w '%{http_code}' -X POST $BASE/api/products/whey/questions -H 'Content-Type: application/json' -d "$TP")
  [[ "$C" == 400 ]] && ok "question 400 — ${TP:0:40}…" "$(cat /tmp/q30q)" || bad "question should 400" "$C $TP"
done
DQ=$(curl -s -o /tmp/q30dq -w '%{http_code}' -X POST $BASE/api/products/whey/questions -H 'Content-Type: application/json' -d '{"name":"Rakib","question":"Does this whey mix well with water only?"}')
[[ "$DQ" == 409 ]] && ok "duplicate question within 10min → 409" "$(cat /tmp/q30dq)" || bad "dup guard" "$DQ $(cat /tmp/q30dq)"

# logged-in ask without name → account name auto-fill + mine flag
QA2=$(curl -s -X POST $BASE/api/products/belt/questions -H "$UH" -H 'Content-Type: application/json' -d '{"question":"Is the 10MM belt allowed in IPF competitions?"}')
[[ "$(echo "$QA2" | JQ "['ok']")" == "True" ]] && ok "logged-in ask (no name) accepted" "" || bad "JWT ask" "$QA2"
MINE=$(curl -s "$BASE/api/products/belt/questions?mine=1" -H "$UH")
MNAME=$(echo "$MINE" | JQ "['mine'][0]['name']")
MST=$(echo "$MINE" | JQ "['mine'][0]['status']")
[[ "$MNAME" == "QA Asker" && "$MST" == "pending" ]] && ok "mine view: own pending question + auto name" "$MNAME/$MST" || bad "mine view" "$MNAME/$MST"
PUB=$(curl -s "$BASE/api/products/belt/questions")
PUBHIT=$(echo "$PUB" | python3 -c "import sys,json;print(any('IPF competitions' in i['question'] for i in json.load(sys.stdin)['items']))")
[[ "$PUBHIT" == "False" ]] && ok "pending hidden from public list (seed Qs still visible)" "" || bad "pending visibility" "$PUB"

# ── 4. QUESTIONS L2 — answer / edit / unanswer / bulk / search ──────────────
QLIST=$(curl -s "$BASE/api/admin/questions?filter=unanswered" -H "$AH")
QID=$(echo "$QLIST" | python3 -c "import sys,json;items=json.load(sys.stdin)['items'];print(next(i['_id'] for i in items if i['product']['slug']=='whey'))")
QID2=$(echo "$QLIST" | python3 -c "import sys,json;items=json.load(sys.stdin)['items'];print(next((i['_id'] for i in items if i['product']['slug']=='knee'), ''))")
[[ -n "$QID" && "$QID" != "None" ]] && ok "admin list unanswered + slug-aware pick" "count=$(echo "$QLIST" | JQ "['counts']['unanswered']")" || bad "admin list" "$QLIST"
AN=$(curl -s -X PUT $BASE/api/admin/questions/$QID -H "$AH" -H 'Content-Type: application/json' -d '{"answer":"Yes — mixes clean in a shaker with just water."}')
[[ "$(echo "$AN" | JQ "['item']['answered']")" == "True" && "$(echo "$AN" | JQ "['item']['answeredAt']")" != "None" ]] && ok "answer published + answeredAt set" "" || bad "answer" "$AN"
AN2=$(curl -s -X PUT $BASE/api/admin/questions/$QID -H "$AH" -H 'Content-Type: application/json' -d '{"answer":"Yes — mixes clean in a shaker. Updated wording."}')
[[ "$(echo "$AN2" | JQ "['item']['answer']")" == *"Updated wording"* ]] && ok "answer edit works" "" || bad "answer edit" "$AN2"
PUB2=$(curl -s "$BASE/api/products/whey/questions")
PUB2HIT=$(echo "$PUB2" | python3 -c "import sys,json;print(any('Updated wording' in i['answer'] for i in json.load(sys.stdin)['items']))")
[[ "$PUB2HIT" == "True" ]] && ok "answered question live on PDP" "" || bad "PDP visibility" "$PUB2"
MYV=$(curl -s "$BASE/api/products/whey/questions" -H "$UH")
[[ "$(echo "$MYV" | JQ "['items'][0]['myVote']")" == "0" ]] && ok "public items carry myVote/helpful shape" "" || bad "item shape" "$MYV"
UN=$(curl -s -X PATCH $BASE/api/admin/questions/$QID/unanswer -H "$AH")
[[ "$(echo "$UN" | JQ "['item']['answered']")" == "False" && "$(echo "$UN" | JQ "['item']['answer']")" == "" ]] && ok "unanswer → back to queue" "" || bad "unanswer" "$UN"
PUB3=$(curl -s "$BASE/api/products/whey/questions")
PUB3HIT=$(echo "$PUB3" | python3 -c "import sys,json;print(any('Updated wording' in i['answer'] for i in json.load(sys.stdin)['items']))")
[[ "$PUB3HIT" == "False" ]] && ok "withdrawn answer hidden again" "" || bad "withdraw visibility" "$PUB3"
curl -s -o /dev/null -X PUT $BASE/api/admin/questions/$QID -H "$AH" -H 'Content-Type: application/json' -d '{"answer":"Yes — mixes clean in a shaker with just water."}'
SR=$(curl -s "$BASE/api/admin/questions?q=IPF" -H "$AH")
[[ "$(echo "$SR" | JQ "['items'][0]['question']")" == *"IPF"* ]] && ok "admin search q=IPF finds belt question" "" || bad "admin search" "$SR"

# ── 5. QUESTIONS L3 — helpful votes + stats ─────────────────────────────────
HV=$(curl -s -X POST $BASE/api/questions/$QID/helpful -H 'Content-Type: application/json' -d '{"vote":1}')
[[ "$(echo "$HV" | JQ "['helpfulCount']")" == "1" && "$(echo "$HV" | JQ "['voted']")" == "True" ]] && ok "helpful vote +1" "$HV" || bad "helpful vote" "$HV"
HV2=$(curl -s -X POST $BASE/api/questions/$QID/helpful -H 'Content-Type: application/json' -d '{"vote":1}')
[[ "$(echo "$HV2" | JQ "['helpfulCount']")" == "1" ]] && ok "re-vote idempotent" "" || bad "idempotent" "$HV2"
HV3=$(curl -s -X POST $BASE/api/questions/$QID/helpful -H 'Content-Type: application/json' -d '{"vote":-1}')
[[ "$(echo "$HV3" | JQ "['helpfulCount']")" == "0" && "$(echo "$HV3" | JQ "['voted']")" == "False" ]] && ok "toggle -1 removes vote" "" || bad "toggle" "$HV3"
C=$(curl -s -o /tmp/q30hv -w '%{http_code}' -X POST $BASE/api/questions/$QID/helpful -H 'Content-Type: application/json' -d '{"vote":5}')
[[ "$C" == 400 ]] && ok "vote=5 → 400" "$(cat /tmp/q30hv)" || bad "vote validation" "$C"
C=$(curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/questions/000000000000000000000000/helpful -H 'Content-Type: application/json' -d '{"vote":1}')
[[ "$C" == 404 ]] && ok "helpful on missing question → 404" "" || bad "helpful 404" "$C"
HS=$(curl -s "$BASE/api/products/whey/questions?sort=helpful")
[[ "$(echo "$HS" | JQ "['items'][0]['id']")" != "None" ]] && ok "sort=helpful accepted" "" || bad "sort helpful" "$HS"
QS=$(curl -s "$BASE/api/admin/questions/stats" -H "$AH")
SUM=$(echo "$QS" | python3 -c "import sys,json;c=json.load(sys.stdin)['counts'];print(c['all']==6 and c['unanswered']+c['answered']==c['all'])")
[[ "$SUM" == "True" && "$(echo "$QS" | JQ "['topProducts'][0]['count']")" != "None" ]] \
  && ok "question stats (6 total, counts consistent, topProducts)" "unanswered=$(echo "$QS" | JQ "['counts']['unanswered']")" || bad "question stats" "$QS"
BD=$(curl -s -o /tmp/q30bd -w '%{http_code}' -X PATCH $BASE/api/admin/questions/bulk -H "$AH" -H 'Content-Type: application/json' -d "{\"ids\":[\"$QID2\"],\"action\":\"delete\"}")
[[ "$BD" == 200 && "$(cat /tmp/q30bd | JQ "['deleted']")" == "1" ]] && ok "bulk delete 1 question" "$(cat /tmp/q30bd)" || bad "bulk delete" "$BD $(cat /tmp/q30bd)"

# ── 6. MEMBERSHIP L1 — validation + hardened track ──────────────────────────
PL=$(curl -s $BASE/api/membership/plans)
MON=$(echo "$PL" | JQ "['monthly'][0]['id']"); MONFEE=$(echo "$PL" | JQ "['monthly'][0]['monthlyFee']"); ADMFEE=$(echo "$PL" | JQ "['monthly'][0]['admissionFee']")
DUE=$((ADMFEE + MONFEE))
IMG=src/seed/demo-proof.png
C=$(curl -s -o /tmp/q30mp -w '%{http_code}' -X POST $BASE/api/membership/apply -F 'name=R' -F 'phone=01711000001' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA01' -F "proof=@$IMG")
[[ "$C" == 400 ]] && ok "apply 1-char name → 400" "$(cat /tmp/q30mp)" || bad "name validation" "$C"
C=$(curl -s -o /tmp/q30mp -w '%{http_code}' -X POST $BASE/api/membership/apply -F 'name=Bad Phone' -F 'phone=12345' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA01' -F "proof=@$IMG")
[[ "$C" == 400 ]] && ok "apply bad phone → 400" "$(cat /tmp/q30mp)" || bad "phone validation" "$C"
C=$(curl -s -o /tmp/q30mp -w '%{http_code}' -X POST $BASE/api/membership/apply -F 'name=Bad Email' -F 'phone=01711000001' -F 'email=not-an-email' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA01' -F "proof=@$IMG")
[[ "$C" == 400 ]] && ok "apply invalid email → 400 (Task 30)" "$(cat /tmp/q30mp)" || bad "email validation" "$C"
M1=$(curl -s -X POST $BASE/api/membership/apply -F 'name=Tanvir Ahmed' -F 'phone=01711000001' -F 'email=tanvir@qa.fit' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA01' -F "proof=@$IMG")
MCODE=$(echo "$M1" | JQ "['member']['code']")
[[ "$(echo "$M1" | JQ "['member']['due']")" == "$DUE" && "$MCODE" != "None" ]] && ok "member joined (due=admission+1st month ৳$DUE)" "$MCODE" || bad "join" "$M1"
C=$(curl -s -o /tmp/q30dup -w '%{http_code}' -X POST $BASE/api/membership/apply -F 'name=Tanvir Again' -F 'phone=01711000001' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA02' -F "proof=@$IMG")
[[ "$C" == 409 ]] && ok "duplicate phone → 409" "$(cat /tmp/q30dup)" || bad "dup phone" "$C"
C=$(curl -s -o /tmp/q30tk -w '%{http_code}' "$BASE/api/membership/track/01711000001")
[[ "$C" == 400 ]] && ok "track WITHOUT code → 400 (privacy hardening)" "$(cat /tmp/q30tk)" || bad "track no code" "$C $(cat /tmp/q30tk)"
C=$(curl -s -o /tmp/q30tk -w '%{http_code}' "$BASE/api/membership/track/01711000001?code=FRG-M-9999")
[[ "$C" == 404 ]] && ok "track wrong code → 404 (no leak)" "$(cat /tmp/q30tk)" || bad "track wrong code" "$C"
C=$(curl -s -o /tmp/q30tk -w '%{http_code}' "$BASE/api/membership/track/01711000001?code=$MCODE")
[[ "$C" == 200 && "$(cat /tmp/q30tk | JQ "['found']")" == "True" ]] && ok "track phone+code → 200" "$MCODE" || bad "track ok" "$C $(cat /tmp/q30tk)"

# ── 7. MEMBERSHIP L2 — verify + SMS + renew + reject + re-join ──────────────
ML=$(curl -s "$BASE/api/admin/members?q=$MCODE" -H "$AH")
MID=$(echo "$ML" | JQ "['items'][0]['_id']")
PAYID=$(echo "$ML" | JQ "['items'][0]['payments'][0]['_id']")
VP=$(curl -s -X PATCH $BASE/api/admin/members/$MID/payments/$PAYID/verify -H "$AH" -H 'Content-Type: application/json' -d '{"note":"TrxID matched"}')
[[ "$(echo "$VP" | JQ "['member']['status']")" == "active" && "$(echo "$VP" | JQ "['member']['payments'][0]['verifiedAt']")" != "None" ]] \
  && ok "join verified → active + verifiedAt audit" "expiry=$(echo "$VP" | JQ "['member']['expiryDate']")" || bad "verify" "$VP"
SMSLINE=$(tail -5 logs/sms.jsonl 2>/dev/null | grep "$MCODE" | tail -1)
[[ "$SMSLINE" == *"ACTIVE till"* ]] && ok "welcome SMS logged (dry-run)" "${SMSLINE:0:100}…" || bad "welcome SMS" "$SMSLINE"
TR=$(curl -s "$BASE/api/membership/track/01711000001?code=$MCODE")
DL=$(echo "$TR" | JQ "['member']['expiresInDays']")
[[ "$DL" =~ ^[0-9]+$ && "$DL" -gt 25 ]] && ok "track shows expiresInDays ~30" "$DL days" || bad "expiresInDays" "$DL"
RN=$(curl -s -X POST $BASE/api/membership/renew -F 'phone=01711000001' -F 'method=nagad' -F 'txid=MEMRN01' -F "proof=@$IMG")
[[ "$(echo "$RN" | JQ "['member']['due']")" == "$MONFEE" ]] && ok "renew due = monthly fee only ৳$MONFEE" "" || bad "renew" "$RN"
C=$(curl -s -o /tmp/q30rn -w '%{http_code}' -X POST $BASE/api/membership/renew -F 'phone=01711000001' -F 'method=nagad' -F 'txid=MEMRN02' -F "proof=@$IMG")
[[ "$C" == 409 ]] && ok "second renew while pending → 409" "$(cat /tmp/q30rn)" || bad "renew pending guard" "$C"
ML2=$(curl -s "$BASE/api/admin/members?q=$MCODE" -H "$AH")
MID2=$(echo "$ML2" | JQ "['items'][0]['_id']")
PAYID2=$(curl -s "$BASE/api/admin/members/$MID2" -H "$AH" | python3 -c "import sys,json;m=json.load(sys.stdin)['member'];print([p['_id'] for p in m['payments'] if p['status']=='pending'][0])")
EX1=$(curl -s "$BASE/api/admin/members/$MID2" -H "$AH" | JQ "['member']['expiryDate']")
VR=$(curl -s -X PATCH $BASE/api/admin/members/$MID2/payments/$PAYID2/verify -H "$AH" -H 'Content-Type: application/json' -d '{}')
EX2=$(echo "$VR" | JQ "['member']['expiryDate']")
[[ "$EX2" != "$EX1" && "$(echo "$VR" | JQ "['member']['status']")" == "active" ]] && ok "renew verified → expiry extended ($EX1 → $EX2)" "" || bad "renew verify" "$EX1→$EX2"
SMSLINE2=$(tail -5 logs/sms.jsonl 2>/dev/null | grep -c "renewed")
[[ "$SMSLINE2" -ge 1 ]] && ok "renewal SMS logged" "" || bad "renewal SMS" "no renewed line"
M2=$(curl -s -X POST $BASE/api/membership/apply -F 'name=Sadia Noor' -F 'phone=01711000002' -F "planId=$MON" -F 'method=rocket' -F 'txid=MEMQA03' -F "proof=@$IMG")
M2CODE=$(echo "$M2" | JQ "['member']['code']")
M2LIST=$(curl -s "$BASE/api/admin/members?q=$M2CODE" -H "$AH"); M2ID=$(echo "$M2LIST" | JQ "['items'][0]['_id']")
M2PAY=$(curl -s "$BASE/api/admin/members/$M2ID" -H "$AH" | python3 -c "import sys,json;m=json.load(sys.stdin)['member'];print([p['_id'] for p in m['payments'] if p['status']=='pending'][0])")
RJ=$(curl -s -X PATCH $BASE/api/admin/members/$M2ID/payments/$M2PAY/reject -H "$AH" -H 'Content-Type: application/json' -d '{"note":"Wrong amount sent"}')
[[ "$(echo "$RJ" | JQ "['member']['status']")" == "rejected" ]] && ok "join rejected w/ note" "" || bad "reject" "$RJ"
SMSLINE3=$(tail -5 logs/sms.jsonl 2>/dev/null | grep "01711000002" | tail -1)
[[ "$SMSLINE3" == *"Wrong amount sent"* ]] && ok "rejection SMS carries reason" "${SMSLINE3:0:100}…" || bad "reject SMS" "$SMSLINE3"
RE=$(curl -s -X POST $BASE/api/membership/apply -F 'name=Sadia Noor' -F 'phone=01711000002' -F "planId=$MON" -F 'method=bkash' -F 'txid=MEMQA04' -F "proof=@$IMG")
[[ "$(echo "$RE" | JQ "['rejoin']")" == "True" && "$(echo "$RE" | JQ "['member']['code']")" == "$M2CODE" ]] \
  && ok "REJECTED member re-joins (Task 30 fix) — same code" "$M2CODE" || bad "re-join" "$RE"

# ── 8. MEMBERSHIP L3 — expiring + CSV + plan guard + analytics ──────────────
node -e "
const mongoose=require('mongoose');require('dotenv').config();
const Member=require('./src/models/Member');
(async()=>{
  await mongoose.connect(process.env.MONGODB_URI||'mongodb://127.0.0.1:27017/arixgear');
  const m=await Member.findOne({phone:'01711000001'});
  m.expiryDate=new Date(Date.now()+3*86400000); await m.save();
  console.log('expiring set:',m.code); await mongoose.disconnect();
})();" > /tmp/q30exp.log 2>&1
[[ "$(cat /tmp/q30exp.log)" == *"expiring set"* ]] && ok "test member expiry doctored to +3d" "" || bad "expiry doctor" "$(cat /tmp/q30exp.log)"
EXP=$(curl -s "$BASE/api/admin/members?expiring=1" -H "$AH")
[[ "$(echo "$EXP" | JQ "['items'][0]['code']")" == "$MCODE" && "$(echo "$EXP" | JQ "['counts']['expiring']")" == "1" ]] \
  && ok "expiring=1 filter + counts.expiring" "expiring=$(echo "$EXP" | JQ "['counts']['expiring']")" || bad "expiring filter" "$EXP"
CSV=$(curl -s "$BASE/api/admin/members/export.csv" -H "$AH")
[[ "$CSV" == *'"code","name","phone"'* && "$CSV" == *"$MCODE"* && "$CSV" == *"Tanvir Ahmed"* ]] \
  && ok "members CSV export (BOM + headers + row)" "" || bad "csv" "$(echo "$CSV" | head -2)"
PG=$(curl -s "$BASE/api/admin/members/analytics" -H "$AH")
MRRV=$(echo "$PG" | JQ "['mrr']")
[[ "$(echo "$PG" | JQ "['revenue']['join']")" == "$DUE" && "$MRRV" == "$MONFEE" && "$(echo "$PG" | JQ "['expiring'][0]['code']")" == "$MCODE" ]] \
  && ok "membership analytics (join ৳$DUE · MRR ৳$MONFEE · expiring call list)" "" || bad "analytics" "$PG"
NP=$(curl -s -X POST $BASE/api/admin/membership/plans -H "$AH" -H 'Content-Type: application/json' -d '{"type":"duration","name":"QA Guard Plan","durationMonths":2,"price":1500}')
NPID=$(echo "$NP" | JQ "['plan']['_id']")
C=$(curl -s -o /tmp/q30pg -w '%{http_code}' -X DELETE "$BASE/api/admin/membership/plans/$NPID?force=true" -H "$AH")
[[ "$C" == 200 ]] && ok "unused plan force-delete ok" "" || bad "unused plan delete" "$C"
MONDOC=$(curl -s "$BASE/api/admin/membership/plans" -H "$AH" | python3 -c "import sys,json;items=json.load(sys.stdin)['items'];print([p['_id'] for p in items if p['type']=='monthly'][0])")
C=$(curl -s -o /tmp/q30pg -w '%{http_code}' -X DELETE $BASE/api/admin/membership/plans/$MONDOC -H "$AH")
[[ "$C" == 409 ]] && ok "plan delete with active member → 409 guard" "$(cat /tmp/q30pg)" || bad "plan guard" "$C $(cat /tmp/q30pg)"
C=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/membership/plans/$MONDOC?force=true" -H "$AH")
[[ "$C" == 200 ]] && ok "plan force-delete override ok" "" || bad "plan force" "$C"

# ── 9. BANNERS L1 — validation + sanitizer + cache ──────────────────────────
BB='src/seed/demo-proof.png'
C=$(curl -s -o /tmp/q30b -w '%{http_code}' -X POST $BASE/api/admin/banners -H "$AH" -F 'position=hero' -F "image=@$BB")
[[ "$C" == 400 ]] && ok "banner create missing title → 400" "$(cat /tmp/q30b)" || bad "title guard" "$C"
C=$(curl -s -o /tmp/q30b -w '%{http_code}' -X POST $BASE/api/admin/banners -H "$AH" -F 'title=NoX' -F 'position=sidebar' -F "image=@$BB")
[[ "$C" == 400 ]] && ok "banner create bad position → 400 (no 500!)" "$(cat /tmp/q30b)" || bad "position guard" "$C"
C=$(curl -s -o /tmp/q30b -w '%{http_code}' -X POST $BASE/api/admin/banners -H "$AH" -F 'title=BadLink' -F 'link=javascript:alert(1)' -F "image=@$BB")
[[ "$C" == 400 ]] && ok "banner create javascript: link → 400 (XSS blocked)" "$(cat /tmp/q30b)" || bad "link sanitizer" "$C"
C=$(curl -s -o /tmp/q30b -w '%{http_code}' -X POST $BASE/api/admin/banners -H "$AH" -F 'title=BadOrder' -F 'order=-3' -F "image=@$BB")
[[ "$C" == 400 ]] && ok "banner create order=-3 → 400" "$(cat /tmp/q30b)" || bad "order guard" "$C"
NB=$(curl -s -X POST $BASE/api/admin/banners -H "$AH" -F 'title=QA Drop Banner' -F 'subtitle=Limited run' -F 'ctaText=GRAB IT' -F 'link=/shop' -F 'position=promo' -F 'order=5' -F 'image=@src/seed/demo-proof.png')
NBID=$(echo "$NB" | JQ "['banner']['_id']")
[[ "$(echo "$NB" | JQ "['banner']['title']")" == "QA Drop Banner" && "$(echo "$NB" | JQ "['banner']['position']")" == "promo" ]] && ok "banner created (multipart)" "$NBID" || bad "banner create" "$NB"
PB=$(curl -s "$BASE/api/banners?position=promo")
PBHIT=$(echo "$PB" | python3 -c "import sys,json;print(any(i['title']=='QA Drop Banner' for i in json.load(sys.stdin)['items']))")
[[ "$PBHIT" == "True" ]] && ok "cache bumped — new banner instantly public" "" || bad "cache bump" "$PB"
C=$(curl -s -o /tmp/q30bu -w '%{http_code}' -X PUT $BASE/api/admin/banners/$NBID -H "$AH" -F 'title=' -F 'position=promo' -F 'order=5')
[[ "$C" == 400 ]] && ok "banner update empty title → 400" "$(cat /tmp/q30bu)" || bad "update guard" "$C"

# ── 10. BANNERS L2/L3 — schedule / reorder / clicks / duplicate / analytics ─
FUT=$(python3 -c "import datetime;print((datetime.datetime.utcnow()+datetime.timedelta(days=2)).strftime('%Y-%m-%dT%H:%M:00Z'))")
SC=$(curl -s -X PUT $BASE/api/admin/banners/$NBID -H "$AH" -F 'title=QA Drop Banner' -F 'position=promo' -F 'order=5' -F "startsAt=$FUT")
[[ "$(echo "$SC" | JQ "['banner']['startsAt']")" != "None" ]] && ok "schedule startsAt set (future)" "" || bad "schedule set" "$SC"
PB2=$(curl -s "$BASE/api/banners?position=promo")
PB2HIT=$(echo "$PB2" | python3 -c "import sys,json;print(any(i['title']=='QA Drop Banner' for i in json.load(sys.stdin)['items']))")
[[ "$PB2HIT" == "False" ]] && ok "future banner hidden from public (schedule window)" "" || bad "schedule hide" "$PB2"
curl -s -o /dev/null -X PUT $BASE/api/admin/banners/$NBID -H "$AH" -F 'title=QA Drop Banner' -F 'position=promo' -F 'order=5' -F 'startsAt='
CL=$(curl -s -X POST $BASE/api/banners/$NBID/click)
[[ "$(echo "$CL" | JQ "['ok']")" == "True" ]] && ok "CTA click ping" "" || bad "click" "$CL"
curl -s -o /dev/null -X POST $BASE/api/banners/$NBID/click
RO=$(curl -s -X PATCH $BASE/api/admin/banners/reorder -H "$AH" -H 'Content-Type: application/json' -d "{\"items\":[{\"id\":\"$NBID\",\"order\":1}]}")
ROHIT=$(echo "$RO" | python3 -c "import sys,json;print(any(i['_id']=='$NBID' and i['order']==1 for i in json.load(sys.stdin)['items']))")
[[ "$ROHIT" == "True" ]] && ok "reorder saved (QA banner → order 1)" "" || bad "reorder" "$RO"
BA=$(curl -s "$BASE/api/admin/banners/analytics" -H "$AH")
TOP2=$(echo "$BA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['top'][0]['clicks']==2 and d['totals']['clicks']==2)")
[[ "$TOP2" == "True" ]] && ok "banner analytics: 2 clicks on top" "$(echo "$BA" | JQ "['top'][0]['title']")" || bad "banner analytics" "$BA"
DP=$(curl -s -X POST $BASE/api/admin/banners/$NBID/duplicate -H "$AH")
DPID=$(echo "$DP" | JQ "['banner']['_id']")
[[ "$(echo "$DP" | JQ "['banner']['active']")" == "False" && "$(echo "$DP" | JQ "['banner']['title']")" == "QA Drop Banner (copy)" ]] \
  && ok "duplicate → inactive copy" "$DPID" || bad "duplicate" "$DP"
PUBID=$(echo "$NB" | JQ "['banner']['image']['publicId']")
curl -s -o /dev/null -X DELETE $BASE/api/admin/banners/$NBID -H "$AH"
STILL=$(curl -s "$BASE/api/admin/banners" -H "$AH" | python3 -c "import sys,json;items=json.load(sys.stdin)['items'];print(any(b['_id']=='$DPID' and b['image'].get('publicId')=='$PUBID' for b in items))")
[[ "$STILL" == "True" ]] && ok "shared-image safety: duplicate keeps image after original deleted" "" || bad "shared image" "$STILL"

# ── 11. ENV + system status ─────────────────────────────────────────────────
grep -q "SMS_DRY_RUN" .env.example && grep -q "ADMIN_NOTIFY_EMAIL" .env.example && grep -q "mongodb+srv" .env.example && grep -q "CLOUDINARY_API_SECRET" .env.example \
  && ok ".env.example production checklist (Atlas/Cloudinary/SMS/notify)" "" || bad ".env.example" "missing keys"
SS=$(curl -s "$BASE/api/admin/system/status" -H "$AH")
[[ "$(echo "$SS" | JQ "['checks']['database']['replicaSet']")" == "False" && "$(echo "$SS" | JQ "['checks']['sms']['mode']")" == "dry-run" && "$(echo "$SS" | JQ "['checks']['builds']['frontend']")" == "True" ]] \
  && ok "system/status checklist (replicaSet=false, sms=dry-run, builds ok)" "node $(echo "$SS" | JQ "['node']")" || bad "system status" "$SS"
NOTIF=$(curl -s -X POST $BASE/api/products/whey/questions -H 'Content-Type: application/json' -d '{"name":"Notify Probe","question":"Testing admin email alert delivery path."}')
EM=$(tail -3 logs/emails.jsonl 2>/dev/null | grep -c "new question")
[[ "$EM" -ge 1 ]] && ok "admin question alert emailed (dry-run log)" "" || bad "question alert" "no email logged"

echo "══════════════════════════════════════════"
echo "TOTAL: $PASS passed · $FAIL failed"
[[ $FAIL -eq 0 ]] && echo "🎉 TASK 30 QA ALL GREEN" || echo "❌ FIX FAILURES ABOVE"
exit $FAIL
