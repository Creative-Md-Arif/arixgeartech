const test = require('node:test');
const assert = require('node:assert/strict');
const Product = require('../src/models/Product');
const ComboBundle = require('../src/models/ComboBundle');
const bundleController = require('../src/controllers/bundleController');
const orderController = require('../src/controllers/orderController');

function replace(object, key, value) {
  const original = object[key];
  object[key] = value;
  return () => { object[key] = original; };
}

function productQuery(rows) {
  return {
    select() { return this; },
    lean: async () => rows,
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); },
  };
}

const catalogProducts = [
  { _id: '507f1f77bcf86cd799439011', name: 'Keyboard', nameBn: 'কিবোর্ড', slug: 'keyboard', price: 100, stock: 8, active: true, images: [{ url: '/keyboard.png' }] },
  { _id: '507f1f77bcf86cd799439012', name: 'Mouse', nameBn: 'মাউস', slug: 'mouse', price: 300, stock: 3, active: true, images: [{ url: '/mouse.png' }] },
];

test('bundle admin validation preserves component quantities and rounds bundle prices before deal checks', async () => {
  const restoreFind = replace(Product, 'find', () => ({ select: async () => catalogProducts }));
  try {
    const { doc, errors, componentsTotal } = await bundleController._buildDoc({
      title: 'Keyboard and mouse',
      bundlePrice: '400.004',
      items: [{ slug: 'keyboard', qty: 2 }, { slug: 'mouse', qty: 1 }],
      active: 'false',
    });
    assert.deepEqual(errors, []);
    assert.equal(componentsTotal, 500);
    assert.equal(doc.bundlePrice, 400);
    assert.deepEqual(doc.items.map((item) => item.qty), [2, 1]);
    assert.equal(doc.active, false);

    const roundedToTotal = await bundleController._buildDoc({
      title: 'Rounded price',
      bundlePrice: 499.999,
      items: [{ slug: 'keyboard', qty: 2 }, { slug: 'mouse', qty: 1 }],
    });
    assert.match(roundedToTotal.errors.join(' '), /must be BELOW/);
  } finally {
    restoreFind();
  }
});

test('bundle validation rejects duplicate components, fractional quantities, invalid dates, and malformed booleans', async () => {
  const restoreFind = replace(Product, 'find', () => ({ select: async () => catalogProducts }));
  try {
    const { errors } = await bundleController._buildDoc({
      title: 'Invalid bundle',
      bundlePrice: 50,
      active: 'no',
      sortOrder: -1,
      window: { startsAt: 'not-a-date' },
      items: [{ slug: 'keyboard', qty: 1.5 }, { slug: 'keyboard', qty: 1 }],
    });
    assert.match(errors.join(' '), /distinct product slugs/);
    assert.match(errors.join(' '), /whole number from 1 to 10/);
    assert.match(errors.join(' '), /valid date/);
    assert.match(errors.join(' '), /active must be a boolean/);
    assert.match(errors.join(' '), /sortOrder must be a whole number/);
  } finally {
    restoreFind();
  }
});

test('admin can update or deactivate a bundle while preserving an unchanged inactive component snapshot', async () => {
  const restoreFind = replace(Product, 'find', () => ({ select: async () => [catalogProducts[1]] }));
  try {
    const existing = {
      items: [
        { product: catalogProducts[0]._id, slug: 'keyboard', name: 'Keyboard', price: 100, qty: 2 },
        { product: catalogProducts[1]._id, slug: 'mouse', name: 'Mouse', price: 300, qty: 1 },
      ],
    };
    const { doc, errors } = await bundleController._buildDoc({
      title: 'Updated bundle',
      slug: 'keyboard-mouse',
      bundlePrice: 400,
      active: false,
      items: [{ slug: 'keyboard', qty: 2 }, { slug: 'mouse', qty: 1 }],
    }, existing);
    assert.deepEqual(errors, []);
    assert.equal(doc.active, false);
    assert.equal(doc.items[0].name, 'Keyboard');
    assert.equal(doc.items[0].price, 100);
  } finally {
    restoreFind();
  }
});

test('bundle API refreshes compare totals and requires stock for every component quantity', async () => {
  const restoreFind = replace(Product, 'find', () => productQuery(catalogProducts));
  try {
    const bundle = {
      items: [{ slug: 'keyboard', qty: 2 }, { slug: 'mouse', qty: 1 }],
      publicView: () => ({
        bundlePrice: 400,
        componentsTotal: 1,
        savePct: 0,
        live: true,
        items: [],
      }),
    };
    const [view] = await bundleController._bundlePipeline([bundle]);
    assert.equal(view.componentsTotal, 500);
    assert.equal(view.savePct, 20);
    assert.equal(view.orderable, true);

    const shortStock = { ...catalogProducts[0], stock: 1 };
    const restoreShort = replace(Product, 'find', () => productQuery([shortStock, catalogProducts[1]]));
    const [unavailable] = await bundleController._bundlePipeline([bundle]);
    assert.equal(unavailable.orderable, false);
    restoreShort();
  } finally {
    restoreFind();
  }
});

test('bundle order expansion allocates the exact bundle total across configured component quantities', async () => {
  const bundle = {
    slug: 'keyboard-mouse',
    title: 'Keyboard and mouse',
    bundlePrice: 400,
    items: [
      { qty: 2, product: { ...catalogProducts[0], _id: catalogProducts[0]._id } },
      { qty: 1, product: { ...catalogProducts[1], _id: catalogProducts[1]._id } },
    ],
    isLive: () => true,
    componentsTotal: ComboBundle.prototype.componentsTotal,
    allocate: ComboBundle.prototype.allocate,
  };
  const restoreFindOne = replace(ComboBundle, 'findOne', () => ({ populate: async () => bundle }));
  try {
    const result = await orderController._expandBundle({ bundle: 'keyboard-mouse', qty: 1 });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.items.map((item) => item.qty), [2, 1]);
    assert.deepEqual(result.items.map((item) => item.lineTotal), [160, 240]);
    assert.equal(result.items.reduce((sum, item) => sum + item.lineTotal, 0), bundle.bundlePrice);
    assert.equal(result.save, 100);

    const insufficient = { ...bundle, items: [{ ...bundle.items[0], product: { ...bundle.items[0].product, stock: 1 } }, bundle.items[1]] };
    const restoreShort = replace(ComboBundle, 'findOne', () => ({ populate: async () => insufficient }));
    const rejected = await orderController._expandBundle({ bundle: 'keyboard-mouse', qty: 1 });
    assert.equal(rejected.error[0], 409);
    assert.match(rejected.error[1], /Not enough stock/);
    restoreShort();

    const noLongerDeal = {
      ...bundle,
      items: [
        { ...bundle.items[0], product: { ...bundle.items[0].product, price: 50 } },
        { ...bundle.items[1], product: { ...bundle.items[1].product, price: 300 } },
      ],
    };
    const restorePrice = replace(ComboBundle, 'findOne', () => ({ populate: async () => noLongerDeal }));
    const stalePrice = await orderController._expandBundle({ bundle: 'keyboard-mouse', qty: 1 });
    assert.equal(stalePrice.error[0], 409);
    assert.match(stalePrice.error[1], /no longer priced below/);
    restorePrice();
  } finally {
    restoreFindOne();
  }
});

test('bundle allocation uses largest-remainder cents and always sums to bundle price', () => {
  const value = {
    items: [
      { price: 1, qty: 1 },
      { price: 1, qty: 1 },
      { price: 1, qty: 1 },
    ],
    bundlePrice: 1,
    componentsTotal: ComboBundle.prototype.componentsTotal,
  };
  const allocation = ComboBundle.prototype.allocate.call(value);
  assert.deepEqual(allocation.map((line) => line.unit), [0.34, 0.33, 0.33]);
  assert.equal(allocation.reduce((sum, line) => sum + line.unit, 0), 1);

  const fractional = {
    items: [{ price: 0.333, qty: 1 }, { price: 0.333, qty: 1 }, { price: 0.334, qty: 1 }],
    bundlePrice: 0.5,
  };
  const fractionalAllocation = ComboBundle.prototype.allocate.call(fractional);
  assert.deepEqual(fractionalAllocation.map((line) => line.unit), [0.17, 0.16, 0.17]);
  assert.equal(fractionalAllocation.reduce((sum, line) => sum + line.unit, 0), 0.5);
});
