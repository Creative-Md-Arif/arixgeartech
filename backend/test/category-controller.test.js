const test = require('node:test');
const assert = require('node:assert/strict');
const Category = require('../src/models/Category');
const Product = require('../src/models/Product');
const cache = require('../src/services/cache');
const categories = require('../src/controllers/categoryController');

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}
function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}
function query(rows) {
  return { select() { return this; }, sort() { return this; }, lean: async () => rows };
}

test('create makes a Bengali slug and stores a root path', async () => {
  let created;
  const restoreFindOne = replace(Category, 'findOne', async () => null);
  const restoreCreate = replace(Category, 'create', async (doc) => { created = doc; return { _id: 'category-id', ...doc }; });
  const restoreBump = replace(cache, 'bump', () => {});
  try {
    const res = response();
    await categories.create({ body: { name: 'কম্পিউটার গিয়ার' } }, res, assert.fail);
    assert.equal(res.statusCode, 201);
    assert.equal(created.slug, 'কম্পিউটার-গিয়ার');
    assert.deepEqual(created.path, ['কম্পিউটার-গিয়ার']);
    assert.equal(created.showInNavbar, true);
  } finally { restoreFindOne(); restoreCreate(); restoreBump(); }
});

test('renaming a category updates product slug refs and every nested path', async () => {
  const root = { _id: '507f1f77bcf86cd799439011', parent: null, slug: 'devices', path: ['devices'] };
  const child = { _id: '507f1f77bcf86cd799439012', parent: root._id, slug: 'laptops', path: ['devices', 'laptops'] };
  const grandchild = { _id: '507f1f77bcf86cd799439013', parent: child._id, slug: 'gaming', path: ['devices', 'laptops', 'gaming'] };
  const doc = { ...root, name: 'Devices', async save() {} };
  const productWrites = [];
  const pathWrites = [];
  const restoreById = replace(Category, 'findById', async () => doc);
  const restoreFindOne = replace(Category, 'findOne', async () => null);
  const restoreFind = replace(Category, 'find', () => query([root, child, grandchild]));
  const restoreUpdateOne = replace(Category, 'updateOne', async (filter, update) => pathWrites.push({ filter, update }));
  const restoreProductUpdate = replace(Product, 'updateMany', async (filter, update) => productWrites.push({ filter, update }));
  const restoreBump = replace(cache, 'bump', () => {});
  try {
    const res = response();
    await categories.update({ params: { id: root._id }, body: { slug: 'computer-devices' } }, res, assert.fail);
    assert.equal(res.body.category.slug, 'computer-devices');
    assert.ok(productWrites.some((x) => x.filter.category === 'devices' && x.update.$set.category === 'computer-devices'));
    assert.ok(productWrites.some((x) => x.filter.category === 'gaming' && x.update.$set.categoryPath.join('/') === 'computer-devices/laptops/gaming'));
    assert.ok(pathWrites.some((x) => x.filter._id === child._id && x.update.$set.path.join('/') === 'computer-devices/laptops'));
    assert.ok(pathWrites.some((x) => x.filter._id === grandchild._id && x.update.$set.path.join('/') === 'computer-devices/laptops/gaming'));
  } finally {
    restoreById(); restoreFindOne(); restoreFind(); restoreUpdateOne(); restoreProductUpdate(); restoreBump();
  }
});

test('public category tree includes live branch product counts at every depth', async () => {
  const docs = [
    { _id: 'root', parent: null, slug: 'devices', name: 'Devices', showInNavbar: false },
    { _id: 'child', parent: 'root', slug: 'laptops', name: 'Laptops' },
    { _id: 'grandchild', parent: 'child', slug: 'gaming', name: 'Gaming' },
  ];
  const restoreFind = replace(Category, 'find', () => query(docs));
  const restoreAggregate = replace(Product, 'aggregate', async () => [
    { _id: 'devices', n: 9 }, { _id: 'laptops', n: 6 }, { _id: 'gaming', n: 3 },
  ]);
  try {
    const res = response();
    await categories.tree({}, res, assert.fail);
    assert.equal(res.body.items[0].productCount, 9);
    assert.equal(res.body.items[0].showInNavbar, false);
    assert.equal(res.body.items[0].children[0].productCount, 6);
    assert.equal(res.body.items[0].children[0].children[0].productCount, 3);
  } finally { restoreFind(); restoreAggregate(); }
});

test('public flat category list counts legacy products without categoryPath', async () => {
  const router = require('../src/routes/categoryRoutes');
  const handler = router.stack.find((layer) => layer.route && layer.route.path === '/').route.stack[0].handle;
  const restoreFind = replace(Category, 'find', () => query([{ _id: 'category-id', slug: 'devices', name: 'Devices' }]));
  const restoreAggregate = replace(Product, 'aggregate', async (pipeline) => {
    assert.ok(pipeline[1].$project.paths.$cond);
    return [{ _id: 'devices', n: 4 }];
  });
  const restoreGet = replace(cache, 'get', () => null);
  const restoreSet = replace(cache, 'set', () => {});
  try {
    const res = response();
    await handler({}, res, assert.fail);
    assert.equal(res.body.items[0].productCount, 4);
  } finally { restoreFind(); restoreAggregate(); restoreGet(); restoreSet(); }
});

test('create rejects an invalid parent id and out-of-range order', async () => {
  const restoreFindOne = replace(Category, 'findOne', async () => null);
  try {
    const invalidParent = response();
    await categories.create({
      body: { name: 'New category', parent: 'not-an-object-id' },
    }, invalidParent, assert.fail);
    assert.equal(invalidParent.statusCode, 400);
    assert.match(invalidParent.body.message, /parent category id/i);

    const invalidOrder = response();
    await categories.create({
      body: { name: 'New category', order: '-1' },
    }, invalidOrder, assert.fail);
    assert.equal(invalidOrder.statusCode, 400);
    assert.match(invalidOrder.body.message, /order/i);
  } finally { restoreFindOne(); }
});

test('update and delete reject malformed category ids', async () => {
  const resUpdate = response();
  await categories.update({ params: { id: 'bad-id' }, body: {} }, resUpdate, assert.fail);
  assert.equal(resUpdate.statusCode, 400);

  const resDelete = response();
  await categories.remove({ params: { id: 'bad-id' } }, resDelete, assert.fail);
  assert.equal(resDelete.statusCode, 400);
});

test('update rejects fractional order without persisting the category', async () => {
  let saved = false;
  const category = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Devices',
    slug: 'devices',
    parent: null,
    path: ['devices'],
    toObject() { return { ...this }; },
    async save() { saved = true; },
  };
  const restoreFindById = replace(Category, 'findById', async () => category);
  try {
    const res = response();
    await categories.update({
      params: { id: category._id },
      body: { order: '1.5' },
    }, res, assert.fail);
    assert.equal(res.statusCode, 400);
    assert.equal(saved, false);
  } finally { restoreFindById(); }
});

test('category navbar visibility updates independently of active status', async () => {
  const category = {
    _id: '507f1f77bcf86cd799439011',
    name: 'Devices',
    slug: 'devices',
    parent: null,
    path: ['devices'],
    active: true,
    showInNavbar: true,
    async save() {},
  };
  const restoreFindById = replace(Category, 'findById', async () => category);
  const restoreFind = replace(Category, 'find', () => query([category]));
  const restoreProductUpdate = replace(Product, 'updateMany', async () => ({ modifiedCount: 0 }));
  const restoreBump = replace(cache, 'bump', () => {});
  try {
    const res = response();
    await categories.update({
      params: { id: category._id },
      body: { showInNavbar: 'false' },
    }, res, assert.fail);
    assert.equal(category.showInNavbar, false);
    assert.equal(category.active, true);
    assert.equal(res.body.category.showInNavbar, false);
  } finally {
    restoreFindById();
    restoreFind();
    restoreProductUpdate();
    restoreBump();
  }
});
