const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES } = require('../src/seed/techData');
const { ROOT_SPEC_GROUPS, specGroupsForPath } = require('../src/seed/catalogSpecSchemas');
const specsUtil = require('../src/utils/specs');

test('every seeded category resolves to a bilingual, usable specification schema', () => {
  const bySlug = new Map(CATEGORIES.map((category) => [category.slug, category]));
  const rootSlugs = CATEGORIES.filter((category) => category.parent === null).map((category) => category.slug);
  assert.deepEqual(new Set(Object.keys(ROOT_SPEC_GROUPS)), new Set(rootSlugs));

  const pathFor = (slug) => {
    const category = bySlug.get(slug);
    assert.ok(category, `parent category "${slug}" exists`);
    return category.parent ? [...pathFor(category.parent), slug] : [slug];
  };

  for (const category of CATEGORIES) {
    const schema = specsUtil.normalizeSpecGroups(specGroupsForPath(pathFor(category.slug)));
    assert.ok(schema.length, `${category.slug} has seeded spec groups`);
    for (const group of schema) {
      assert.ok(group.label, `${category.slug} group has an English label`);
      assert.ok(group.labelBn, `${category.slug} group has a Bengali label`);
      assert.ok(group.fields.length, `${category.slug} group has fields`);
      for (const field of group.fields) {
        assert.ok(field.label, `${category.slug}.${group.key} field has an English label`);
        assert.ok(field.labelBn, `${category.slug}.${group.key} field has a Bengali label`);
      }
    }
  }
});
