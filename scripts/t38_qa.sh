#!/bin/bash
# Task 38 QA — banner video upload (API level)
AT=$(cat /home/z/my-project/scripts/t36_at)
API=http://localhost:5000
VID=/home/z/my-project/scripts/t38_test_video.mp4
POSTER=/home/z/my-project/download/forged-full-project/frontend/public/assets/hero-3.png
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "PASS · $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL · $1"; }
J() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);$1}catch(e){console.log('PARSE_ERR')}})"; }

# 1. create VIDEO banner (multipart: video + poster)
CR=$(curl -s -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=T38 VIDEO REEL" -F "subtitle=Cinematic training footage" -F "ctaText=WATCH" \
  -F "link=/shop" -F "position=hero" -F "order=1" -F "active=true" -F "mediaType=video" \
  -F "video=@$VID;type=video/mp4" -F "image=@$POSTER;type=image/png")
BID=$(echo "$CR" | J "console.log(j.banner._id)")
VURL=$(echo "$CR" | J "console.log(j.banner.video.url)")
IURL=$(echo "$CR" | J "console.log(j.banner.image.url)")
[ -n "$BID" ] && [ "$BID" != "PARSE_ERR" ] && ok "video banner created ($BID)" || bad "create failed: $CR"
[ "$(echo "$CR" | J "console.log(j.banner.mediaType)")" = "video" ] && ok "mediaType=video saved" || bad "mediaType wrong"
[ -n "$VURL" ] && ok "video url: $VURL" || bad "no video url"
[ -n "$IURL" ] && ok "poster url: $IURL" || bad "no poster url"

# 2. video file served
VBASE=$(basename "$VURL")
VTYPE=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$API/uploads/$VBASE")
echo "$VTYPE" | grep -q "^200 video" && ok "video file served ($VTYPE)" || bad "video serve → $VTYPE"

# 3. public list exposes mediaType/video/poster + cache bumped
sleep 0.3
PL=$(curl -s "$API/api/banners?position=hero")
IT=$(echo "$PL" | J "const it=j.items.find(x=>x.title==='T38 VIDEO REEL');console.log(it?it.mediaType:'MISSING')")
[ "$IT" = "video" ] && ok "publicList mediaType=video" || bad "publicList mediaType → $IT"
echo "$PL" | grep -q '"video":' && ok "publicList has video field" || bad "publicList missing video field"

# 4. validation guards
C1=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=NO MEDIA" -F "mediaType=image")
[ "$C1" = 400 ] && ok "create with no media → 400" || bad "no-media create → $C1"
C2=$(curl -s -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=VID NO FILE" -F "mediaType=video" | head -c 120)
echo "$C2" | grep -qE "Banner (image or )?video is required" && ok "video type without file → 400 msg" || bad "video-no-file → $C2"
C3=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=BAD SLOT" -F "mediaType=video" -F "video=@$VID;type=video/mp4" -F "image=@$VID;type=video/mp4")
[ "$C3" = 400 ] && ok "video file in the image slot rejected by field filter → 400" || bad "bad slot → $C3"
C4=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=TXT FAKE" -F "mediaType=video" -F "video=@/home/z/my-project/scripts/t36_start_api.js;type=video/mp4")
[ "$C4" = 400 ] && ok "renamed .js with fake video/mp4 mime rejected by content sniffing → 400" || bad "fake video → $C4"
C5=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API/api/admin/banners" -H "Authorization: Bearer $AT" \
  -F "title=FAKE IMG" -F "mediaType=image" -F "image=@$VID;type=image/png")
[ "$C5" = 400 ] && ok "mp4 bytes with fake image/png mime rejected → 400" || bad "fake image → $C5"

# 5. update: replace poster only (video intact)
P2=/home/z/my-project/download/forged-full-project/frontend/public/assets/hero-1.png
UP=$(curl -s -X PUT "$API/api/admin/banners/$BID" -H "Authorization: Bearer $AT" \
  -F "title=T38 VIDEO REEL" -F "mediaType=video" -F "image=@$P2;type=image/png")
U2=$(echo "$UP" | J "const b=j.banner;console.log(b.mediaType + '|' + (b.video&&b.video.url?'V':'NONE') + '|' + ((b.image&&b.image.url==='$IURL')?'SAME':'CHANGED'))")
[ "$U2" = "video|V|CHANGED" ] && ok "poster replaced, video intact" || bad "poster update → $U2"
OLDFILE=$(basename "$IURL")
NIMG=$(echo "$UP" | J "console.log(j.banner.image && j.banner.image.url || 'NONE')")
sleep 0.6
[ -f "/home/z/my-project/download/forged-full-project/backend/uploads/$(basename "$NIMG")" ] && ok "NEW poster file exists on disk (no aliasing delete)" || bad "NEW poster deleted by mongoose aliasing bug"
[ ! -f "/home/z/my-project/download/forged-full-project/backend/uploads/$OLDFILE" ] && ok "OLD poster file released from disk (no leak)" || bad "OLD poster leaked on disk"

# 6. switch mediaType video → image (no new video) → video dropped
SW=$(curl -s -X PUT "$API/api/admin/banners/$BID" -H "Authorization: Bearer $AT" \
  -F "title=T38 IMAGE FALLBACK" -F "mediaType=image")
S2=$(echo "$SW" | J "console.log(j.banner.mediaType + '|' + (j.banner.video.url?'HASVID':'CLEARED') + '|' + (j.banner.image.url?'HASIMG':'NOIMG'))")
[ "$S2" = "image|CLEARED|HASIMG" ] && ok "switch video→image: video cleared, image kept" || bad "switch → $S2"
curl -s -o /dev/null "$API/uploads/$VBASE" && [ ! -f "/home/z/my-project/download/forged-full-project/backend/uploads/$VBASE" ] && ok "old video file released from disk" || bad "old video file still on disk"

# 7. switch back to video (new upload)
SWB=$(curl -s -X PUT "$API/api/admin/banners/$BID" -H "Authorization: Bearer $AT" \
  -F "title=T38 VIDEO REEL" -F "subtitle=Cinematic training footage" -F "mediaType=video" -F "video=@$VID;type=video/mp4")
VURL2=$(echo "$SWB" | J "console.log(j.banner.video.url)")
[ "$(echo "$SWB" | J "console.log(j.banner.mediaType)")" = "video" ] && [ -n "$VURL2" ] && ok "switch image→video with new upload works" || bad "switch back → $(echo $SWB | head -c 150)"

# 8. duplicate shares video ref
DUP=$(curl -s -X POST "$API/api/admin/banners/$BID/duplicate" -H "Authorization: Bearer $AT")
DID=$(echo "$DUP" | J "console.log(j.banner._id)")
DPID=$(echo "$DUP" | J "console.log(j.banner.video.publicId)")
OPID=$(curl -s -H "Authorization: Bearer $AT" "$API/api/admin/banners" | J "console.log(j.items.find(x=>x._id==='$BID').video.publicId)")
[ "$DPID" = "$OPID" ] && [ "$(echo "$DUP" | J "console.log(j.banner.active)")" = "false" ] && ok "duplicate shares video publicId + starts hidden" || bad "duplicate → $DPID vs $OPID"

# 9. delete original → video kept (dup holds ref); delete dup → video released
curl -s -o /dev/null -X DELETE "$API/api/admin/banners/$BID" -H "Authorization: Bearer $AT"
[ -f "/home/z/my-project/download/forged-full-project/backend/uploads/$(basename "$VURL2")" ] && ok "delete #1: video file survives (shared with dup)" || bad "video file deleted while dup still references it"
curl -s -o /dev/null -X DELETE "$API/api/admin/banners/$DID" -H "Authorization: Bearer $AT"
sleep 0.5
[ ! -f "/home/z/my-project/download/forged-full-project/backend/uploads/$(basename "$VURL2")" ] && ok "delete #2: video file released" || bad "video file leaked after last ref deleted"

# 10. seed state check
CNT=$(curl -s -H "Authorization: Bearer $AT" "$API/api/admin/banners" | J "console.log(j.items.length)")
echo "info · banners now: $CNT (seed = 3 expected)"
echo "---"; echo "PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ] && echo "T38 API QA: ALL GREEN"
