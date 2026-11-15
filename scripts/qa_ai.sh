#!/usr/bin/env bash
# ArixGear — Phase 9 QA suite: AI SYSTEM (import · knowledge · support chat · admin)
# Usage: bash scripts/qa_ai.sh [base-url]   (default http://localhost:4000)
# Boots the in-memory mongo + API when down, serves a local fixture product
# page on :8899 for the importer (allowlisted via admin settings, reset after).
set -u
BASE="${1:-http://localhost:4000}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIX_PORT=8899
PASS=0; FAIL=0
ok(){ echo "  ✓ $1 ($2)"; PASS=$((PASS+1)); }
bad(){ echo "  ✗ $1 — expected '$2', got '$3'"; FAIL=$((FAIL+1)); }
check(){ if [ "$2" = "$3" ]; then ok "$1" "$3"; else bad "$1" "$2" "$3"; fi; }
jget(){ python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: d={}
$1
"; }
RUN="$(date +%s)"

echo "── Phase 9 · AI SYSTEM QA → $BASE ──"

# ── 0. stack boot (idempotent) ──────────────────────────────────────────
MONGO_OK=$(node -e "const n=require('net');const s=n.connect(27017,'127.0.0.1');s.on('connect',()=>{console.log(1);s.end()});s.on('error',()=>console.log(0));setTimeout(()=>{console.log(0);process.exit(0)},3000)" 2>/dev/null)
if [ "$MONGO_OK" != "1" ]; then
  echo "  booting dev-mongo…"; (cd "$ROOT" && setsid nohup npm run mongo >/tmp/qa-ai-mongo.log 2>&1 < /dev/null &); sleep 5
  echo "  seeding…"; (cd "$ROOT" && npm run seed >/tmp/qa-ai-seed.log 2>&1)
fi
if ! curl -s -m2 "$BASE/api/health" >/dev/null 2>&1; then
  echo "  booting API…"; (cd "$ROOT" && PORT=4000 setsid nohup node backend/server.js >/tmp/qa-ai-api.log 2>&1 < /dev/null &); sleep 4
fi
# health only proves the process — verify the DB actually answers
DBOK=$(curl -s -m8 "$BASE/api/ai/config" | grep -c '"enabled"')
if [ "$DBOK" = "0" ]; then
  echo "  API alive but DB unreachable — restarting stack…"
  pkill -f "node backend/server.js" 2>/dev/null; sleep 1
  (cd "$ROOT" && PORT=4000 setsid nohup node backend/server.js >/tmp/qa-ai-api.log 2>&1 < /dev/null &); sleep 4
fi
check "api.health" "True" "$(curl -s "$BASE/api/health" | jget "print(d.get('ok')==True)")"

# ── 0b. fixture product page (local importer target) ───────────────────
FIXDIR=/tmp/ai-fixture-$RUN; mkdir -p "$FIXDIR"
IMG="$FIXDIR/shot.png"
python3 - "$IMG" <<'PY'
import sys, struct, zlib
w=h=8
raw=b''.join(b'\x00'+bytes([120,90,240])*w for _ in range(h))
def chunk(t,d):
    c=struct.pack('>I',len(d))+t+d
    return c+struct.pack('>I',zlib.crc32(t+d)&0xffffffff)
png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b'')
open(sys.argv[1],'wb').write(png)
PY
mkdir -p "$FIXDIR/$RUN" && cat > "$FIXDIR/$RUN/index.html" <<HTML
<!doctype html><html><head><title>QA Import Monitor ${RUN} 27" 4K — VendorStore</title>
<meta property="og:title" content="QA Import Monitor ${RUN} 27&quot; 4K — VendorStore">
<meta property="og:description" content="Vendor 4K IPS monitor with HDR400, 60Hz, HDMI 2.0 and DP 1.2.">
<meta property="og:image" content="http://127.0.0.1:${FIX_PORT}/shot.png">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"QA Import Monitor ${RUN} 27\" 4K",
 "description":"VendorStore listing — 27 inch 4K IPS panel, HDR400, HDMI 2.0 + DP 1.2.",
 "brand":{"@type":"Brand","name":"Acer"},"sku":"QA-${RUN}",
 "offers":{"@type":"Offer","price":27500,"priceCurrency":"BDT","availability":"https://schema.org/InStock"},
 "image":"http://127.0.0.1:${FIX_PORT}/shot.png"}
</script></head><body>
<h1>QA Import Monitor ${RUN} 27" 4K</h1>
<table><tr><th>Panel</th><td>27-inch IPS 4K UHD</td></tr><tr><th>Refresh</th><td>60Hz</td></tr><tr><th>HDR</th><td>DisplayHDR 400</td></tr><tr><th>Ports</th><td>2x HDMI 2.0, 1x DP 1.2</td></tr><tr><th>Warranty</th><td>3 years</td></tr></table>
<p>Price: ৳27,500 ৳32,000</p>
<img src="/shot.png" alt="monitor"><img src="/shot.png" alt="monitor 2">
</body></html>
HTML
(cd "$FIXDIR" && setsid nohup python3 -m http.server $FIX_PORT --bind 127.0.0.1 >/dev/null 2>&1 < /dev/null &)
sleep 1
check "fixture.serves" "200" "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:$FIX_PORT/$RUN/index.html)"

# ── 1. public AI config + chat battery ─────────────────────────────────
C=$(curl -s "$BASE/api/ai/config")
check "ai.config.enabled" "True" "$(echo "$C" | jget "print(d.get('enabled')==True)")"
check "ai.config.greeting" "True" "$(echo "$C" | jget "print('AI assistant' in d.get('greeting',''))")"
check "ai.config.suggestions" "True" "$(echo "$C" | jget "print(len(d.get('suggestions',[]))>=3)")"

chat(){ curl -s -X POST "$BASE/api/ai/chat" -H 'Content-Type: application/json' -d "{\"message\":\"$1\",\"sessionKey\":\"$2\"}"; }

R=$(chat "hello" "qa-ai-greet-$RUN")
check "chat.greeting.intent" "greeting" "$(echo "$R" | jget "print(d.get('intent',''))")"
check "chat.greeting.grounded" "True" "$(echo "$R" | jget "print(d.get('grounded')==True)")"
check "chat.greeting.provider" "rules" "$(echo "$R" | jget "print(d.get('provider',''))")"   # no LLM key in QA env

R=$(chat "হ্যালো" "qa-ai-bngreet-$RUN")
check "chat.bn-greeting.lang" "bn" "$(echo "$R" | jget "print(d.get('lang',''))")"

R=$(chat "best gaming laptop under 160000" "qa-ai-budget-$RUN")
check "chat.budget.intent" "recommend" "$(echo "$R" | jget "print(d.get('intent',''))")"
check "chat.budget.products" "True" "$(echo "$R" | jget "print(len(d.get('products',[]))>=1)")"
check "chat.budget.price-cap" "True" "$(echo "$R" | jget "print(all(p['price']<=160000 for p in d.get('products',[])))")"
check "chat.budget.reply-taka" "True" "$(echo "$R" | jget "print('৳' in d.get('reply',''))")"

R=$(chat "১ লাখের মধ্যে গেমিং ল্যাপটপ আছে?" "qa-ai-bnbudget-$RUN")
check "chat.bn-budget.lang" "bn" "$(echo "$R" | jget "print(d.get('lang',''))")"
check "chat.bn-budget.reply" "True" "$(echo "$R" | jget "print(len(d.get('reply',''))>10)")"

S1="qa-ai-cmp-$RUN"
R=$(chat "ASUS TUF Gaming A15 vs Lenovo IdeaPad Slim 3 comparison" "$S1")
check "chat.compare.intent" "compare" "$(echo "$R" | jget "print(d.get('intent',''))")"
check "chat.compare.products" "2" "$(echo "$R" | jget "print(len(d.get('products',[])))")"
check "chat.compare.winner" "True" "$(echo "$R" | jget "print('Better on price' in d.get('reply',''))")"
R=$(chat "what about the second one" "$S1")
check "chat.followup.product" "True" "$(echo "$R" | jget "print(len(d.get('products',[]))==1)")"
check "chat.followup.lenovo" "True" "$(echo "$R" | jget "print('Lenovo' in json.dumps(d.get('products',[])))")"

R=$(chat "any deals running now?" "qa-ai-deals-$RUN")
check "chat.deals.intent" "deals" "$(echo "$R" | jget "print(d.get('intent',''))")"
check "chat.deals.reply" "True" "$(echo "$R" | jget "print(('OFF' in d.get('reply','')) or ('bundle price' in d.get('reply','')))")"

R=$(chat "ঢাকার বাইরে ডেলিভারি কত দিন?" "qa-ai-faqbn-$RUN")
check "chat.bn-policy.grounded" "True" "$(echo "$R" | jget "print(('Steadfast' in d.get('reply','')) or ('working days' in d.get('reply','')) or ('কর্মদিবস' in d.get('reply','')))")"

R=$(chat "how long does delivery take outside dhaka?" "qa-ai-faqen-$RUN")
check "chat.en-policy.intent" "policy" "$(echo "$R" | jget "print(d.get('intent',''))")"
check "chat.en-policy.faq" "True" "$(echo "$R" | jget "print('working days' in d.get('reply',''))")"

R=$(chat "show me unicorns" "qa-ai-unknown-$RUN")
check "chat.unknown.honest" "True" "$(echo "$R" | jget "print(len(d.get('reply',''))>10)")"

# PII masking (customer phone in message must not crash / must still answer)
R=$(chat "call me at 01755500190 about monitors" "qa-ai-pii-$RUN")
check "chat.pii-masked.answer" "True" "$(echo "$R" | jget "print(len(d.get('reply',''))>10)")"

# ── 2. order status — privacy-hardened ──────────────────────────────────
SLUG=$(curl -s "$BASE/api/products?limit=1" | jget "print(d['items'][0]['slug'])")
ORD=$(curl -s -X POST "$BASE/api/orders" -F "payload={\"customer\":{\"name\":\"AI QA Privacy\",\"phone\":\"0175550$RUN\",\"email\":\"aiqa$RUN@example.com\"},\"shipping\":{\"address\":\"11 Secret Road\",\"city\":\"Dhaka\",\"division\":\"dhaka\"},\"items\":[{\"slug\":\"$SLUG\",\"qty\":1}],\"paymentMethod\":\"cod\"}")
NO=$(echo "$ORD" | jget "print(d.get('order',{}).get('orderNumber',''))")
check "order.created" "True" "$([ -n "$NO" ] && echo True || echo False)"
R=$(chat "where is my order $NO — checkout phone 0175550$RUN" "qa-ai-ord-$RUN")
check "chat.order.status" "True" "$(echo "$R" | jget "print('$NO' in d.get('reply',''))")"
RG=$(chat "where is my order $NO" "qa-ai-ordguard-$RUN")
check "chat.order.no-phone-guard" "True" "$(echo "$RG" | jget "print('$NO' in d.get('reply','') and 'phone' in d.get('reply','').lower())")"
LEAK=$(echo "$R" | jget "
r=d.get('reply','')
print(any(x in r for x in ['AI QA Privacy','0175550$RUN','Secret Road','aiqa$RUN@example.com']))")
check "chat.order.no-pii-leak" "False" "$LEAK"
R=$(chat "where is my order ARG-NOPE99" "qa-ai-ord2-$RUN")
check "chat.order.unknown-honest" "True" "$(echo "$R" | jget "print(\"couldn't find\" in d.get('reply',''))")"

# ── 3. public knowledge FAQs ────────────────────────────────────────────
check "faqs.public" "True" "$(curl -s "$BASE/api/ai/faqs" | jget "print(isinstance(d.get('items'),list))")"

# ── 4. admin AI console ─────────────────────────────────────────────────
TOK=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}' | jget "print(d.get('token',''))")
AH="Authorization: Bearer $TOK"
check "admin.login" "True" "$([ -n "$TOK" ] && echo True || echo False)"

S=$(curl -s "$BASE/api/admin/ai/settings" -H "$AH")
check "ai.settings.get" "True" "$(echo "$S" | jget "print(d.get('settings',{}).get('provider') is not None)")"
check "ai.settings.key-masked" "True" "$(echo "$S" | jget "print(d['settings'].get('apiKey') in ('','••••••••'))")"
check "ai.settings.runtime-provider" "rules" "$(echo "$S" | jget "print(d.get('runtime',{}).get('effectiveProvider',''))")"

# allowlist the QA fixture host (reset at the end)
U=$(curl -s -X PUT "$BASE/api/admin/ai/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"import":{"allowHosts":"127.0.0.1,localhost"}}')
check "ai.settings.allowlist-set" "True" "$(echo "$U" | jget "print('127.0.0.1' in d['settings']['import']['allowHosts'])")"

K=$(curl -s "$BASE/api/admin/ai/knowledge/stats" -H "$AH")
check "ai.knowledge.products" "True" "$(echo "$K" | jget "print(d['sources']['products']>=40)")"
check "ai.knowledge.privacy-note" "True" "$(echo "$K" | jget "print('PII' in d.get('note',''))")"

# FAQ CRUD
F=$(curl -s -X POST "$BASE/api/admin/ai/faqs" -H "$AH" -H 'Content-Type: application/json' -d "{\"q\":\"Does the QA run cover EMI?\",\"a\":\"QA FAQ answer $RUN — EMI is available on bKash and cards over ৳5,000.\",\"qBn\":\"ইএমআই আছে কি?\",\"aBn\":\"হ্যাঁ, বিকাশ ও কার্ডে ইএমআই আছে।\",\"tags\":\"qa, emi\"}")
FID=$(echo "$F" | jget "print(d.get('item',{}).get('_id',''))")
check "ai.faq.create" "True" "$([ -n "$FID" ] && echo True || echo False)"
FU=$(curl -s -X PUT "$BASE/api/admin/ai/faqs/$FID" -H "$AH" -H 'Content-Type: application/json' -d "{\"topic\":\"payment\",\"tags\":\"emi, qa, updated-$RUN\"}")
check "ai.faq.update" "payment" "$(echo "$FU" | jget "print(d['item']['topic'])")"
# the new FAQ should be retrievable by the assistant
R=$(chat "emi acche ki amon kono system?" "qa-ai-faqemi-$RUN")
check "ai.faq.rag-reachable" "True" "$(echo "$R" | jget "print(('EMI' in d.get('reply','')) or ('ইএমআই' in d.get('reply','')))")"
check "ai.faq.delete" "True" "$(curl -s -X DELETE "$BASE/api/admin/ai/faqs/$FID" -H "$AH" | jget "print(d.get('ok')==True)")"

# ── 5. AI product import → approve → catalog ────────────────────────────
IM=$(curl -s -X POST "$BASE/api/admin/ai/imports" -H "$AH" -H 'Content-Type: application/json' -d "{\"urls\":[\"http://127.0.0.1:$FIX_PORT/$RUN/index.html\"]}")
IID=$(echo "$IM" | jget "print(d.get('items',[{}])[0].get('_id',''))")
check "ai.import.queued" "True" "$([ -n "$IID" ] && echo True || echo False)"

STATUS="pending"
for i in $(seq 1 20); do
  sleep 1.5
  ST=$(curl -s "$BASE/api/admin/ai/imports/$IID" -H "$AH")
  STATUS=$(echo "$ST" | jget "print(d.get('item',{}).get('status',''))")
  [ "$STATUS" != "processing" ] && [ "$STATUS" != "pending" ] && break
done
check "ai.import.status" "ready" "$STATUS"
D=$(curl -s "$BASE/api/admin/ai/imports/$IID" -H "$AH")
check "ai.import.extract.name" "True" "$(echo "$D" | jget "print('QA Import Monitor $RUN' in d['item']['extracted']['name'])")"
check "ai.import.extract.price" "27500" "$(echo "$D" | jget "print(int(d['item']['extracted']['price'] or 0))")"
check "ai.import.extract.specs" "True" "$(echo "$D" | jget "print(len(d['item']['extracted']['specs'])>=4)")"
check "ai.import.images" "True" "$(echo "$D" | jget "print(len(d['item']['images'])>=1)")"
check "ai.import.rewrite-source" "template" "$(echo "$D" | jget "print(d['item']['aiContent']['source'])")"   # no LLM key in QA env → grounded template
check "ai.import.seo-title" "True" "$(echo "$D" | jget "print('Bangladesh' in d['item']['aiContent']['seo']['metaTitle'])")"

AP=$(curl -s -X POST "$BASE/api/admin/ai/imports/$IID/approve" -H "$AH" -H 'Content-Type: application/json' -d "{\"price\":27500,\"category\":\"monitors\",\"stock\":14,\"warrantyMonths\":36}")
NEWID=$(echo "$AP" | jget "print(d.get('product',{}).get('_id',''))")
NEWSLUG=$(echo "$AP" | jget "print(d.get('product',{}).get('slug',''))")
check "ai.import.approve" "True" "$([ -n "$NEWID" ] && echo True || echo False)"
check "ai.import.approve.slug" "True" "$([ -n "$NEWSLUG" ] && echo True || echo False)"
CAT=$(curl -s "$BASE/api/products?search=QA%20Import%20Monitor%20$RUN&limit=5")
check "ai.import.in-catalog" "True" "$(echo "$CAT" | jget "print(any(i['slug']=='$NEWSLUG' for i in d.get('items',[])))")"
# public price may carry a live deal discount (documented pricing rule) —
# assert it never exceeds the approved base price
check "ai.import.catalog.price-capped" "True" "$(echo "$CAT" | jget "print([i['price'] for i in d['items'] if i['slug']=='$NEWSLUG'][0] <= 27500)")"
# provenance trail is admin-visible (public projection stays lean)
ASRC=$(curl -s "$BASE/api/admin/products?search=$NEWSLUG&limit=5" -H "$AH")
check "ai.import.catalog.sourceUrl" "True" "$(echo "$ASRC" | jget "print(any('127.0.0.1:$FIX_PORT' in (i.get('sourceUrl') or '') for i in (d.get('items') or d.get('products') or [])))")"

# re-import the same URL → duplicate detection
IM2=$(curl -s -X POST "$BASE/api/admin/ai/imports" -H "$AH" -H 'Content-Type: application/json' -d "{\"urls\":[\"http://127.0.0.1:$FIX_PORT/$RUN/index.html\"]}")
IID2=$(echo "$IM2" | jget "print(d.get('items',[{}])[0].get('_id',''))")
for i in $(seq 1 20); do
  sleep 1.5
  ST2=$(curl -s "$BASE/api/admin/ai/imports/$IID2" -H "$AH")
  S2=$(echo "$ST2" | jget "print(d.get('item',{}).get('status',''))")
  [ "$S2" != "processing" ] && [ "$S2" != "pending" ] && break
done
check "ai.import.reimport-ready" "ready" "$S2"
check "ai.import.duplicate-detected" "True" "$(echo "$ST2" | jget "print(any('source URL already in catalog' in x['reason'] for x in d['item']['duplicates']))")"

# reject flow (stays in queue for audit)
RJ=$(curl -s -X POST "$BASE/api/admin/ai/imports/$IID2/reject" -H "$AH")
check "ai.import.reject" "rejected" "$(echo "$RJ" | jget "print(d['item']['status'])")"
check "ai.import.delete" "True" "$(curl -s -X DELETE "$BASE/api/admin/ai/imports/$IID2" -H "$AH" | jget "print(d.get('ok')==True)")"

# ── 6. SSRF guard — blocked host fails safely ────────────────────────────
IM3=$(curl -s -X POST "$BASE/api/admin/ai/imports" -H "$AH" -H 'Content-Type: application/json' -d '{"urls":["http://192.168.10.5/admin"]}')
IID3=$(echo "$IM3" | jget "print(d.get('items',[{}])[0].get('_id',''))")
S3="pending"
for i in $(seq 1 12); do
  sleep 1.5
  ST3=$(curl -s "$BASE/api/admin/ai/imports/$IID3" -H "$AH")
  S3=$(echo "$ST3" | jget "print(d.get('item',{}).get('status',''))")
  [ "$S3" != "processing" ] && [ "$S3" != "pending" ] && break
done
check "ai.import.ssrf-blocked" "failed" "$S3"
check "ai.import.ssrf-error" "True" "$(echo "$ST3" | jget "print('Blocked host' in d['item']['error'])")"

# ── 7. chat history + admin test console + analytics ────────────────────
TS=$(curl -s -X POST "$BASE/api/admin/ai/chat/test" -H "$AH" -H 'Content-Type: application/json' -d '{"message":"best monitor under 30000","sessionKey":"qa-console-'"$RUN"'"}')
check "ai.console-test.intent" "True" "$(echo "$TS" | jget "print(d.get('intent') in ('recommend','product'))")"
CH=$(curl -s "$BASE/api/admin/ai/chats?channel=all&limit=60" -H "$AH")
CHN=$(echo "$CH" | jget "print(d.get('total',0))")
check "ai.chats.has-sessions" "True" "$(python3 -c "print($CHN>=3)")"
check "ai.chats.admin-test-present" "True" "$(echo "$CH" | jget "print(any(i['channel']=='admin-test' for i in d['items']))")"
CHID=$(echo "$CH" | jget "print(d['items'][0]['_id'])")
CD=$(curl -s "$BASE/api/admin/ai/chats/$CHID" -H "$AH")
check "ai.chats.thread" "True" "$(echo "$CD" | jget "print(len(d['item']['messages'])>=2)")"
AN=$(curl -s "$BASE/api/admin/ai/analytics" -H "$AH")
check "ai.analytics.chats" "True" "$(echo "$AN" | jget "print(d['totals']['chats']>=3)")"
check "ai.analytics.intents" "True" "$(echo "$AN" | jget "print(len(d['intents'])>=3)")"
check "ai.analytics.provider-rules" "rules" "$(echo "$AN" | jget "print(d['effectiveProvider'])")"

# ── 8. permissions — staff without 'ai' module → 403 ─────────────────────
STOK=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"staff@arixgear.tech","password":"ArixStaff2026"}' | jget "print(d.get('token',''))")
check "ai.perm.staff-login" "True" "$([ -n "$STOK" ] && echo True || echo False)"
check "ai.perm.staff-403" "403" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/admin/ai/settings" -H "Authorization: Bearer $STOK")"

# ── 9. cleanup — reset allowlist, remove QA product, kill fixture ────────
curl -s -X PUT "$BASE/api/admin/ai/settings" -H "$AH" -H 'Content-Type: application/json' -d '{"import":{"allowHosts":""}}' >/dev/null
check "ai.cleanup.allowlist-reset" "True" "$(curl -s "$BASE/api/admin/ai/settings" -H "$AH" | jget "print(d['settings']['import']['allowHosts']=='')")"
if [ -n "$NEWID" ]; then
  DEL=$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/admin/products/$NEWID" -H "$AH")
  check "ai.cleanup.product-removed" "True" "$([ "$DEL" = "200" ] || [ "$DEL" = "204" ] && echo True || echo False)"
fi
pkill -f "http.server $FIX_PORT" 2>/dev/null || true

echo
echo "── Phase 9 AI QA: $PASS passed · $FAIL failed ──"
[ "$FAIL" = "0" ] && echo "ALL GREEN ✅" || echo "FAILURES PRESENT ❌"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
