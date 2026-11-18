const test = require('node:test');
const assert = require('node:assert/strict');
const { upsertSeedCategory } = require('../src/utils/seedCategory');

const seededCategory = {
  slug: 'components',
  name: 'PC Components & Monitors',
  nameBn: 'পিসি কম্পোনেন্ট ও মনিটর',
  parent: null,
  order: 2,
};

test('category seed reuses an exact-name record with a legacy slug', async () => {
  const legacy = {
    _id: 'category-id',
    slug: 'pc-components-monitors',
    name: seededCategory.name,
    async save() {},
  };
  const migrations = new Map();
  const Category = {
    async findOne(query) {
      return query.slug ? null : legacy;
    },
    async findOneAndUpdate() {
      assert.fail('an exact-name legacy category must not be inserted again');
    },
  };

  const result = await upsertSeedCategory(Category, seededCategory, null, migrations);

  assert.equal(result, legacy);
  assert.equal(legacy.slug, 'components');
  assert.equal(legacy.nameBn, seededCategory.nameBn);
  assert.equal(legacy.order, seededCategory.order);
  assert.equal(migrations.get('components'), 'pc-components-monitors');
});

test('category seed reports when slug and name match different existing records', async () => {
  const Category = {
    async findOne(query) {
      return query.slug ? { _id: 'slug-record' } : { _id: 'name-record' };
    },
  };

  await assert.rejects(
    upsertSeedCategory(Category, seededCategory, null, new Map()),
    /slug "components" and name belong to different category records/,
  );
});
