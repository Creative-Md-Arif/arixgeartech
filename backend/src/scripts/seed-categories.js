/* Non-destructive category tree seed; unlike `npm run seed`, this keeps other collections. */
const mongoose = require('mongoose');
require('dotenv').config();

const Category = require('../models/Category');
const Product = require('../models/Product');
const categories = require('../seed/techData').CATEGORIES;
const { upsertSeedCategory } = require('../utils/seedCategory');

async function seedCategories() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear');

  const bySlug = new Map();
  const slugMigrations = new Map();
  for (const category of categories) {
    const parent = category.parent ? bySlug.get(category.parent) : null;
    if (category.parent && !parent) {
      throw new Error(`Category "${category.slug}" references unknown parent "${category.parent}"`);
    }

    const doc = await upsertSeedCategory(Category, category, parent, slugMigrations);
    bySlug.set(category.slug, doc);
  }

  const allCategories = await Category.find().select('_id slug parent path').lean();
  const byId = new Map(allCategories.map((category) => [String(category._id), category]));

  const pathFor = (category, ancestry = new Set()) => {
    const id = String(category._id);
    if (ancestry.has(id)) throw new Error(`Category parent cycle found at "${category.slug}"`);
    if (ancestry.size >= 10) throw new Error(`Category "${category.slug}" exceeds the 10-level nesting limit`);
    const nextAncestry = new Set(ancestry);
    nextAncestry.add(id);
    if (!category.parent) return [category.slug];
    const parent = byId.get(String(category.parent));
    if (!parent) throw new Error(`Category "${category.slug}" has a missing parent`);
    return [...pathFor(parent, nextAncestry), category.slug];
  };

  let productsUpdated = 0;
  for (const category of allCategories) {
    const path = pathFor(category);
    if (JSON.stringify(category.path || []) !== JSON.stringify(path)) {
      await Category.updateOne({ _id: category._id }, { $set: { path } });
    }
    const result = await Product.updateMany(
      {
        category: { $in: [category.slug, ...(slugMigrations.has(category.slug) ? [slugMigrations.get(category.slug)] : [])] },
        $or: [
          { category: { $ne: category.slug } },
          { categoryRef: { $ne: category._id } },
          { categoryPath: { $ne: path } },
        ],
      },
      { $set: { category: category.slug, categoryRef: category._id, categoryPath: path } },
    );
    productsUpdated += result.modifiedCount || 0;
  }

  console.log(`[category seed] upserted ${categories.length} categories; refreshed ${productsUpdated} product references and paths`);
  await mongoose.disconnect();
}

seedCategories().catch(async (error) => {
  console.error('[category seed] failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
