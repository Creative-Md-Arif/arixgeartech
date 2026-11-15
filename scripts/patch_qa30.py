#!/usr/bin/env python3
"""Replace QA script banner sections (9+10) with fixed assertions."""
import io

path = '/home/z/my-project/scripts/qa_task30_controllers.sh'
with io.open(path, encoding='utf-8') as f:
    lines = f.readlines()

new_section = '''# ── 9. BANNERS L1 — validation + sanitizer + cache ──────────────────────────
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
RO=$(curl -s -X PATCH $BASE/api/admin/banners/reorder -H "$AH" -H 'Content-Type: application/json' -d "{\\"items\\":[{\\"id\\":\\"$NBID\\",\\"order\\":1}]}")
ROHIT=$(echo "$RO" | python3 -c "import sys,json;print(any(i['_id']=='$NBID' and i['order']==1 for i in json.load(sys.stdin)['items']))")
[[ "$ROHIT" == "True" ]] && ok "reorder saved (QA banner → order 1)" "" || bad "reorder" "$RO"
BA=$(curl -s "$BASE/api/admin/banners/analytics" -H "$AH")
TOP2=$(echo "$BA" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['top'][0]['clicks']==2 and d['totals']['clicks']==2)")
[[ "$TOP2" == "True" ]] && ok "banner analytics: 2 clicks on top" "$(echo "$BA" | JQ "['top'][0]['title']")" || bad "banner analytics" "$BA"
DP=$(curl -s -X POST $BASE/api/admin/banners/$NBID/duplicate -H "$AH")
DPID=$(echo "$DP" | JQ "['banner']['_id']")
[[ "$(echo "$DP" | JQ "['banner']['active']")" == "False" && "$(echo "$DP" | JQ "['banner']['title']")" == "QA Drop Banner (copy)" ]] \\
  && ok "duplicate → inactive copy" "$DPID" || bad "duplicate" "$DP"
PUBID=$(echo "$NB" | JQ "['banner']['image']['publicId']")
curl -s -o /dev/null -X DELETE $BASE/api/admin/banners/$NBID -H "$AH"
STILL=$(curl -s "$BASE/api/admin/banners" -H "$AH" | python3 -c "import sys,json;items=json.load(sys.stdin)['items'];print(any(b['_id']=='$DPID' and b['image'].get('publicId')=='$PUBID' for b in items))")
[[ "$STILL" == "True" ]] && ok "shared-image safety: duplicate keeps image after original deleted" "" || bad "shared image" "$STILL"

'''

# replace lines 194..229 (index 193..229 exclusive) — keep line 231 onwards (# ── 11.)
out = lines[:193] + [new_section] + lines[230:]
with io.open(path, 'w', encoding='utf-8') as f:
    f.writelines(out)
print('patched, new total lines:', len(out))
