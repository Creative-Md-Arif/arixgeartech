const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/Category');
const specsUtil = require('../utils/specs');
const { mergeSeedSpecSchema } = require('../utils/mergeSeedSpecSchema');
const { auditSchemaMutation } = require('../services/specAudit');
const { CATEGORIES } = require('../seed/techData');
const { specGroupsForPath } = require('../seed/catalogSpecSchemas');

const replaceExisting = process.argv.includes('--replace');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  const categories = await Category.find().select('name slug parent specGroups schemaVersion schemaAudit');
  const seededSlugs = new Set(categories.map((category) => category.slug));
  const missingSlugs = CATEGORIES.filter((category) => !seededSlugs.has(category.slug)).map((category) => category.slug);
  if (missingSlugs.length) {
    throw new Error(
      `Seeded categories are missing (${missingSlugs.slice(0, 10).join(', ')}${missingSlugs.length > 10 ? ', …' : ''}); run the category seed first`,
    );
  }

  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const childrenByParent = new Map();
  for (const category of categories) {
    if (!category.parent) continue;
    const parentId = String(category.parent);
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(category);
  }

  const targets = [];
  const visited = new Set();
  for (const seedRoot of CATEGORIES.filter((category) => category.parent === null)) {
    const root = bySlug.get(seedRoot.slug);
    if (!root) throw new Error(`Root category "${seedRoot.slug}" is missing`);
    const pending = [{ category: root, path: [root.slug] }];

    while (pending.length) {
      const { category, path } = pending.shift();
      const id = String(category._id);
      if (visited.has(id)) continue;
      visited.add(id);
      targets.push({ category, path });
      for (const child of childrenByParent.get(id) || []) {
        pending.push({ category: child, path: [...path, child.slug] });
      }
    }
  }

  let updated = 0;
  let seedGroupsCount = 0;
  let seedFieldsCount = 0;
  for (const { category, path } of targets) {
    const normalizedSchema = specsUtil.normalizeSpecGroups(specGroupsForPath(path));
    if (!normalizedSchema.length) {
      throw new Error(`No specification schema was defined for category "${category.slug}"`);
    }

    const existing = specsUtil.normalizeSpecGroups(category.specGroups || []);
    const schema = replaceExisting
      ? normalizedSchema
      : mergeSeedSpecSchema(existing, normalizedSchema);
    if (JSON.stringify(existing) === JSON.stringify(schema)) continue;

    category.specGroups = schema;
    await auditSchemaMutation(
      category,
      'seed',
      `${replaceExisting ? 'Replaced' : 'Merged'} category specification schema (${normalizedSchema.length} seed groups)`,
      null,
    );
    await category.save();
    updated += 1;
    seedGroupsCount += normalizedSchema.length;
    seedFieldsCount += normalizedSchema.reduce((total, group) => total + group.fields.length, 0);
  }

  console.log(
    `[category spec schema seed] updated ${updated} of ${targets.length} categories; ` +
    `${seedGroupsCount} groups and ${seedFieldsCount} fields ${replaceExisting ? 'replaced' : 'merged'}`,
  );
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[category spec schema seed] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
