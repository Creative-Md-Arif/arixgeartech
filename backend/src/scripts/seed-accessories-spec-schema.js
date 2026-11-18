const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/Category');
const specsUtil = require('../utils/specs');
const { mergeSeedSpecSchema } = require('../utils/mergeSeedSpecSchema');
const { auditSchemaMutation } = require('../services/specAudit');
const { COMMON_SPEC_GROUPS, CATEGORY_SPEC_GROUPS } = require('../seed/accessoriesSpecSchema');

const ROOT_SLUG = 'accessories';
const replaceExisting = process.argv.includes('--replace');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  const categories = await Category.find().select('name slug parent specGroups schemaVersion schemaAudit');
  const root = categories.find((category) => category.slug === ROOT_SLUG);
  if (!root) throw new Error('Accessories & Gadgets category not found; run the category seed first');

  const requiredSlugs = [
    'mobile-accessories',
    'computer-accessories',
    'audio',
    'gaming',
    'cables-adapters-hubs',
    'storage-memory',
    'smart-gadgets',
  ];
  const existingSlugs = new Set(categories.map((category) => category.slug));
  const missingSlugs = requiredSlugs.filter((slug) => !existingSlugs.has(slug));
  if (missingSlugs.length) {
    throw new Error(`Accessories subcategories are missing (${missingSlugs.join(', ')}); run the category seed first`);
  }

  const childrenByParent = new Map();
  for (const category of categories) {
    if (!category.parent) continue;
    const parentId = String(category.parent);
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(category);
  }

  const targets = [];
  const pending = [root];
  const visited = new Set();
  while (pending.length) {
    const category = pending.shift();
    const id = String(category._id);
    if (visited.has(id)) continue;
    visited.add(id);
    targets.push(category);
    pending.push(...(childrenByParent.get(id) || []));
  }

  let updated = 0;
  for (const category of targets) {
    const seedGroups = [
      ...COMMON_SPEC_GROUPS,
      ...(CATEGORY_SPEC_GROUPS[category.slug] || []),
    ];
    const normalizedSchema = specsUtil.normalizeSpecGroups(seedGroups);
    const existing = specsUtil.normalizeSpecGroups(category.specGroups || []);
    const schema = replaceExisting
      ? normalizedSchema
      : mergeSeedSpecSchema(existing, normalizedSchema);
    if (JSON.stringify(existing) === JSON.stringify(schema)) continue;

    category.specGroups = schema;
    const fieldCount = normalizedSchema.reduce((total, group) => total + group.fields.length, 0);
    await auditSchemaMutation(
      category,
      'seed',
      `${replaceExisting ? 'Replaced' : 'Merged'} accessories specification schema (${normalizedSchema.length} seed groups, ${fieldCount} seed fields)`,
      null,
    );
    await category.save();
    updated += 1;
  }

  console.log(
    `[accessories spec schema seed] updated ${updated} of ${targets.length} categories ` +
    `under "${ROOT_SLUG}" (${replaceExisting ? 'replaced' : 'merged'})`,
  );
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[accessories spec schema seed] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
