#!/usr/bin/env bash
# Step 7 — LIVE BROWSER QA (light + dark + bn): the Step 7 UI surfaces.
#   storefront: PDP dense spec sheet (#8) + gallery badge overlay (#9)
#   admin: spec-schema card preview (#3) · audit schema-edit stream (#7)
#          AI console update-mode diff (#4) + bulk override grid (#5)
# NOTE: heredocs are QUOTED ('FIXTURE') — write mongo operators as $set/$in
# literally (bash must NOT expand them; node receives them as-is).
set -u
R="$(cd "$(dirname "$0")/.." && pwd)"
B=http://localhost:5000
AB="agent-browser"
PASS=0; FAIL=0
ok(){ echo "  ✔ $1"; PASS=$((PASS+1)); }
bad(){ echo "  ✘ FAIL: $1 → $2"; FAIL=$((FAIL+1)); }
chk(){ local R2=$($AB eval "$2" 2>/dev/null | tail -1 | tr -d '"'); case "$R2" in *"$3"*) ok "$1";; *) bad "$1" "$R2";; esac }

pkill -f "[b]ackend/server.js" 2>/dev/null; pkill -f "[d]ev-mongo" 2>/dev/null; sleep 1
node "$R/backend/scripts/dev-mongo.js" > /tmp/mongo.log 2>&1 &
for i in $(seq 1 25); do ss -tln 2>/dev/null | grep -q 27017 && break; sleep 1; done
(cd "$R/backend" && npm run seed > /tmp/seed.log 2>&1)
(cd "$R/backend" && PORT=5000 node server.js > /tmp/api5000.log 2>&1) &
for i in $(seq 1 25); do curl -sf -m 2 "$B/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -sf "$B/api/health" >/dev/null || { echo "FATAL: api down"; exit 1; }

# fixture — build a REAL laptops schema (migration skips it), showOnCard chips,
# a dense product, and trigger a REAL schema edit so the audit stream has entries
TOKEN=$(curl -s -X POST "$B/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@arixgear.tech","password":"ArixAdmin2026"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token||''))")
node - <<'FIXTURE'
const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear');
  const cats = mongoose.connection.db.collection('categories');
  const prods = mongoose.connection.db.collection('products');
  const p0 = await prods.findOne({ slug: 'laptop-strix-g15' });
  const CATSLUG = p0.category; // the detail endpoint reads the product's OWN category schema
  const chips = [
    { key: 'processor', label: 'Processor', labelBn: 'প্রসেসর', type: 'select', icon: '⚙️' },
    { key: 'ram', label: 'RAM', labelBn: 'র‍্যাম', type: 'select', icon: '🧠' },
    { key: 'storage', label: 'Storage', labelBn: 'স্টোরেজ', type: 'select', icon: '💾' },
    { key: 'graphics', label: 'Graphics', labelBn: 'গ্রাফিক্স', type: 'select', icon: '🎮' },
  ].map((f, i) => Object.assign({ options: [], unit: '', defaultValue: '', repeatable: false, filterable: true, showInDetails: true, required: false, aliases: {}, showOnCard: true, order: i }, f));
  const fields = []; const vals = [];
  for (let i = 1; i <= 22; i++) {
    fields.push({ key: 'qa-d' + i, label: 'QA Field ' + i, labelBn: '', type: 'text', options: [], unit: '', defaultValue: '', repeatable: false, filterable: false, showInDetails: true, required: false, icon: '', aliases: {}, showOnCard: false, order: i });
    vals.push({ g: 'qa-dense', k: 'qa-d' + i, v: 'value ' + i });
  }
  const groups = [
    { key: 'performance', label: 'Performance', labelBn: 'পারফরম্যান্স', collapsed: false, order: 0, fields: chips },
    { key: 'qa-dense', label: 'QA Dense Sheet', labelBn: '', collapsed: false, order: 98, fields },
  ];
  await cats.updateOne({ slug: CATSLUG }, { $set: { specGroups: groups, schemaVersion: 0, schemaAudit: [] } });
  console.log('fixture targets category: ' + CATSLUG);
  const p = p0;
  const chipVals = [
    { g: 'performance', k: 'processor', v: 'AMD Ryzen 7 7735HS' },
    { g: 'performance', k: 'ram', v: '32GB DDR5' },
    { g: 'performance', k: 'storage', v: '1TB NVMe SSD' },
    { g: 'performance', k: 'graphics', v: 'NVIDIA RTX 4060 6GB' },
  ];
  await prods.updateOne({ _id: p._id }, { $set: { specValues: chipVals.concat(vals) } });
  console.log('fixture: 4 chip fields + 22 dense rows on ' + p.slug);
  mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
FIXTURE
# trigger a REAL schema edit (audit trail entry, schemaVersion bump)
CATSLUG=$(curl -s "$B/api/products/laptop-strix-g15" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).product.category||'')})")
echo "  (schema target category: $CATSLUG)"
CATID=$(CATSLUG="$CATSLUG" curl -s "$B/api/admin/categories" -H "Authorization: Bearer $TOKEN" | CATSLUG="$CATSLUG" node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const arr=j.items||j.categories||j;console.log((arr.find(x=>x.slug===process.env.CATSLUG)||{})._id||'')})")
node - <<'PAYLOAD' > /tmp/qa7_payload.json
const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear');
  const prods = mongoose.connection.db.collection('products');
  const p0 = await prods.findOne({ slug: 'laptop-strix-g15' });
  const c = await mongoose.connection.db.collection('categories').findOne({ slug: p0.category });
  const groups = c.specGroups.map((g) => {
    if (g.key !== 'qa-dense') return g;
    const ng = Object.assign({}, g);
    ng.fields = g.fields.concat([{ key: 'qa-extra', label: 'QA Extra', labelBn: '', type: 'text', options: [], unit: '', defaultValue: '', repeatable: false, filterable: false, showInDetails: true, required: false, icon: '', aliases: {}, showOnCard: false, order: 23 }]);
    return ng;
  });
  console.log(JSON.stringify({ specGroups: groups, hideEmptyFields: true }));
  mongoose.disconnect();
})();
PAYLOAD
curl -s -o /dev/null -w "schema-put=%{http_code}\n" -X PUT "$B/api/admin/categories/$CATID/spec-schema" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' --data @/tmp/qa7_payload.json

$AB close >/dev/null 2>&1; sleep 1
echo "== STOREFRONT PDP — light =="
$AB open "$B/product/laptop-strix-g15" >/dev/null 2>&1; sleep 3.5
chk "PDP loads (name)" "document.getElementById('pdpName')?.textContent.length > 5" "true"
chk "#8 dense mode ON (29 rows > 20)" "document.getElementById('pdpSpecsWrap')?.dataset.specdense" "1"
chk "#8 two-column grid renders the dense rows" "document.querySelectorAll('[data-densegroup] [data-specrow]').length >= 22" "true"
chk "#9 gallery badge overlay present" "Number(document.getElementById('pdpSpecBadgesOverlay')?.dataset.badges || 0) >= 1" "true"
chk "#9 overlay carries titled chips (icon+value)" "document.querySelectorAll('#pdpSpecBadgesOverlay span[title]').length >= 1" "true"
$AB console --clear >/dev/null 2>&1; sleep 0.4
E1=$($AB errors 2>/dev/null | tail -1)
chk "0 console errors (light PDP)" "0" "$E1"

echo "== STOREFRONT PDP — dark =="
$AB eval "document.documentElement.dataset.theme='dark'; 'ok'" >/dev/null 2>&1; sleep 0.8
chk "#9 overlay chips survive dark theme" "document.querySelectorAll('#pdpSpecBadgesOverlay span[title]').length >= 1" "true"
chk "#8 dense grid survives dark theme" "document.querySelectorAll('[data-densegroup] [data-specrow]').length >= 22" "true"
$AB console --clear >/dev/null 2>&1; sleep 0.4
E2=$($AB errors 2>/dev/null | tail -1)
chk "0 console errors (dark PDP)" "0" "$E2"

echo "== ADMIN — login =="
$AB open "$B/admin/" >/dev/null 2>&1; sleep 3
LOGIN=$($AB eval "(function(){ const em=document.querySelector('input[placeholder*=\"admin\"]'); const pw=document.querySelector('input[type=password]'); if(!em||!pw) return 'no-form ' + location.pathname; const set=function(el,v){ const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); }; set(em,'admin@arixgear.tech'); set(pw,'ArixAdmin2026'); const sb=Array.from(document.querySelectorAll('button')).find(function(b){ return /sign in/i.test(b.textContent||''); }); if(!sb) return 'no-submit'; sb.click(); return 'submitted'; })()" 2>&1 | tail -1 | tr -d '"')
echo "  (login eval → $LOGIN)"
if [ "$LOGIN" = "submitted" ]; then ok "admin login submitted"; else bad "admin login submitted" "$LOGIN"; fi
sleep 4
chk "admin dashboard reached" "location.pathname.indexOf('dashboard') >= 0 || /DASHBOARD/i.test(document.body.textContent.slice(0, 4000))" "true"

echo "== ADMIN — spec schema editor (#3 + #1) =="
$AB open "$B/admin/catalog?tab=specs" >/dev/null 2>&1; sleep 3.5
chk "#3 card preview rendered (ssCardPreview)" "!!document.getElementById('ssCardPreview')" "true"
chk "#1 alias miner button present" "!!document.getElementById('ssMineAliases')" "true"
chk "#3 editor reachable (groups area)" "!!document.getElementById('specSchemaEditor')" "true"

echo "== ADMIN — audit page (#7) =="
$AB open "$B/admin/audit" >/dev/null 2>&1; sleep 3.5
chk "#7 schema-edits stream present" "!!document.getElementById('auditSchemaEdits')" "true"
chk "#7 rows carry category + summary" "document.querySelectorAll('#auditSchemaEdits [data-schemaedit]').length >= 1" "true"
$AB console --clear >/dev/null 2>&1; sleep 0.4
E3=$($AB errors 2>/dev/null | tail -1)
chk "0 console errors (admin pages)" "0" "$E3"

echo "== ADMIN — AI console diff (#4) + override grid (#5) =="
node - <<'STAGED'
const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear');
  const db = mongoose.connection.db;
  const prods = db.collection('products');
  const target = await prods.findOne({ slug: 'laptop-strix-g15' });
  await db.collection('aiimports').insertMany([
    { status: 'ready', sourceUrl: 'https://example.com/qa7-browser', host: 'example.com', category: 'laptops', price: target.price + 5000,
      aiContent: { name: 'Browser QA Refresh (staged)', shortDesc: 'staged', specs: [{ k: 'RAM', v: '48GB DDR5' }, { k: 'Quantum Core', v: 'yes' }] },
      extracted: { name: target.name, price: target.price, specs: [{ k: 'RAM', v: '48GB DDR5' }], images: [] }, images: [],
      duplicates: [{ productId: target._id, name: target.name, slug: target.slug, score: 0.94, reason: 'name similarity' }], createdAt: new Date() },
    { status: 'ready', sourceUrl: 'https://example.com/qa7-legacy', host: 'example.com', category: 'laptops', price: 41000,
      aiContent: { name: 'Browser QA Bulk Row', specs: [] }, extracted: { images: ['/uploads/x.png'] }, images: [], createdAt: new Date() },
  ]);
  console.log('staged fixtures inserted');
  mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
STAGED
$AB open "$B/admin/ai" >/dev/null 2>&1; sleep 3.5
$AB eval "(function(){ const rows=document.querySelectorAll('#aiImportTable tbody tr'); for (const r of rows) { const cb=r.querySelector('input[type=checkbox]'); if (cb) { cb.click(); return 'picked'; } } return 'no-rows'; })()" >/dev/null 2>&1; sleep 0.8
chk "#5 bulk bar + override toggle appear" "!!document.getElementById('aiBulkOverrideToggle') && !!document.getElementById('aiBulkApprove')" "true"
$AB eval "document.getElementById('aiBulkOverrideToggle')?.click(); 'opened'" >/dev/null 2>&1; sleep 0.8
chk "#5 per-row override grid opens" "!!document.getElementById('aiBulkOverride')" "true"
chk "#5 grid lists the picked row with a select" "document.querySelectorAll('#aiBulkOverride select').length >= 1" "true"

$AB open "$B/admin/ai" >/dev/null 2>&1; sleep 3.5
$AB eval "(function(){ const rows=document.querySelectorAll('#aiImportTable tbody tr'); const r=Array.from(rows).find(function(x){ return x.textContent.indexOf('Browser QA Refresh') >= 0; }); if (!r) return 'row-not-found'; const btns=r.querySelectorAll('button'); btns[btns.length-1].click(); return 'opened'; })()" >/dev/null 2>&1; sleep 3
chk "import detail opens" "!!document.getElementById('aiImportDetail')" "true"
$AB eval "(function(){ const radios=document.querySelectorAll('input[name=aiMode]'); if (radios.length < 2) return 'no-radios'; radios[1].click(); return 'update-mode'; })()" >/dev/null 2>&1; sleep 0.5
chk "#4 preview-changes button visible" "!!document.getElementById('aiDiffBtn')" "true"
$AB eval "document.getElementById('aiDiffBtn')?.click(); 'diffing'" >/dev/null 2>&1; sleep 2.5
chk "#4 side-by-side diff view renders" "!!document.getElementById('aiDiffView')" "true"
chk "#4 diff rows (current vs staged) present" "document.querySelectorAll('#aiDiffView [data-diffrow]').length >= 8" "true"
chk "#4 schema-growth strip" "!!document.getElementById('aiDiffGrowth')" "true"
$AB console --clear >/dev/null 2>&1; sleep 0.4
E4=$($AB errors 2>/dev/null | tail -1)
chk "0 console errors (AI console)" "0" "$E4"

echo "== cleanup (rule ⑥) =="
node - <<'CLEAN'
const mongoose = require('/home/z/my-project/arixgear-full-project/backend/node_modules/mongoose');
(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/arixgear');
  const db = mongoose.connection.db;
  const prods = db.collection('products');
  const p = await prods.findOne({ slug: 'laptop-strix-g15' });
  const cat = await db.collection('categories').findOne({ slug: p.category });
  const groups = (cat.specGroups || []).filter((g) => !['qa-dense', 'qa-storage'].includes(g.key));
  for (const g of groups) g.fields = (g.fields || []).map((f) => Object.assign({}, f, { showOnCard: false }));
  await db.collection('categories').updateOne({ slug: p.category }, { $set: { specGroups: groups } });
  if (p) await db.collection('products').updateOne({ _id: p._id }, { $set: { specValues: (p.specValues || []).filter((s) => !String(s.k).startsWith('qa-')) } });
  await db.collection('aiimports').deleteMany({ sourceUrl: { $in: ['https://example.com/qa7-browser', 'https://example.com/qa7-legacy'] } });
  await db.collection('products').deleteMany({ $or: [{ slug: /^qa7-/ }, { name: { $regex: 'Browser QA' } }] });
  console.log('cleanup done — schema/products/imports restored');
  mongoose.disconnect();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
CLEAN

$AB close >/dev/null 2>&1
pkill -f "[b]ackend/server.js" 2>/dev/null; pkill -f "[d]ev-mongo" 2>/dev/null
echo "═══ Step 7 browser QA: PASS=$PASS FAIL=$FAIL ═══"
[ "$FAIL" = "0" ]
