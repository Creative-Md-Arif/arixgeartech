/* Step 5 — DYNAMIC PRODUCT SPECIFICATION SYSTEM (shared utilities).
   One dependency-free module used by: Category model, SpecTemplate model,
   admin catalog controller, public productController, AI importer, migration.
   Design contract (future-ready: new fields NEVER need code changes):
     Category.specGroups = [{ key, label, labelBn, order, collapsed, fields: [...] }]
     field = { key, label, labelBn, type: text|number|select|multiselect|boolean|textarea,
               options: [String] (select/multiselect), unit, defaultValue,
               repeatable, filterable, showInDetails, required, order }
     Product.specValues = [{ g: groupKey, k: fieldKey, v: scalar | [String] }]
   — one entry per (g,k) per product (enforced on every write path);
   — flat legacy `specs`/`specsBn` [{k,v}] arrays are ALWAYS regenerated from
     specValues on admin/AI writes so every legacy consumer (compare page,
     CSV export, AI RAG, invoices) stays in sync automatically. */
const slugify = (s) =>
  String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* fallback group when imported/legacy keys have no schema home */
const AUTO_GROUP = { key: 'general', label: 'Specifications', labelBn: 'স্পেসিফিকেশন' };

const FIELD_TYPES = ['text', 'number', 'select', 'multiselect', 'boolean', 'textarea'];
const MAX_GROUPS = 32;
const MAX_FIELDS_PER_GROUP = 48;

/* Step 6 — per-field facet alias map: raw legacy value → canonical facet
   value ("512GB NVMe SSD (M.2 2280)" → "512GB SSD"). Applied when counting
   facets and EXPANDED when filtering so a canonical facet click matches every
   raw variant that aliases to it. Max 50 pairs per field — enough for real
   catalogs, small enough to keep documents lean. */
function normalizeAliases(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  let n = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (n >= 50) break;
    const key = String(k).trim().slice(0, 120);
    const val = String(v).trim().slice(0, 120);
    if (!key || !val || key === val) continue;
    out[key] = val;
    n++;
  }
  return out;
}

/* map one raw value through a field's alias table (exact, then trimmed) */
function aliasValue(field, value) {
  const a = field && field.aliases;
  if (!a || value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((x) => aliasValue(field, x));
  const s = String(value);
  if (a[s] !== undefined) return a[s];
  const t = s.trim();
  if (t && a[t] !== undefined) return a[t];
  return value;
}

/* invert an alias map: canonical value → every raw variant (for queries) */
function aliasVariants(field, canonical) {
  const a = (field && field.aliases) || {};
  const want = String(canonical).toLowerCase();
  const out = new Set([String(canonical)]);
  for (const [raw, canon] of Object.entries(a)) {
    if (String(canon).toLowerCase() === want) out.add(raw);
  }
  return [...out];
}

/* value → display string (flat-array regeneration + PDP fallback) */
function valueToString(v, field) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map((x) => valueToString(x, field)).filter(Boolean).join(', ');
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  let s = String(v).trim();
  if (field && field.type === 'number' && s !== '' && field.unit) s += ' ' + field.unit;
  return s;
}

/* empty = the PDP "hide empty fields" switch drops the row */
function valueIsEmpty(v) {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

/* clean one field definition (label required, key auto-derived, type guarded) */
function normalizeField(raw, seenKeys) {
  const label = String((raw && raw.label) || '').trim().slice(0, 80);
  if (!label) return null;
  let key = slugify((raw && raw.key) || label).slice(0, 60);
  if (!key) key = 'field-' + (seenKeys.size + 1);
  let unique = key, n = 2;
  while (seenKeys.has(unique)) unique = key + '-' + n++;
  seenKeys.add(unique);
  const type = FIELD_TYPES.includes(raw && raw.type) ? raw.type : 'text';
  const options = Array.isArray(raw && raw.options)
    ? [...new Set(raw.options.map((o) => String(o).trim().slice(0, 120)).filter(Boolean))].slice(0, 60)
    : [];
  return {
    key: unique,
    label,
    labelBn: String((raw && raw.labelBn) || '').trim().slice(0, 80),
    type,
    options,
    unit: String((raw && raw.unit) || '').trim().slice(0, 24),
    defaultValue: raw && raw.defaultValue !== undefined ? raw.defaultValue : '',
    repeatable: Boolean(raw && raw.repeatable),
    filterable: Boolean(raw && raw.filterable),
    showInDetails: raw && raw.showInDetails === undefined ? true : Boolean(raw.showInDetails),
    required: Boolean(raw && raw.required),
    /* Step 6 — per-field icon (emoji/glyph shown before the label on PDP /
       compare rows), facet value aliases and the product-card chip flag */
    icon: String((raw && raw.icon) || '').trim().slice(0, 8),
    aliases: normalizeAliases(raw && raw.aliases),
    showOnCard: Boolean(raw && raw.showOnCard),
    order: Number.isFinite(+raw && +raw.order) ? +raw.order : 0,
  };
}

/* clean a whole groups tree: dedupes group+field keys, orders fields */
function normalizeSpecGroups(raw) {
  if (!Array.isArray(raw)) return [];
  const seenGroups = new Set();
  const out = [];
  for (const g of raw.slice(0, MAX_GROUPS)) {
    const label = String((g && g.label) || '').trim().slice(0, 80);
    let key = slugify((g && g.key) || label).slice(0, 60);
    if (!key) continue;
    let gKey = key, n = 2;
    while (seenGroups.has(gKey)) gKey = key + '-' + n++;
    seenGroups.add(gKey);
    const seenFields = new Set();
    const fields = (Array.isArray(g && g.fields) ? g.fields : [])
      .map((f) => normalizeField(f, seenFields))
      .filter(Boolean)
      .map((f, i) => ({ ...f, order: f.order || i }))
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .slice(0, MAX_FIELDS_PER_GROUP);
    out.push({
      key: gKey,
      label,
      labelBn: String((g && g.labelBn) || '').trim().slice(0, 80),
      collapsed: Boolean(g && g.collapsed),
      order: Number.isFinite(+g && +g.order) ? +g.order : 0,
      fields,
    });
  }
  return out.sort((a, b) => (a.order || 0) - (b.order || 0));
}

/* schema lookup: group by key, field by key inside that group (or ANY group) */
function findField(schema, groupKey, fieldKey) {
  for (const g of schema || []) {
    if (String(g.key) === String(groupKey)) {
      const hit = (g.fields || []).find((f) => String(f.key) === String(fieldKey));
      if (hit) return { group: g, field: hit };
    }
  }
  for (const g of schema || []) {
    const hit = (g.fields || []).find((f) => String(f.key) === String(fieldKey));
    if (hit) return { group: g, field: hit };
  }
  return null;
}

/* coerce a raw value into the field's declared type */
function coerceValue(field, raw) {
  if (field.type === 'number') {
    const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (field.type === 'boolean') {
    return /^(true|yes|1|y)$/i.test(String(raw).trim());
  }
  if (field.type === 'multiselect') {
    const arr = Array.isArray(raw) ? raw : String(raw).split(',');
    const opts = field.options || [];
    return arr.map((x) => String(x).trim()).filter(Boolean)
      .map((x) => (opts.find((o) => o.toLowerCase() === x.toLowerCase()) || x))
      .slice(0, 24);
  }
  if (field.type === 'select') {
    const s = String(raw).trim().slice(0, 120);
    const opts = field.options || [];
    return (opts.find((o) => o.toLowerCase() === s.toLowerCase()) || s) || null;
  }
  return String(raw).trim().slice(0, 2000) || null;
}

/* ensure a field exists in the schema; auto-creates group/field when missing
   (THE AI-import hook: unknown imported attributes materialize themselves) */
function ensureField(schema, groupKey, groupLabel, fieldRaw) {
  const gKey = slugify(groupKey) || AUTO_GROUP.key;
  let g = schema.find((x) => x.key === gKey);
  if (!g) {
    g = { key: gKey, label: groupLabel || gKey, labelBn: '', collapsed: false, order: schema.length, fields: [] };
    schema.push(g);
  }
  const want = String(fieldRaw.label || fieldRaw.key || '').trim();
  const wantKey = slugify(fieldRaw.key || want);
  let f = (g.fields || []).find(
    (x) => slugify(x.key) === wantKey || x.label.toLowerCase() === want.toLowerCase()
  );
  if (!f) {
    const seen = new Set(schema.flatMap((x) => (x.fields || []).map((y) => y.key)));
    f = normalizeField({ ...fieldRaw, key: wantKey || want, label: want || wantKey }, seen);
    if (!f) return null;
    f.order = (g.fields || []).length;
    g.fields = [...(g.fields || []), f];
  }
  return f;
}

/* legacy/AI pairs [{k,v}] → specValues against a schema. Step 6 — the lookup
   is FULL-SCHEMA first (key or label, case-insensitive): a value whose field
   already lives in a named group ("Performance · RAM") lands THERE, not in a
   fragmented AUTO_GROUP duplicate ('ram-2'). Unknown keys still auto-create
   under AUTO_GROUP (schema passed by reference, mutated). */
function specValuesFromPairs(schema, pairs) {
  const out = [];
  for (const pr of Array.isArray(pairs) ? pairs : []) {
    const k = String((pr && (pr.k !== undefined ? pr.k : pr[0])) || '').trim();
    const v = pr && pr.v !== undefined ? pr.v : pr[1];
    if (!k || v === undefined || v === null || String(v).trim() === '') continue;
    let hit = null, gHit = null;
    for (const g of schema || []) {
      const f = (g.fields || []).find(
        (x) => slugify(x.key) === slugify(k) || String(x.label).toLowerCase() === k.toLowerCase()
      );
      if (f) { hit = f; gHit = g; break; }
    }
    if (!hit) {
      hit = ensureField(schema, AUTO_GROUP.key, AUTO_GROUP.label, { key: k, label: k });
      gHit = hit ? (schema || []).find((x) => x.key === AUTO_GROUP.key) : null;
    }
    if (!hit) continue;
    const val = coerceValue(hit, v);
    if (val === null || valueIsEmpty(val)) continue;
    out.push({ g: gHit ? gHit.key : AUTO_GROUP.key, k: hit.key, v: val });
  }
  return out;
}

/* specValues → flat legacy arrays (EN + BN) — legacy consumers stay fed */
function flatFromValues(schema, specValues, bn) {
  const rows = [];
  for (const g of [...(schema || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    const groupHas = (specValues || []).some((s) => s.g === g.key);
    if (!groupHas) continue;
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const hit = (specValues || []).find((s) => s.g === g.key && s.k === f.key);
      if (!hit || valueIsEmpty(hit.v)) continue;
      const label = bn ? (f.labelBn || f.label) : f.label;
      rows.push({ k: label, v: valueToString(hit.v, f) });
    }
  }
  /* orphan values (schema lost the field) — never drop data silently */
  const schemaKeys = new Set((schema || []).flatMap((g) => (g.fields || []).map((f) => f.key)));
  for (const s of specValues || []) {
    if (!schemaKeys.has(s.k)) rows.push({ k: s.k, v: valueToString(s.v) });
  }
  return rows;
}

/* merge/replace a template's groups into a category schema (keys dedupe) */
function mergeGroups(existing, incoming, mode) {
  if (mode === 'replace') return normalizeSpecGroups(incoming);
  const base = normalizeSpecGroups(existing);
  for (const g of normalizeSpecGroups(incoming)) {
    const hit = base.find((x) => x.key === g.key || x.label.toLowerCase() === g.label.toLowerCase());
    if (!hit) { base.push({ ...g, order: base.length }); continue; }
    const seen = new Set(hit.fields.map((f) => f.key));
    for (const f of g.fields || []) {
      if (!seen.has(f.key)) { hit.fields.push({ ...f, order: hit.fields.length }); seen.add(f.key); }
    }
  }
  return base;
}

/* ============ Step 7 — FACET ALIAS AUTO-SUGGEST (#1) ============ */

/* normalization used ONLY to compare candidate values: lowercase, drop
   parenthesized/bracketed qualifiers, punctuation → spaces (Bangla letters
   survive), collapse whitespace. "512GB NVMe SSD (M.2 2280)" → "512gb nvme ssd" */
function canonicalForm(value) {
  return String(value).toLowerCase().trim()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^a-z0-9\u0980-\u09FF]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* does the LONG raw collapse onto the SHORT raw? true when short is an
   in-order word-subsequence of long (strictly shorter) — the exact relation
   "512GB SSD" ⇢ "512GB NVMe SSD (M.2 2280)" has — or the canonical forms
   collide ("512 GB SSD" ⇢ "512GB SSD"). Word-bounded, so "16" never eats "1650". */
function valueCollapsesTo(longRaw, shortRaw) {
  const lw = canonicalForm(longRaw).split(' ').filter(Boolean);
  const sw = canonicalForm(shortRaw).split(' ').filter(Boolean);
  if (!lw.length || !sw.length || lw.length <= sw.length) return false;
  let i = 0;
  for (const w of lw) { if (i < sw.length && w === sw[i]) i++; }
  return i === sw.length;
}

/* mine a category's product values for alias-worthy variants. Only filterable
   text/select/multiselect fields are mined (number/boolean facets don't
   alias); values already carrying an explicit alias are skipped; canonical =
   most frequent variant (ties → shortest, then alphabetical). */
function suggestAliasPairs(schema, docs, perFieldCap = 12) {
  const out = [];
  for (const g of [...(schema || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      if (!f.filterable || !['text', 'select', 'multiselect'].includes(f.type)) continue;
      const freq = new Map(); // raw → product count
      for (const p of docs || []) {
        let v;
        const sv = (p.specValues || []).find((x) => x.k === f.key);
        if (sv) v = sv.v;
        else {
          const lower = String(f.label).toLowerCase();
          const legacy = (p.specs || []).find((x) => String(x.k || '').toLowerCase() === lower);
          if (legacy) v = legacy.v;
        }
        if (valueIsEmpty(v)) continue;
        for (const piece of Array.isArray(v) ? v : [v]) {
          const s = String(piece).trim().slice(0, 120);
          if (!s) continue;
          freq.set(s, (freq.get(s) || 0) + 1);
        }
      }
      if (freq.size < 2) continue;
      const existing = f.aliases || {};
      /* bucket by the SQUASHED canonical form (spaces too gone) — catches
         punctuation variants AND spacing variants ("512 GB SSD" ⇢ "512GB SSD") */
      const canonTargets = new Map(); // squashed-canonical → members[]
      for (const [raw, count] of freq) {
        const c = canonicalForm(raw).replace(/\s+/g, '');
        if (!c) continue;
        if (!canonTargets.has(c)) canonTargets.set(c, []);
        canonTargets.get(c).push({ raw, count });
      }
      const suggestions = [];
      const seenPair = new Set();
      for (const [, members] of canonTargets) {
        if (members.length < 2) continue;
        members.sort((a, b) => b.count - a.count || a.raw.length - b.raw.length || a.raw.localeCompare(b.raw));
        const canon = members[0].raw;
        for (const m of members.slice(1)) {
          if (existing[m.raw] !== undefined) continue;
          const pairKey = m.raw + '⇢' + canon;
          if (seenPair.has(pairKey)) continue;
          seenPair.add(pairKey);
          suggestions.push({ raw: m.raw, canonical: canon, count: m.count, why: 'normalize' });
        }
      }
      /* subsequence collapse: longer variants → the shorter popular value */
      const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
      for (const [shortRaw, shortCount] of sorted) {
        if (existing[shortRaw] !== undefined) continue;
        for (const [longRaw, longCount] of sorted) {
          if (longRaw === shortRaw) continue;
          if (existing[longRaw] !== undefined) continue;
          if (!valueCollapsesTo(longRaw, shortRaw)) continue;
          const pairKey = longRaw + '⇢' + shortRaw;
          if (seenPair.has(pairKey)) continue;
          seenPair.add(pairKey);
          suggestions.push({ raw: longRaw, canonical: shortRaw, count: longCount, why: 'collapse', support: shortCount });
        }
      }
      suggestions.sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw));
      const capped = suggestions.slice(0, perFieldCap);
      if (capped.length) {
        out.push({
          groupKey: g.key, groupLabel: g.label, key: f.key, label: f.label,
          labelBn: f.labelBn || '', type: f.type,
          distinct: freq.size, aliased: Object.keys(existing).length,
          suggestions: capped,
        });
      }
    }
  }
  return out.sort((a, b) => b.suggestions.length - a.suggestions.length);
}

/* ============ shop-filter bridge ============ */

/* Step 6 — PRODUCT-CARD BADGES. Fields flagged showOnCard surface their value
   as compact chips on shop cards ("16GB RAM" · "RTX 4060" · "1TB SSD").
   Runs over lean card docs (specValues ride every card since Step 5); values
   fall back to the legacy flat rows for pre-migration docs. Cap 3 chips. */
function specBadgesFromDoc(schema, doc, cap = 3) {
  const out = [];
  if (!schema || !doc) return out;
  const legacy = new Map((doc.specs || []).map((s) => [String(s.k).toLowerCase(), String(s.v || '')]));
  for (const g of [...schema].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      if (!f.showOnCard || out.length >= cap) continue;
      let v;
      const sv = (doc.specValues || []).find((x) => x.k === f.key);
      if (sv) v = sv.v;
      else {
        const lv = legacy.get(String(f.label).toLowerCase());
        if (lv !== undefined) v = lv;
      }
      if (valueIsEmpty(v)) continue;
      const s = valueToString(Array.isArray(v) ? v.slice(0, 2) : v, f);
      if (!s) continue;
      out.push({ g: g.key, k: f.key, label: f.label, labelBn: f.labelBn || '', icon: f.icon || '', v: s.slice(0, 60) });
    }
  }
  return out;
}

/* Step 6 — SCHEMA DIFF for the audit trail: what changed between the previous
   schema and the new one (grouped summary — the audit entry stays one line). */
function schemaDiff(oldGroups, newGroups) {
  const oldG = normalizeSpecGroups(oldGroups);
  const newG = normalizeSpecGroups(newGroups);
  const gKey = (gs) => new Map(gs.map((g) => [g.key, g]));
  const o = gKey(oldG), n = gKey(newG);
  const addedGroups = [...n.keys()].filter((k) => !o.has(k));
  const removedGroups = [...o.keys()].filter((k) => !n.has(k));
  const addedFields = [], removedFields = [], changedFields = [];
  const fieldsOf = (g) => new Map(((g && g.fields) || []).map((f) => [f.key, f]));
  for (const [k, ng] of n) {
    const og = o.get(k);
    const of = fieldsOf(og), nf = fieldsOf(ng);
    for (const fk of nf.keys()) if (!of.has(fk)) addedFields.push(ng.label + '.' + (nf.get(fk).label || fk));
    for (const [fk, f] of of) {
      if (!nf.has(fk)) removedFields.push(ng.label + '.' + f.label);
      else {
        const nf2 = nf.get(fk);
        if (nf2.type !== f.type) changedFields.push(f.label + ': ' + f.type + '→' + nf2.type);
        else if (Boolean(f.filterable) !== Boolean(nf2.filterable)) changedFields.push(f.label + ': filter ' + (nf2.filterable ? 'on' : 'off'));
        else if ((f.options || []).join('|') !== (nf2.options || []).join('|')) changedFields.push(f.label + ': options edited');
      }
    }
  }
  return { addedGroups, removedGroups, addedFields, removedFields, changedFields };
}

/* build the Mongo query fragment for ?spec_<key>=a,b & spec_<key>_min/_max */
function specQueryFromParams(schema, params) {
  const clauses = [];
  for (const [name, rawVal] of Object.entries(params || {})) {
    let m = /^spec_([a-z0-9-]+)_min$/i.exec(name);
    if (m) {
      const n = Number(rawVal);
      if (!Number.isFinite(n)) continue;
      const c = specRangeClause(schema, m[1], n, null);
      if (c) clauses.push(c);
      continue;
    }
    m = /^spec_([a-z0-9-]+)_max$/i.exec(name);
    if (m) {
      const n = Number(rawVal);
      if (!Number.isFinite(n)) continue;
      const c = specRangeClause(schema, m[1], null, n);
      if (c) clauses.push(c);
      continue;
    }
    m = /^spec_([a-z0-9-]+)$/i.exec(name);
    if (!m) continue;
    const field = findFieldByFieldKey(schema, m[1]);
    if (!field || !field.filterable) continue;
    const vals = String(rawVal).split(',').map((s) => s.trim()).filter(Boolean);
    if (!vals.length) continue;
    /* Step 6 — alias expansion: a canonical facet click must also match every
       raw variant that aliases to it ("512GB SSD" also hits docs still storing
       "512GB NVMe SSD (M.2 2280)") */
    const expanded = vals.flatMap((v) => aliasVariants(field, v));
    if (field.type === 'boolean') {
      const want = vals.some((v) => /^(true|yes|1)$/i.test(v));
      clauses.push({
        $or: [
          { specValues: { $elemMatch: { k: field.key, v: want } } },
          { specs: { $elemMatch: { k: { $in: labelVariants(field) }, v: boolLabelRe(want) } } },
        ],
      });
    } else if (field.type === 'number') {
      const nums = expanded.map(Number).filter(Number.isFinite);
      if (!nums.length) continue;
      clauses.push({
        $or: [
          { specValues: { $elemMatch: { k: field.key, v: { $in: nums } } } },
          { specs: { $elemMatch: { k: { $in: labelVariants(field) }, v: { $in: expanded } } } },
        ],
      });
    } else {
      /* text / select / multiselect — match any of the given values (plus their
         alias variants); specValues.v may be a scalar OR an array (multiselect) */
      const rx = expanded.map((v) => new RegExp('^' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'));
      clauses.push({
        $or: [
          { specValues: { $elemMatch: { k: field.key, $or: [{ v: { $in: rx } }, { v: { $elemMatch: { $in: rx } } }] } } },
          { specs: { $elemMatch: { k: { $in: labelVariants(field) }, v: { $in: rx } } } },
        ],
      });
    }
  }
  return clauses.length ? { $and: clauses } : null;
}

function labelVariants(field) {
  const set = new Set();
  for (const v of [field.label, field.key, field.labelBn]) {
    if (v) { set.add(String(v)); set.add(String(v).toLowerCase()); }
  }
  return [...set];
}
const boolLabelRe = (want) => new RegExp('^' + (want ? 'yes|true|1|y' : 'no|false|0|n') + '$', 'i');

function findFieldByFieldKey(schema, fieldKey) {
  for (const g of schema || []) {
    const hit = (g.fields || []).find((f) => f.key === fieldKey || slugify(f.key) === fieldKey);
    if (hit) return hit;
  }
  return null;
}

function specRangeClause(schema, fieldKey, min, max) {
  const field = findFieldByFieldKey(schema, fieldKey);
  if (!field || !field.filterable) return null;
  const range = {};
  if (min !== null && min !== undefined) range.$gte = min;
  if (max !== null && max !== undefined) range.$lte = max;
  if (!Object.keys(range).length) return null;
  return { $or: [{ specValues: { $elemMatch: { k: field.key, v: range } } }] };
}

/* facet counting across the legacy + dynamic shapes (JS pass — catalog scale
   is bounded by the category filter, so correctness beats an aggregation) */
function specFacetsFromDocs(schema, docs) {
  const facets = [];
  for (const g of [...(schema || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
    for (const f of [...(g.fields || [])].sort((a, b) => (a.order || 0) - (b.order || 0))) {
      if (!f.filterable) continue;
      const counts = new Map();
      let min = null, max = null;
      for (const p of docs) {
        let v;
        const sv = (p.specValues || []).find((x) => x.k === f.key);
        if (sv) v = sv.v;
        else {
          const lower = String(f.label).toLowerCase();
          const legacy = (p.specs || []).find((x) => String(x.k || '').toLowerCase() === lower);
          if (legacy) v = f.type === 'boolean' ? /^(true|yes|1)$/i.test(String(legacy.v)) : legacy.v;
        }
        if (v === undefined || valueIsEmpty(v)) continue;
        if (f.type === 'number') {
          const n = Number(v);
          if (!Number.isFinite(n)) continue;
          min = min === null ? n : Math.min(min, n);
          max = max === null ? n : Math.max(max, n);
        } else if (f.type === 'boolean') {
          const key = v ? 'Yes' : 'No';
          counts.set(key, (counts.get(key) || 0) + 1);
        } else {
          /* Step 6 — raw values are folded through the field's alias table so
             "512GB NVMe SSD (M.2 2280)" and "512GB SSD" land in ONE bucket */
          for (const piece of Array.isArray(v) ? v : [v]) {
            const s = String(aliasValue(f, piece)).trim().slice(0, 120);
            if (!s) continue;
            counts.set(s, (counts.get(s) || 0) + 1);
          }
        }
      }
      const facet = { key: f.key, groupKey: g.key, groupLabel: g.label, groupLabelBn: g.labelBn, label: f.label, labelBn: f.labelBn, type: f.type, unit: f.unit || '', icon: f.icon || '' };
      if (f.type === 'number') {
        if (min === null) continue;
        facets.push({ ...facet, range: { min, max } });
      } else if (f.type === 'boolean') {
        if (!counts.size) continue;
        facets.push({ ...facet, options: ['Yes', 'No'].filter((o) => counts.has(o)).map((o) => ({ value: o, count: counts.get(o) })) });
      } else {
        if (!counts.size) continue;
        const ordered = (f.options || []).filter((o) => counts.has(o)).map((o) => ({ value: o, count: counts.get(o) }));
        for (const [value, count] of [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
          if (!ordered.some((x) => x.value.toLowerCase() === value.toLowerCase())) ordered.push({ value, count });
        }
        facets.push({ ...facet, options: ordered.slice(0, 30) });
      }
    }
  }
  return facets;
}

module.exports = {
  slugify,
  AUTO_GROUP,
  FIELD_TYPES,
  MAX_GROUPS,
  MAX_FIELDS_PER_GROUP,
  valueToString,
  valueIsEmpty,
  normalizeAliases,
  aliasValue,
  aliasVariants,
  normalizeField,
  normalizeSpecGroups,
  findField,
  coerceValue,
  ensureField,
  specValuesFromPairs,
  flatFromValues,
  mergeGroups,
  specQueryFromParams,
  specFacetsFromDocs,
  specBadgesFromDoc,
  schemaDiff,
  suggestAliasPairs,
  valueCollapsesTo,
  findFieldByFieldKey,
};
