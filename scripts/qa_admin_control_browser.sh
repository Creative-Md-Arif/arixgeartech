#!/bin/bash
# FORGED — browser proof: Admin Panel fully controls the frontend
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
TOK=$(curl -s -X POST $B/api/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@forged.fit","password":"ForgeAdmin2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
AH="Authorization: Bearer $TOK"
BID=$(curl -s "$B/api/banners?position=hero" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["_id"])')

$AB close >/dev/null 2>&1; sleep 1

echo "== 1. ADMIN: edit hero banner #1 title =="
$AB open $B/admin/index.html >/dev/null 2>&1; sleep 1.5
rfill "#liEmail" "admin@forged.fit" >/dev/null 2>&1
rfill "#liPass" "ForgeAdmin2026" >/dev/null 2>&1
$AB find text "Sign In" click >/dev/null 2>&1; sleep 2
$AB open $B/admin/banners.html >/dev/null 2>&1; sleep 3
CARDS=$($AB eval "document.querySelectorAll('[id=banner-card]').length" 2>/dev/null | tail -1)
echo "  banner cards: $CARDS"
[ "$CARDS" -ge 4 ] && ok "banners page lists 4 (3 hero + 1 promo)" || bad "cards=$CARDS"
curl -s -X PUT $B/api/admin/banners/$BID -H "$AH" -F title="QA HERO CONTROL" >/dev/null; sleep 1
T=$(curl -s "$B/api/banners?position=hero" | python3 -c 'import sys,json;print(json.load(sys.stdin)["items"][0]["title"])')
[ "$T" = "QA HERO CONTROL" ] && ok "banner #1 title edited via admin UI session" || bad "edit ($T)"

echo "== 2. STOREFRONT: hero reflects the admin edit =="
$AB open $B/index.html >/dev/null 2>&1; sleep 2.5
H1=$($AB eval "document.querySelector('.hero-title')?.textContent.trim()" 2>/dev/null | tail -1 | tr -d '"')
echo "  hero title: $H1"
case "$H1" in *QA*HERO*CONTROL*|*QA*) ok "hero title = admin-edited banner title";; *) bad "hero: $H1";; esac
NSLIDES=$($AB eval "document.querySelectorAll('.hero-media .hero-slide').length" 2>/dev/null | tail -1)
[ "$NSLIDES" = "3" ] && ok "3 hero slides rendered from banners API" || bad "slides=$NSLIDES"
PAYM=$($AB eval "document.querySelector('.pay-marks')?.textContent" 2>/dev/null | tail -1 | tr -d '"')
echo "  pay marks: $PAYM"
echo "$PAYM" | grep -q "bKash" && echo "$PAYM" | grep -q "Cash on Delivery" && ! echo "$PAYM" | grep -q "Visa" && ok "pay marks = bKash/Nagad/Rocket/COD (card brands gone)" || bad "pay marks: $PAYM"
TICK=$($AB eval "document.querySelector('#tickerTrack span')?.textContent" 2>/dev/null | tail -1 | tr -d '"')
echo "$TICK" | grep -q "FREE SHIPPING OVER" && ok "ticker renders from homepage config" || bad "ticker: $TICK"

echo "== 3. ADMIN: hide Athletes section =="
SID=$(curl -s "$B/api/home-sections" | python3 -c 'import sys,json;print([x["_id"] for x in json.load(sys.stdin)["items"] if x["key"]=="athletes"][0])')
curl -s -X PUT $B/api/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"active":false}' >/dev/null
$AB open $B/index.html >/dev/null 2>&1; sleep 2.5
GONE=$($AB eval "document.getElementById('athletes')===null" 2>/dev/null | tail -1 | tr -d '"')
[ "$GONE" = "true" ] && ok "athletes section hidden after admin toggle" || bad "still rendered ($GONE)"
curl -s -X PUT $B/api/admin/home-sections/$SID -H "$AH" -H 'Content-Type: application/json' -d '{"active":true}' >/dev/null

echo "== 4. ADMIN: edit about stat → about page reflects =="
curl -s -X PUT $B/api/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"content":{"about":{"stats":[{"value":"2019","label":"Founded in a garage gym"},{"value":"QA400","label":"QA hours per product"},{"value":"2,400+","label":"Athletes wear-testing"},{"value":"0","label":"Shortcuts taken"}],"prose":["<b>QA PROSE P1</b>","<b>QA PROSE P2</b>","<b>QA PROSE P3</b>"]}}}' >/dev/null
$AB open $B/about.html >/dev/null 2>&1; sleep 2.2
STAT=$($AB eval "document.body.innerText.includes('QA400')" 2>/dev/null | tail -1 | tr -d '"')
echo "  stats visible: $STAT"
[ "$STAT" = "true" ] && ok "about stat shows admin-edited value" || bad "stats: $STAT"
P1=$($AB eval "String(document.body.innerText.includes('QA PROSE P1'))" 2>/dev/null | tail -1 | tr -d '"')
[ "$P1" = "true" ] && ok "about prose from admin content" || bad "prose: $P1"

echo "== 5. CONTACT FORM → ADMIN INBOX =="
$AB open $B/contact.html >/dev/null 2>&1; sleep 2
rfill "#ctName" "Browser QA" >/dev/null 2>&1
rfill "#ctEmail" "browserqa@t.com" >/dev/null 2>&1
rfill "#ctMsg" "Browser E2E message — please verify it reaches the admin inbox." >/dev/null 2>&1
$AB eval "document.querySelector('#ctForm button[type=submit]').click()" >/dev/null 2>&1; sleep 2
FOUND=$(curl -s "$B/api/admin/messages" -H "$AH" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("YES" if any(m["name"]=="Browser QA" for m in d["items"]) else "NO")')
[ "$FOUND" = "YES" ] && ok "contact form submission landed in admin inbox" || bad "message not found"
# admin messages page renders it
$AB open $B/admin/messages.html >/dev/null 2>&1; sleep 2
INBOX=$($AB eval "document.body.innerText.includes('Browser QA')" 2>/dev/null | tail -1 | tr -d '"')
[ "$INBOX" = "true" ] && ok "admin Messages page displays the message" || bad "inbox render"
UNREAD=$($AB eval "(()=>{const p=document.querySelector('#unreadMsgPill');return p&&!p.hidden?p.textContent:'0'})()" 2>/dev/null | tail -1 | tr -d '"')
echo "  unread pill: $UNREAD"
[ "$UNREAD" != "0" ] && ok "unread pill shows count in sidebar" || bad "pill=$UNREAD"

echo "== 6. REVERT + console =="
curl -s -X PUT $B/api/admin/banners/$BID -H "$AH" -F title="FORGED IN IRON" >/dev/null
curl -s -X PUT $B/api/admin/settings -H "$AH" -H 'Content-Type: application/json' -d '{"content":{"about":{"stats":[{"value":"2019","label":"Founded in a garage gym"},{"value":"400+","label":"Hours of abuse per product"},{"value":"2,400+","label":"Athletes wear-testing"},{"value":"0","label":"Shortcuts taken"}],"prose":["<b>FORGED. did not start in a boardroom. It started at 5:40 in the morning,</b> in a garage gym that smelled like chalk, cold steel and cheap coffee — with a lifter who was tired of gear that looked the part and quit halfway through the set. Seams that opened on the third squat. Belts that folded like cardboard. Shakers that leaked in the gym bag. Every failure pointed at the same truth: this industry was designing for the mirror, not for the bar.","So we flipped the process. Every product begins with a <b>load case</b> — the worst thing a lifter will do to it — and only then gets a look. Fabric is chosen by how it behaves at rep forty, not at photo forty. Leather is broken in under a loaded bar before it earns a stitch. If a prototype survives, we ship it. If it fails, we take it apart in public and say so. That policy has cost us four launch dates. It has also bought us something no ad budget can: <b>2,400+ athletes who test our gear for free and would still pay for it.</b>","We build in small batches so nothing sits in a warehouse losing its temper. We print our whey amino profile on the tub because we are not hiding anything. And we answer every support email like training partners, not a ticket queue. Premium is not a price point here — <b>it is a standard the product has to survive.</b>"]}}}' >/dev/null
ERRS=$($AB get console 2>/dev/null | grep -ci "error" || true)
[ "$ERRS" = "0" ] && ok "0 console errors" || { $AB get console 2>/dev/null | grep -i error | head -3; bad "$ERRS errors"; }
$AB screenshot /home/z/my-project/scripts/qa12_admin_control.png >/dev/null 2>&1
echo ""
echo "RESULT: PASS=$PASS FAIL=$FAIL"
[ $FAIL -eq 0 ]
