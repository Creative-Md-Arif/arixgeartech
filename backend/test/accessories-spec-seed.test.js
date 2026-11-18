const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES } = require('../src/seed/techData');
const { COMMON_SPEC_GROUPS, CATEGORY_SPEC_GROUPS } = require('../src/seed/accessoriesSpecSchema');
const specsUtil = require('../src/utils/specs');

test('accessories subcategories have bilingual, category-specific specification seeds', () => {
  const requiredSlugs = [
    'mobile-accessories',
    'computer-accessories',
    'audio',
    'gaming',
    'cables-adapters-hubs',
    'storage-memory',
    'smart-gadgets',
  ];
  const categorySlugs = new Set(CATEGORIES.map((category) => category.slug));

  for (const slug of requiredSlugs) {
    assert.ok(categorySlugs.has(slug), `${slug} is present in the category seed`);
    assert.ok(CATEGORY_SPEC_GROUPS[slug], `${slug} has a specific spec schema`);

    const schema = specsUtil.normalizeSpecGroups([
      ...COMMON_SPEC_GROUPS,
      ...CATEGORY_SPEC_GROUPS[slug],
    ]);
    assert.ok(schema.length > COMMON_SPEC_GROUPS.length);
    for (const group of schema) {
      assert.ok(group.label);
      assert.ok(group.labelBn);
      assert.ok(group.fields.length > 0);
      for (const field of group.fields) {
        assert.ok(field.label);
        assert.ok(field.labelBn);
      }
    }
  }
});

test('legacy keyboard, mouse, controller, and headset categories retain schema seeds', () => {
  for (const slug of ['keyboards', 'mice', 'controllers', 'gaming-headsets']) {
    assert.ok(CATEGORY_SPEC_GROUPS[slug], `${slug} retains a category-specific schema`);
  }
});
