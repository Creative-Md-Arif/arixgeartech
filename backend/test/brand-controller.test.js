const test = require('node:test');
const assert = require('node:assert/strict');
const Brand = require('../src/models/Brand');
const Product = require('../src/models/Product');
const storage = require('../src/services/storageService');
const cache = require('../src/services/cache');
const brands = require('../src/controllers/brandController');

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test('public brand directory returns live counts and persisted description fields', async () => {
  const row = { _id: 'brand-id', slug: 'asus', name: 'ASUS', description: 'Computers', descriptionBn: 'কম্পিউটার', active: true };
  const restoreFind = replace(Brand, 'find', () => ({ sort() { return this; }, lean: async () => [row] }));
  const restoreAggregate = replace(Product, 'aggregate', async () => [{ _id: 'brand-id', n: 4 }]);
  const restoreCache = replace(cache, 'set', () => {});
  try {
    const res = response();
    await brands.list({ query: {} }, res, assert.fail);
    assert.equal(res.body.items[0].products, 4);
    assert.equal(res.body.items[0].description, 'Computers');
    assert.equal(res.body.items[0].descriptionBn, 'কম্পিউটার');
  } finally { restoreFind(); restoreAggregate(); restoreCache(); }
});

test('create supports Bengali brand names and preserves the submitted slug contract', async () => {
  let created;
  const restoreFind = replace(Brand, 'findOne', async () => null);
  const restoreCreate = replace(Brand, 'create', async (doc) => { created = doc; return { _id: 'new-brand', ...doc }; });
  const restoreBump = replace(cache, 'bump', () => {});
  const restoreSave = replace(storage, 'saveImage', async () => ({ url: '/uploads/logo.png' }));
  try {
    const res = response();
    await brands.create({ body: { name: 'বাংলা ব্র্যান্ড', nameBn: 'বাংলা ব্র্যান্ড' } }, res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(created.slug, 'বাংলা-ব্র্যান্ড');
    assert.equal(res.body.brand.nameBn, 'বাংলা ব্র্যান্ড');
  } finally { restoreFind(); restoreCreate(); restoreBump(); restoreSave(); }
});

test('brand create rejects case-insensitive duplicate names', async () => {
  const restoreFind = replace(Brand, 'findOne', async () => ({ name: 'ASUS' }));
  try {
    const res = response();
    await brands.create({ body: { name: 'asus' } }, res, assert.fail);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /already exists/);
  } finally { restoreFind(); }
});

test('brand removal detaches product refs before deleting the brand', async () => {
  const sequence = [];
  const doc = { _id: 'brand-id', async deleteOne() { sequence.push('delete-brand'); } };
  const restoreFind = replace(Brand, 'findById', async () => doc);
  const restoreUpdate = replace(Product, 'updateMany', async (filter, update) => {
    sequence.push('detach-products');
    assert.deepEqual(filter, { brand: 'brand-id' });
    assert.deepEqual(update, { $set: { brand: null } });
  });
  const restoreBump = replace(cache, 'bump', () => {});
  try {
    const res = response();
    await brands.remove({ params: { id: 'brand-id' } }, res, assert.fail);
    assert.deepEqual(sequence, ['detach-products', 'delete-brand']);
    assert.equal(res.body.detached, true);
  } finally { restoreFind(); restoreUpdate(); restoreBump(); }
});
