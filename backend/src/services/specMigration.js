/* Step 6 — SPEC-SYSTEM MIGRATION CORE (shared by the CLI script and the boot
   auto-run). Idempotent: products that already carry specValues are skipped,
   so it is safe to run at EVERY boot — the check below is a cheap count. */
const Product = require('../models/Product');
const Category = require('../models/Category');
const specsUtil = require('../utils/specs');

/* cheap boot probe: any product with legacy flat specs but no canonical rows? */
async function needsMigration() {
  return Product.countDocuments({
    $and: [
      { specs: { $exists: true, $ne: [] } },
      { $or: [{ specValues: { $exists: false } }, { specValues: { $size: 0 } }] },
    ],
  });
}

/* the migrate-specs-v3 pass — same semantics as the CLI, minus the process
   plumbing. dry=true reports only. Returns { migrated, schemasGrown } */
async function runMigration({ dry = false, log = console.log } = {}) {
  const products = await Product.find({
    $and: [
      { specs: { $exists: true, $ne: [] } },
      { $or: [{ specValues: { $exists: false } }, { specValues: { $size: 0 } }] },
    ],
  }).select('name slug category specs specValues').lean();
  log(`[spec-migration] products needing migration: ${products.length}`);

  const catCache = new Map();
  const schemasTouched = new Set();

  for (const p of products) {
    let schema = catCache.get(p.category);
    if (!schema) {
      const c = await Category.findOne({ slug: p.category }).select('specGroups').lean();
      schema = specsUtil.normalizeSpecGroups((c && c.specGroups) || []);
      catCache.set(p.category, schema);
    }
    const before = JSON.stringify(schema);
    const values = specsUtil.specValuesFromPairs(schema, p.specs); // mutates schema
    if (JSON.stringify(schema) !== before) schemasTouched.add(p.category);
    if (!dry) {
      await Product.updateOne({ _id: p._id }, { $set: { specValues: values } });
    }
    log(`  · ${p.slug}: ${values.length} spec rows (${p.category})`);
  }

  if (!dry) {
    for (const [slug, schema] of catCache) {
      if (!schemasTouched.has(slug)) continue;
      await Category.updateOne({ slug }, { $set: { specGroups: specsUtil.normalizeSpecGroups(schema) } });
      log(`  ✓ category schema saved: ${slug}`);
    }
  }
  return { migrated: products.length, schemasGrown: schemasTouched.size, dry };
}

module.exports = { needsMigration, runMigration };
