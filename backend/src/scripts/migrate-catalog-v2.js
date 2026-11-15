#!/usr/bin/env node
/**
 * arixgear.tech — Catalog migration v1 → v2 (Phase 2)
 * ------------------------------------------------------------------
 * Converts the fitness-era flat catalog to the v2 tree + brand model:
 *
 *   1. BACKUP      copies `products` + `categories` into *_backup_pre_v2
 *   2. CATEGORIES  upserts a Category doc for every product.category slug that
 *                  has none (root level), computes `path` for every node,
 *                  optionally re-nests the tree from --tree-map JSON
 *                  { "parent-slug": ["child-slug", ...] }
 *   3. BRANDS      optional --brand-map JSON { "category-slug": "Brand Name" }
 *                  (or { "*": "Brand Name" } fallback) — creates Brand docs and
 *                  assigns every product in that category; legacy product.brand
 *                  STRING values are converted to refs too
 *   4. PRODUCTS    categoryRef + categoryPath resolution · SKU generation
 *                  (ARG-XXXXXXXX when absent, explicit sku wins) · warranty
 *                  parsing from a `specs` row { k: 'Warranty', v: '2 years' }
 *                  · variantLabel default 'Size' when sizes exist
 *
 * Usage (from backend/):
 *   node src/scripts/migrate-catalog-v2.js --dry           # plan only, no writes
 *   node src/scripts/migrate-catalog-v2.js                 # run (backup first)
 *   node src/scripts/migrate-catalog-v2.js --verify        # post-run integrity checks
 *   node src/scripts/migrate-catalog-v2.js --brand-map b.json --tree-map t.json
 *
 * Idempotent: every step re-runs safely (upserts, guards on existing fields).
 */
const mongoose = require('mongoose');
require('dotenv').config();

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const VERIFY = args.includes('--verify');
const argVal = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const readJson = (p) => (p ? JSON.parse(require('fs').readFileSync(p, 'utf8')) : null);

const TREE_MAP = readJson(argVal('--tree-map'));
const BRAND_MAP = readJson(argVal('--brand-map'));

const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const log = (...a) => console.log('[migrate]', ...a);
const stats = { backups: 0, catsUpserted: 0, catsNested: 0, brandsCreated: 0, brandsAssigned: 0, skuGenerated: 0, warrantyParsed: 0, variantLabeled: 0, catRefsResolved: 0, catRefsMissing: 0 };

async function computePath(parentId, selfSlug) {
  const chain = [];
  let cur = parentId ? await Category.findById(parentId).lean() : null;
  let guard = 0;
  while (cur && guard++ < 10) { chain.unshift(cur.slug); cur = cur.parent ? await Category.findById(cur.parent).lean() : null; }
  chain.push(selfSlug);
  return chain;
}

/* parse "2 years" / "24 months" / "1 year" → months (0 = none) */
function warrantyMonthsFromSpecs(specs) {
  if (!Array.isArray(specs)) return 0;
  const row = specs.find((s) => s && typeof s.k === 'string' && /^warrant(y|y period)$/i.test(s.k.trim()));
  if (!row) return 0;
  const m = /(\d+)\s*(month|year|yr)/i.exec(String(row.v || ''));
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  return /month/i.test(m[2]) ? n : n * 12;
}

async function backupCollections() {
  for (const name of ['products', 'categories']) {
    const src = mongoose.connection.collection(name);
    const dest = mongoose.connection.collection(name + '_backup_pre_v2');
    const docs = await src.find({}).toArray();
    if (docs.length) {
      await dest.deleteMany({});
      await dest.insertMany(docs, { ordered: false });
    }
    stats.backups += docs.length;
    log(`backup: ${name} → ${name}_backup_pre_v2 (${docs.length} docs)`);
  }
}

async function migrateCategories() {
  const slugs = await Product.distinct('category');
  for (const slug of slugs.filter(Boolean)) {
    let c = await Category.findOne({ slug });
    if (!c) {
      if (DRY) { log(`[dry] would create root category "${slug}"`); stats.catsUpserted++; continue; }
      c = await Category.create({ name: slug.replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()), slug, parent: null, path: [slug] });
      stats.catsUpserted++;
      log(`category upserted: ${slug}`);
    }
  }

  /* optional re-nesting from --tree-map: { parentSlug: [childSlugs...] } */
  if (TREE_MAP) {
    for (const [parentSlug, children] of Object.entries(TREE_MAP)) {
      const parent = await Category.findOne({ slug: slugify(parentSlug) });
      if (!parent) { log(`WARN tree-map: parent "${parentSlug}" not found — skipped`); continue; }
      for (const childSlug of children) {
        const child = await Category.findOne({ slug: slugify(childSlug) });
        if (!child) { log(`WARN tree-map: child "${childSlug}" not found — skipped`); continue; }
        if (String(child._id) === String(parent._id)) { log(`WARN tree-map: "${childSlug}" cannot be its own parent`); continue; }
        if (DRY) { log(`[dry] would nest "${childSlug}" under "${parentSlug}"`); stats.catsNested++; continue; }
        child.parent = parent._id;
        child.path = await computePath(parent._id, child.slug);
        await child.save();
        /* descendants of the child re-embed the new path */
        const grandkids = await Category.find({ parent: child._id });
        for (const g of grandkids) { g.path = await computePath(g.parent, g.slug); await g.save(); }
        stats.catsNested++;
        log(`nested: ${child.slug} → ${parent.slug}`);
      }
    }
  }

  /* recompute every path (fixes any legacy drift, idempotent) */
  if (!DRY) {
    const all = await Category.find({});
    for (const c of all) {
      const path = await computePath(c.parent, c.slug);
      if (JSON.stringify(c.path || []) !== JSON.stringify(path)) { c.path = path; await c.save(); }
    }
  }
}

async function migrateBrands() {
  /* legacy string brands (if any dataset stored a plain string) → refs */
  const strBrands = await Product.distinct('brand', { brand: { $type: 'string' } }).catch(() => []);
  for (const name of strBrands.filter(Boolean)) {
    let b = await Brand.findOne({ slug: slugify(name) });
    if (!b) {
      if (DRY) { log(`[dry] would create brand "${name}"`); stats.brandsCreated++; continue; }
      b = await Brand.create({ name, slug: slugify(name) });
      stats.brandsCreated++;
    }
    const r = await Product.updateMany({ brand: name }, { $set: { brand: b._id } });
    stats.brandsAssigned += r.modifiedCount;
    log(`brand "${name}": ${r.modifiedCount} products re-pointed to ref`);
  }

  /* optional category-based assignment from --brand-map */
  if (BRAND_MAP) {
    for (const [key, brandName] of Object.entries(BRAND_MAP)) {
      let b = await Brand.findOne({ slug: slugify(brandName) });
      if (!b) {
        if (DRY) { log(`[dry] would create brand "${brandName}"`); stats.brandsCreated++; continue; }
        b = await Brand.create({ name: brandName, slug: slugify(brandName) });
        stats.brandsCreated++;
        log(`brand created: ${brandName}`);
      }
      const q = key === '*' ? {} : { category: slugify(key) };
      if (DRY) { const n = await Product.countDocuments(q); log(`[dry] would assign "${brandName}" to ${n} products (${key})`); stats.brandsAssigned += n; continue; }
      const r = await Product.updateMany(q, { $set: { brand: b._id } });
      stats.brandsAssigned += r.modifiedCount;
      log(`brand "${brandName}" assigned to ${r.modifiedCount} products (${key})`);
    }
  }
}

async function migrateProducts() {
  const cats = await Category.find({}).select('slug path').lean();
  const catBySlug = Object.fromEntries(cats.map((c) => [c.slug, c]));
  const cursor = Product.find({}).cursor();
  for (let p = await cursor.next(); p; p = await cursor.next()) {
    let touched = false;

    /* categoryRef + categoryPath from the slug */
    const c = catBySlug[p.category];
    const wantPath = c ? (c.path && c.path.length ? c.path : [c.slug]) : [];
    if (!c) {
      /* dry: step 2 would create this category → resolvable in the same run.
         real: genuinely unmatched (data drift) → counted for the report. */
      if (DRY) stats.catRefsResolved++; else stats.catRefsMissing++;
    } else if (String(p.categoryRef || '') !== String(c._id) || JSON.stringify(p.categoryPath || []) !== JSON.stringify(wantPath)) {
      stats.catRefsResolved++;
      if (!DRY) { p.categoryRef = c._id; p.categoryPath = wantPath; touched = true; }
    }

    /* SKU — explicit wins, else ARG-XXXXXXXX */
    if (!p.sku) {
      stats.skuGenerated++;
      if (!DRY) { p.sku = 'ARG-' + Math.random().toString(36).slice(2, 10).toUpperCase(); touched = true; }
    }

    /* warranty from the specs table (only when unset) */
    if (!p.warranty || (!p.warranty.months && (!p.warranty.type || p.warranty.type === 'manufacturer') && !p.warranty.note)) {
      const months = warrantyMonthsFromSpecs(p.specs);
      if (months > 0) {
        stats.warrantyParsed++;
        if (!DRY) { p.warranty = { months, type: 'manufacturer', note: '' }; touched = true; }
      }
    }

    /* generalized variant axis — legacy data keeps the honest label */
    if (!p.variantLabel && Array.isArray(p.sizes) && p.sizes.length) {
      stats.variantLabeled++;
      if (!DRY) { p.variantLabel = 'Size'; touched = true; }
    }

    if (touched && !DRY) await p.save();
  }
}

async function verify() {
  log('--- VERIFY ---');
  const fails = [];
  const nProducts = await Product.countDocuments({});
  const nCats = await Category.countDocuments({});
  const nBrands = await Brand.countDocuments({});

  const noRef = await Product.countDocuments({ categoryRef: null });

  /* ref points at a category whose slug ≠ the product's category string */
  const catIdBySlug = Object.fromEntries((await Category.find({}).select('_id slug').lean()).map((c) => [String(c._id), c.slug]));
  const catDocs = Object.fromEntries((await Category.find({}).select('_id slug').lean()).map((c) => [c.slug, String(c._id)]));
  let slugRefMismatch = 0;
  const cur = Product.find({ categoryRef: { $ne: null } }).select('category categoryRef').cursor();
  for (let p = await cur.next(); p; p = await cur.next()) {
    const slugOfRef = catIdBySlug[String(p.categoryRef)];
    if (slugOfRef !== p.category) slugRefMismatch++;
  }
  void catDocs;

  const badBrandRefs = await Product.aggregate([
    { $match: { brand: { $ne: null } } },
    { $lookup: { from: 'brands', localField: 'brand', foreignField: '_id', as: '_b' } },
    { $match: { _b: { $size: 0 } } },
    { $count: 'n' },
  ]);
  const dupSkus = await Product.aggregate([
    { $match: { sku: { $type: 'string', $ne: null } } },
    { $group: { _id: '$sku', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $count: 'n' },
  ]);
  const noPath = await Category.countDocuments({ $or: [{ path: { $size: 0 } }, { path: { $exists: false } }] });
  const orphanParent = await Category.aggregate([
    { $match: { parent: { $ne: null } } },
    { $lookup: { from: 'categories', localField: 'parent', foreignField: '_id', as: '_p' } },
    { $match: { _p: { $size: 0 } } },
    { $count: 'n' },
  ]);

  log(`products: ${nProducts} · categories: ${nCats} · brands: ${nBrands}`);
  log(`products without categoryRef (no matching category doc): ${noRef}`);
  log(`slug ↔ categoryRef mismatches: ${slugRefMismatch}`);
  log(`dangling brand refs: ${(badBrandRefs[0] || {}).n || 0}`);
  log(`duplicate SKUs: ${(dupSkus[0] || {}).n || 0}`);
  log(`categories missing path: ${noPath}`);
  log(`orphan parent refs: ${(orphanParent[0] || {}).n || 0}`);

  if (noPath > 0) fails.push('categories missing path');
  if (((orphanParent[0] || {}).n || 0) > 0) fails.push('orphan parent refs');
  if (((dupSkus[0] || {}).n || 0) > 0) fails.push('duplicate SKUs');
  if (((badBrandRefs[0] || {}).n || 0) > 0) fails.push('dangling brand refs');
  if (slugRefMismatch > 0) fails.push('slug ↔ categoryRef mismatches');

  if (fails.length) { console.error('❌ VERIFY FAILED:', fails.join(' · ')); process.exitCode = 1; }
  else console.log('✅ VERIFY PASSED');
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear'; // audit fix — was the legacy 'forged' DB
  await mongoose.connect(uri);
  log(`connected → ${mongoose.connection.name}${DRY ? ' (DRY RUN)' : ''}${VERIFY ? ' (VERIFY)' : ''}`);

  if (VERIFY) { await verify(); await mongoose.disconnect(); return; }

  await backupCollections();
  await migrateCategories();
  await migrateBrands();
  await migrateProducts();

  log('--- SUMMARY ---', JSON.stringify(stats, null, 2));
  if (!DRY) log('done. Re-run with --verify to check integrity.');
  await mongoose.disconnect();
}

main().catch((e) => { console.error('[migrate] FAILED:', e); process.exit(1); });
