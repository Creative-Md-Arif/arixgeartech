const Category = require('../models/Category');
const SpecTemplate = require('../models/SpecTemplate'); // Step 5 — reusable spec templates
const { saveImage } = require('../services/storageService');
const cache = require('../services/cache'); // audit fix — category mutations never dropped the cached catalog/filters
const specsUtil = require('../utils/specs'); // Step 5 — dynamic spec system
const { auditSchemaMutation } = require('../services/specAudit'); // Step 6 — shared schema audit trail

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Phase 2 (v2 catalog) — Category is a TREE. `path` = ancestor slugs incl.
   self (root first). Every admin write recomputes it from the parent chain. */
async function computePath(parentId, selfSlug) {
  const chain = [];
  let cur = parentId ? await Category.findById(parentId).lean() : null;
  let guard = 0;
  while (cur && guard++ < 10) { chain.unshift(cur.slug); cur = cur.parent ? await Category.findById(cur.parent).lean() : null; }
  if (selfSlug) chain.push(selfSlug);
  return chain;
}

/* reject a parent that is the node itself or one of its descendants (cycle) */
async function parentIsSafe(selfId, parentId) {
  if (!parentId) return true;
  if (String(selfId) === String(parentId)) return false;
  let cur = await Category.findById(parentId).lean();
  let guard = 0;
  while (cur && guard++ < 10) {
    if (String(cur._id) === String(selfId)) return false; // self sits above the proposed parent
    cur = cur.parent ? await Category.findById(cur.parent).lean() : null;
  }
  return true;
}

/* ============ ADMIN (mounted under /api/admin) ============ */

// POST /api/admin/categories (multipart: image) — body.parent = Category _id (optional)
exports.create = async (req, res, next) => {
  try {
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const slug = slugify(req.body.slug || name);
    const dupe = await Category.findOne({ $or: [{ slug }, { name }] });
    if (dupe) return res.status(409).json({ message: `Category "${dupe.name}" already exists` });

    const parentId = req.body.parent || null;
    if (parentId && !(await Category.findById(parentId))) return res.status(400).json({ message: 'Parent category not found' });
    const img = req.file ? await saveImage(req.file, 'arixgear/categories') : null;
    const doc = await Category.create({
      name,
      nameBn: String(req.body.nameBn || '').trim(), // Bengali label
      slug,
      parent: parentId || null,
      icon: String(req.body.icon || '').trim(),
      image: img ? img.url : String(req.body.image || ''),
      order: Number(req.body.order) || 0,
      active: req.body.active !== 'false' && req.body.active !== false,
    });
    doc.path = await computePath(doc.parent, doc.slug);
    await doc.save();
    cache.bump(); // audit fix — tree changed → drop cached list/filters
    res.status(201).json({ category: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/categories/:id (multipart: image) — reparenting recomputes
// the subtree's paths too (descendants denormalize the ancestor chain).
exports.update = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const b = req.body || {};
    if (b.name) c.name = String(b.name).trim();
    if (b.nameBn !== undefined) c.nameBn = String(b.nameBn || '').trim();
    if (b.slug) c.slug = slugify(b.slug);
    if (b.icon !== undefined) c.icon = String(b.icon || '').trim();
    if (b.image !== undefined) c.image = b.image;
    if (req.file) { const img = await saveImage(req.file, 'arixgear/categories'); c.image = img.url; }
    if (b.order !== undefined) c.order = Number(b.order) || 0;
    if (b.active !== undefined) c.active = b.active === 'true' || b.active === true;

    if (b.parent !== undefined) {
      const parentId = b.parent || null;
      if (parentId && !(await Category.findById(parentId))) return res.status(400).json({ message: 'Parent category not found' });
      if (!(await parentIsSafe(c._id, parentId))) return res.status(400).json({ message: 'Invalid parent — a category cannot live inside itself' });
      c.parent = parentId || null;
    }

    const oldSlug = c.slug;
    const slugChanged = Boolean(b.slug) && c.isModified('slug');
    await c.save();
    c.path = await computePath(c.parent, c.slug);
    await c.save();
    cache.bump(); // audit fix — tree changed → drop cached list/filters

    /* slug changed → descendants' paths embed the old slug; rewrite the subtree
       and move products off the dead slug string */
    if (slugChanged) {
      const kids = await Category.find({ parent: c._id });
      for (const k of kids) {
        k.path = await computePath(k.parent, k.slug);
        await k.save();
      }
      const Product = require('../models/Product');
      await Product.updateMany({ category: oldSlug }, { $set: { category: c.slug } });
    }
    res.json({ category: c });
  } catch (e) { next(e); }
};

// DELETE /api/admin/categories/:id — children are reparented to the node's own
// parent (subtree stays connected); products keep their category string.
exports.remove = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    await Category.updateMany({ parent: c._id }, { $set: { parent: c.parent || null } });
    await c.deleteOne();
    cache.bump(); // audit fix — tree changed → drop cached list/filters
    res.json({ ok: true });
  } catch (e) { next(e); }
};

/* ============ Step 5 — DYNAMIC SPEC SCHEMA (category level) ============ */


/* human summary from a schema diff ("+2 fields, -1 group, RAM: text→number") */
function diffSummary(diff) {
  const parts = [];
  if (diff.addedGroups.length) parts.push('+' + diff.addedGroups.length + ' group(s)');
  if (diff.removedGroups.length) parts.push('-' + diff.removedGroups.length + ' group(s)');
  if (diff.addedFields.length) parts.push('+' + diff.addedFields.length + ' field(s)');
  if (diff.removedFields.length) parts.push('-' + diff.removedFields.length + ' field(s)');
  if (diff.changedFields.length) parts.push(diff.changedFields.length + ' edited');
  return parts.length ? parts.join(', ') : 'no structural change';
}

// PUT /api/admin/categories/:id/spec-schema
// body: { specGroups: [...], hideEmptyFields?: bool } — full replace; every
// group/field is normalized+deduped (utils/specs) so the schema can never be
// poisoned from the client. Products keep their values; new keys appear in
// the editor automatically — no code change, no migration.
// Step 6 — the mutation diffs against the previous schema, bumps schemaVersion
// and lands an audit entry (who/when/what).
exports.updateSpecSchema = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const b = req.body || {};
    let groups = b.specGroups;
    if (typeof groups === 'string') { try { groups = JSON.parse(groups); } catch { groups = null; } }
    if (!Array.isArray(groups)) return res.status(400).json({ message: 'specGroups must be an array' });
    const diff = specsUtil.schemaDiff(c.specGroups || [], groups);
    c.specGroups = specsUtil.normalizeSpecGroups(groups);
    if (b.hideEmptyFields !== undefined) c.hideEmptyFields = b.hideEmptyFields === 'true' || b.hideEmptyFields === true;
    await auditSchemaMutation(c, 'edit', diffSummary(diff) + (diff.addedFields.length ? ' [' + diff.addedFields.slice(0, 5).join(', ') + ']' : ''), req.user);
    await c.save();
    cache.bump(); // schema feeds facets — drop cached filters
    res.json({ category: c, groups: c.specGroups, schemaVersion: c.schemaVersion, diff });
  } catch (e) { next(e); }
};

/* ============ Step 5 — REUSABLE SPEC TEMPLATES ============ */

// GET /api/admin/spec-templates — all saved templates (admin editor picker)
exports.listTemplates = async (_req, res, next) => {
  try {
    const items = await SpecTemplate.find().sort({ updatedAt: -1 }).lean();
    res.json({ items, total: items.length });
  } catch (e) { next(e); }
};

// POST /api/admin/spec-templates
// body: { name, nameBn?, description?, groups: [...] } — OR { fromCategory: slug }
// to snapshot a category's current schema as a template.
exports.createTemplate = async (req, res, next) => {
  try {
    const b = req.body || {};
    let groups = b.groups;
    if (b.fromCategory) {
      const cat = await Category.findOne({ slug: String(b.fromCategory).toLowerCase() }).select('specGroups').lean();
      if (!cat) return res.status(404).json({ message: 'Source category not found' });
      groups = cat.specGroups || [];
    }
    if (typeof groups === 'string') { try { groups = JSON.parse(groups); } catch { groups = null; } }
    if (!Array.isArray(groups)) return res.status(400).json({ message: 'groups must be an array (or pass fromCategory)' });
    const name = String(b.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ message: 'Template name is required' });
    const doc = await SpecTemplate.create({
      name,
      nameBn: String(b.nameBn || '').trim().slice(0, 80),
      description: String(b.description || '').trim().slice(0, 300),
      groups: specsUtil.normalizeSpecGroups(groups),
      createdBy: (req.user && req.user._id) || null,
    });
    res.status(201).json({ template: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/spec-templates/:id — rename / edit description / update groups
exports.updateTemplate = async (req, res, next) => {
  try {
    const t = await SpecTemplate.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const b = req.body || {};
    if (b.name) t.name = String(b.name).trim().slice(0, 80);
    if (b.nameBn !== undefined) t.nameBn = String(b.nameBn || '').trim().slice(0, 80);
    if (b.description !== undefined) t.description = String(b.description || '').trim().slice(0, 300);
    let groups = b.groups;
    if (typeof groups === 'string') { try { groups = JSON.parse(groups); } catch { groups = null; } }
    if (Array.isArray(groups)) t.groups = specsUtil.normalizeSpecGroups(groups);
    await t.save();
    res.json({ template: t });
  } catch (e) { next(e); }
};

// DELETE /api/admin/spec-templates/:id
exports.removeTemplate = async (req, res, next) => {
  try {
    const t = await SpecTemplate.findById(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    await t.deleteOne();
    res.json({ ok: true });
  } catch (e) { next(e); }
};

// POST /api/admin/categories/:id/apply-template
// body: { templateId, mode: 'merge'|'replace' } — merge keeps existing groups
// and appends only unknown groups/fields; replace swaps the whole schema.
// Step 6 — audited like every other schema mutation.
exports.applyTemplate = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const b = req.body || {};
    const t = await SpecTemplate.findById(b.templateId);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    const mode = b.mode === 'replace' ? 'replace' : 'merge';
    const diff = specsUtil.schemaDiff(c.specGroups || [], specsUtil.mergeGroups(c.specGroups || [], t.groups || [], mode));
    c.specGroups = specsUtil.mergeGroups(c.specGroups || [], t.groups || [], mode);
    await auditSchemaMutation(c, 'template', 'template "' + t.name + '" applied (' + mode + ') — ' + diffSummary(diff), req.user);
    await c.save();
    cache.bump();
    res.json({ category: c, groups: c.specGroups, mode, schemaVersion: c.schemaVersion, diff });
  } catch (e) { next(e); }
};

/* ============ Step 6 — BULK SPEC FILL ============ */

// POST /api/admin/categories/:id/apply-defaults
// body: { fields?: [fieldKey,...] } (optional whitelist) — one server-side
// pass that fills every active product of the category with the schema's
// defaultValue for fields the product has no value for yet. Flat legacy
// arrays regenerate per product so PDP/compare/CSV/RAG stay in lockstep.
exports.applyDefaults = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const schema = specsUtil.normalizeSpecGroups(c.specGroups || []);
    const only = Array.isArray((req.body || {}).fields) ? new Set(req.body.fields.map(String)) : null;
    const fillable = [];
    for (const g of schema) {
      for (const f of g.fields || []) {
        if (only && !only.has(f.key)) continue;
        const d = f.defaultValue;
        if (d === undefined || d === null || (typeof d === 'string' && d.trim() === '') || (Array.isArray(d) && !d.length)) continue;
        fillable.push({ g: g.key, f, v: specsUtil.coerceValue(f, f.type === 'multiselect' ? (Array.isArray(d) ? d : [d]) : d) });
      }
    }
    if (!fillable.length) return res.status(400).json({ message: 'No fillable defaults on this schema — set defaultValue(s) first' });

    const Product = require('../models/Product');
    const docs = await Product.find({ category: c.slug }).select('name specs specsBn specValues').lean();
    let updated = 0, filled = 0;
    for (const p of docs) {
      const have = new Set((p.specValues || []).map((s) => s.g + '|' + s.k));
      const add = fillable
        .filter(({ g, f }) => !have.has(g + '|' + f.key))
        .filter(({ f }) => f.type !== 'number' || Number.isFinite(f.v));
      if (!add.length) continue;
      const rows = [...(p.specValues || []), ...add.map(({ g, f, v }) => ({ g, k: f.key, v }))];
      await Product.updateOne({ _id: p._id }, {
        $set: {
          specValues: rows,
          specs: specsUtil.flatFromValues(schema, rows, false),
          specsBn: specsUtil.flatFromValues(schema, rows, true),
        },
      });
      updated++;
      filled += add.length;
    }
    if (updated) cache.bump(); // specs ride cards/PDP — drop cached payloads
    res.json({ ok: true, scanned: docs.length, updated, filled, fields: fillable.map(({ f }) => f.key) });
  } catch (e) { next(e); }
};

/* ============ Step 7 — FACET ALIAS AUTO-SUGGEST (#1) ============ */

// GET /api/admin/categories/:id/alias-suggestions
// Mines the category's own product values and proposes raw→canonical alias
// pairs for filterable fields (Step 6 made aliases admin-authored only — this
// closes the loop: the data itself suggests its normalizations). Read-only —
// the admin reviews and applies pairs through the existing schema editor.
exports.aliasSuggestions = async (req, res, next) => {
  try {
    const c = await Category.findById(req.params.id).select('name slug specGroups path').lean();
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const schema = specsUtil.normalizeSpecGroups(c.specGroups || []);
    /* branch-aware: roots hold no direct products — the facets run over the
       union branch (self + descendants share the schema), so the miner does too */
    const descendants = await Category.find({ path: c.slug }).select('slug').lean();
    const slugs = [...new Set(descendants.map((d) => d.slug).concat(c.slug))];
    const Product = require('../models/Product');
    const docs = await Product.find({ category: { $in: slugs } })
      .select('specs specValues')
      .lean();
    const fields = specsUtil.suggestAliasPairs(schema, docs).slice(0, 24);
    res.json({
      category: c.slug,
      branch: slugs,
      scanned: docs.length,
      fields,
      totalSuggestions: fields.reduce((a, f) => a + f.suggestions.length, 0),
    });
  } catch (e) { next(e); }
};

/* ============ PUBLIC (mounted under /api/categories) ============ */

// GET /api/categories/tree — active categories as a nested tree (roots keep
// `children: []`), each node carrying its path for deep links.
exports.tree = async (_req, res, next) => {
  try {
    const all = await Category.find({ active: true }).sort({ order: 1, name: 1 }).lean();
    const byId = Object.fromEntries(all.map((c) => [String(c._id), { ...c, children: [] }]));
    const roots = [];
    for (const node of Object.values(byId)) {
      const pid = node.parent && byId[String(node.parent)] ? String(node.parent) : null;
      if (pid) byId[pid].children.push(node);
      else roots.push(node);
    }
    res.json({ items: roots, total: roots.length, nodes: all.length });
  } catch (e) { next(e); }
};
