const Category = require('../models/Category');
const SpecTemplate = require('../models/SpecTemplate'); // Step 5 — reusable spec templates
const { saveImage, deleteImage } = require('../services/storageService');
const cache = require('../services/cache'); // audit fix — category mutations never dropped the cached catalog/filters
const specsUtil = require('../utils/specs'); // Step 5 — dynamic spec system
const { auditSchemaMutation } = require('../services/specAudit'); // Step 6 — shared schema audit trail

const slugify = (s) => String(s || '').toLowerCase().trim()
  .replace(/[^a-z0-9\u0980-\u09FF]+/g, '-')
  .replace(/(^-|-$)/g, '').slice(0, 120) || 'category';
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const validId = (v) => typeof v === 'string' && /^[a-f\d]{24}$/i.test(v);
const parseOrder = (v) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 999 ? n : null;
};

/* Phase 2 (v2 catalog) — Category is a TREE. `path` = ancestor slugs incl.
   self (root first). Every admin write recomputes it from the parent chain. */
async function computePath(parentId, selfSlug) {
  const chain = [];
  let cur = parentId ? await Category.findById(parentId).lean() : null;
  const seen = new Set();
  while (cur) {
    const id = String(cur._id);
    if (seen.has(id)) throw Object.assign(new Error('Category tree contains a parent cycle'), { status: 400 });
    seen.add(id);
    if (chain.length >= 9) throw Object.assign(new Error('Category nesting cannot exceed 10 levels'), { status: 400 });
    chain.unshift(cur.slug);
    cur = cur.parent ? await Category.findById(cur.parent).lean() : null;
  }
  if (selfSlug) chain.push(selfSlug);
  return chain;
}

/* reject a parent that is the node itself or one of its descendants (cycle) */
async function parentIsSafe(selfId, parentId) {
  if (!parentId) return true;
  if (String(selfId) === String(parentId)) return false;
  let cur = await Category.findById(parentId).lean();
  const seen = new Set();
  while (cur) {
    const id = String(cur._id);
    if (seen.has(id)) return false;
    seen.add(id);
    if (String(cur._id) === String(selfId)) return false; // self sits above the proposed parent
    cur = cur.parent ? await Category.findById(cur.parent).lean() : null;
  }
  return true;
}

/* Rebuild every descendant path and the product denormalization after a move
   or slug edit. Category paths are also the branch filter/count contract. */
async function refreshSubtrees(roots) {
  if (!roots.length) return [];
  const all = await Category.find().select('_id parent slug path').lean();
  const children = new Map();
  for (const node of all) {
    const parentId = node.parent ? String(node.parent) : '';
    if (!parentId) continue;
    const list = children.get(parentId) || [];
    list.push(node);
    children.set(parentId, list);
  }
  const Product = require('../models/Product');
  const queue = roots.map((node) => ({ ...node, path: [...(node.path || [node.slug])] }));
  const seen = new Set();
  const ordered = [];
  while (queue.length) {
    const node = queue.shift();
    const id = String(node._id);
    if (seen.has(id)) throw Object.assign(new Error('Category tree contains a cycle'), { status: 400 });
    seen.add(id);
    ordered.push(node);
    for (const child of children.get(id) || []) {
      const path = [...node.path, child.slug];
      await Category.updateOne({ _id: child._id }, { $set: { path } });
      queue.push({ ...child, path });
    }
  }
  for (const node of ordered) {
    await Product.updateMany({ category: node.slug }, {
      $set: { categoryRef: node._id, categoryPath: node.path },
    });
  }
  return ordered;
}

/* ============ ADMIN (mounted under /api/admin) ============ */

// POST /api/admin/categories (multipart: image) — body.parent = Category _id (optional)
exports.create = async (req, res, next) => {
  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Category name is required' });
    const slug = slugify(body.slug || name);
    const dupe = await Category.findOne({ $or: [{ slug }, { name: { $regex: `^${escapeRe(name)}$`, $options: 'i' } }] });
    if (dupe) return res.status(409).json({ message: `Category "${dupe.name}" already exists` });

    const parentId = body.parent || null;
    if (parentId && !validId(parentId)) return res.status(400).json({ message: 'Parent category id is invalid' });
    if (parentId && !(await Category.findById(parentId))) return res.status(400).json({ message: 'Parent category not found' });
    const path = await computePath(parentId, slug);
    const order = body.order === undefined || body.order === '' ? 0 : parseOrder(body.order);
    if (order === null) return res.status(400).json({ message: 'Order must be a whole number between 0 and 999' });
    const img = req.file ? await saveImage(req.file, 'arixgear/categories') : null;
    let doc;
    try {
      doc = await Category.create({
        name,
        nameBn: String(body.nameBn || '').trim(), // Bengali label
        slug,
        parent: parentId || null,
        path,
        icon: String(body.icon || '').trim(),
        image: img ? img.url : String(body.image || ''),
        order,
        active: body.active !== 'false' && body.active !== false,
        showInNavbar: body.showInNavbar !== 'false' && body.showInNavbar !== false,
      });
    } catch (e) {
      if (img && img.publicId) await deleteImage(img.publicId);
      throw e;
    }
    cache.bump(); // audit fix — tree changed → drop cached list/filters
    res.status(201).json({ category: doc });
  } catch (e) { next(e); }
};

// PUT /api/admin/categories/:id (multipart: image) — reparenting recomputes
// the subtree's paths too (descendants denormalize the ancestor chain).
exports.update = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid category id' });
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const b = req.body || {};
    const oldSlug = c.slug;
    if (b.name !== undefined) {
      const name = String(b.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Category name cannot be empty' });
      const dupeName = await Category.findOne({ name: { $regex: `^${escapeRe(name)}$`, $options: 'i' }, _id: { $ne: c._id } });
      if (dupeName) return res.status(409).json({ message: `Category "${dupeName.name}" already exists` });
      c.name = name;
    }
    if (b.nameBn !== undefined) c.nameBn = String(b.nameBn || '').trim();
    if (b.slug !== undefined || b.name !== undefined) {
      const slug = slugify(b.slug || c.name);
      const dupeSlug = await Category.findOne({ slug, _id: { $ne: c._id } });
      if (dupeSlug) return res.status(409).json({ message: `Category slug "${slug}" is already in use` });
      c.slug = slug;
    }
    if (b.icon !== undefined) c.icon = String(b.icon || '').trim();
    if (b.image !== undefined) c.image = b.image;
    if (b.order !== undefined) {
      const order = parseOrder(b.order);
      if (order === null) return res.status(400).json({ message: 'Order must be a whole number between 0 and 999' });
      c.order = order;
    }
    if (b.active !== undefined) c.active = b.active === 'true' || b.active === true;
    if (b.showInNavbar !== undefined) c.showInNavbar = b.showInNavbar === 'true' || b.showInNavbar === true;

    if (b.parent !== undefined) {
      const parentId = b.parent || null;
      if (parentId && !validId(parentId)) return res.status(400).json({ message: 'Parent category id is invalid' });
      if (parentId && !(await Category.findById(parentId))) return res.status(400).json({ message: 'Parent category not found' });
      if (!(await parentIsSafe(c._id, parentId))) return res.status(400).json({ message: 'Invalid parent — a category cannot live inside itself' });
      c.parent = parentId || null;
    }

    c.path = await computePath(c.parent, c.slug);
    let uploadedImage;
    if (req.file) uploadedImage = await saveImage(req.file, 'arixgear/categories');
    if (uploadedImage) c.image = uploadedImage.url;
    try {
      await c.save();
    } catch (e) {
      if (uploadedImage && uploadedImage.publicId) await deleteImage(uploadedImage.publicId);
      throw e;
    }
    if (oldSlug !== c.slug) {
      const Product = require('../models/Product');
      await Product.updateMany({ category: oldSlug }, { $set: { category: c.slug, categoryRef: c._id, categoryPath: c.path } });
    }
    await refreshSubtrees([{ _id: c._id, parent: c.parent, slug: c.slug, path: c.path }]);
    cache.bump();
    res.json({ category: c });
  } catch (e) { next(e); }
};

// DELETE /api/admin/categories/:id — children are reparented to the node's own
// parent (subtree stays connected); products keep their category string.
exports.remove = async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ message: 'Invalid category id' });
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    const children = await Category.find({ parent: c._id }).select('_id parent slug path').lean();
    const parent = c.parent ? await Category.findById(c.parent).select('_id path').lean() : null;
    const parentPath = parent ? (parent.path || []) : [];
    await Category.updateMany({ parent: c._id }, { $set: { parent: c.parent || null } });
    await c.deleteOne();
    const Product = require('../models/Product');
    await Product.updateMany({ category: c.slug }, {
      $set: { categoryRef: parent ? parent._id : null, categoryPath: parentPath },
    });
    const roots = children.map((child) => ({
      ...child,
      parent: c.parent || null,
      path: [...parentPath, child.slug],
    }));
    for (const root of roots) {
      await Category.updateOne({ _id: root._id }, { $set: { parent: root.parent, path: root.path } });
    }
    await refreshSubtrees(roots);
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
    const Product = require('../models/Product');
    const [all, counts] = await Promise.all([
      Category.find({ active: true }).sort({ order: 1, name: 1 }).lean(),
      Product.aggregate([
        { $match: { active: true } },
        { $project: { paths: { $cond: [
          { $gt: [{ $size: { $ifNull: ['$categoryPath', []] } }, 0] },
          '$categoryPath',
          ['$category'],
        ] } } },
        { $unwind: '$paths' },
        { $group: { _id: '$paths', n: { $sum: 1 } } },
      ]),
    ]);
    const countBySlug = Object.fromEntries(counts.map((r) => [r._id, r.n]));
    const byId = Object.fromEntries(all.map((c) => [String(c._id), { ...c, productCount: countBySlug[c.slug] || 0, children: [] }]));
    const roots = [];
    for (const node of Object.values(byId)) {
      const pid = node.parent && byId[String(node.parent)] ? String(node.parent) : null;
      if (pid) byId[pid].children.push(node);
      else roots.push(node);
    }
    res.json({ items: roots, total: roots.length, nodes: all.length });
  } catch (e) { next(e); }
};
