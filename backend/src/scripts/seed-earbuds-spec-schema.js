const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/Category');
const specsUtil = require('../utils/specs');
const { mergeSeedSpecSchema } = require('../utils/mergeSeedSpecSchema');
const { auditSchemaMutation } = require('../services/specAudit');
const earbudsSpecGroups = require('../seed/earbudsSpecSchema');

const replaceExisting = process.argv.includes('--replace');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  const categories = await Category.find().select('name slug parent specGroups schemaVersion schemaAudit');
  const target = categories.find((category) => category.slug === 'earbuds')
    || categories.find((category) => String(category.name || '').trim().toLowerCase() === 'earbuds')
    || categories.find((category) => category.slug === 'audio');
  if (!target) {
    throw new Error('Earbuds category not found; expected slug/name "earbuds" or the catalog legacy slug "audio"');
  }

  const childrenByParent = new Map();
  for (const category of categories) {
    if (!category.parent) continue;
    const parentId = String(category.parent);
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(category);
  }

  const targets = [];
  const pending = [target];
  const visited = new Set();
  while (pending.length) {
    const category = pending.shift();
    const id = String(category._id);
    if (visited.has(id)) continue;
    visited.add(id);
    targets.push(category);
    pending.push(...(childrenByParent.get(id) || []));
  }

  const normalizedSchema = specsUtil.normalizeSpecGroups(earbudsSpecGroups);
  const fieldCount = normalizedSchema.reduce((total, group) => total + group.fields.length, 0);
  const updates = targets.map((category) => {
    const existing = specsUtil.normalizeSpecGroups(category.specGroups || []);
    const schema = replaceExisting
      ? normalizedSchema
      : mergeSeedSpecSchema(existing, normalizedSchema);
    return { category, schema, unchanged: JSON.stringify(existing) === JSON.stringify(schema) };
  }).filter((update) => !update.unchanged);

  for (const { category, schema } of updates) {
    category.specGroups = schema;
    await auditSchemaMutation(
      category,
      'seed',
      `${replaceExisting ? 'Replaced' : 'Merged'} earbuds specification schema (${normalizedSchema.length} seed groups, ${fieldCount} seed fields)`,
      null
    );
    await category.save();
  }

  console.log(
    `[earbuds spec schema seed] ${updates.length} of ${targets.length} categories ` +
    `${replaceExisting ? 'replaced' : 'merged'} under "${target.slug}"; ` +
    `${normalizedSchema.length} seed groups and ${fieldCount} seed fields`
  );
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error('[earbuds spec schema seed] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
