const test = require('node:test');
const assert = require('node:assert/strict');

const importer = require('../src/services/ai/importer');
const { extract, extractPrice, guessBrand, guessCategory, resolveImportDetection, templateRewrite, validateCatalogGuess } = importer;
const provider = require('../src/services/ai/provider');
const Category = require('../src/models/Category');
const Brand = require('../src/models/Brand');
const AiImport = require('../src/models/AiImport');
const AiSetting = require('../src/models/AiSetting');

test('category detection chooses the deepest matching catalog category', () => {
  const categories = [
    { slug: 'laptops-desktops', name: 'Laptops & Desktops', path: ['laptops-desktops'] },
    { slug: 'gaming-laptops', name: 'Gaming Laptops', path: ['laptops-desktops', 'gaming-laptops'] },
    { slug: 'monitors', name: 'Monitors', path: ['pc-components-monitors', 'monitors'] },
  ];

  const result = guessCategory({
    name: 'ASUS TUF Gaming Laptop RTX 4060',
    shortDesc: '16GB memory and 1TB SSD',
    specs: [],
    features: [],
  }, categories);

  assert.equal(result.slug, 'gaming-laptops');
  assert.ok(result.confidence > 0);
});

test('price extraction ignores EMI and prefers the current selling price', () => {
  assert.equal(extractPrice('Special Price Tk 4,650 Regular Price Tk 5,050 EMI Tk 421/month'), 4650);
});

test('HTML extraction keeps product id and multiline feature rows', () => {
  const item = extract(
    '<title>JBL GO 4</title><div>Product Id: 10.731.31.331</div>' +
    '<table><tr><td>Others</td><td>USB Type-C<br>Bluetooth 5.3<br>IP67</td></tr></table>',
    'https://example.com/product',
  );
  assert.equal(item.sku, '10.731.31.331');
  assert.deepEqual(item.features, ['USB Type-C', 'Bluetooth 5.3', 'IP67']);
});

test('category detection never invents a slug when the catalog has no match', () => {
  const result = guessCategory({
    name: 'Apple iPhone 17 Pro',
    categoryGuess: 'Made Up Category',
    specs: [],
    features: [],
  }, [{ slug: 'gaming-laptops', name: 'Gaming Laptops', path: ['laptops-desktops', 'gaming-laptops'] }]);

  assert.deepEqual(result, { slug: '', confidence: 0 });
});

test('brand detection only returns brands already present in the catalog', () => {
  const brands = [{ _id: 'brand-id', slug: 'asus', name: 'ASUS' }];

  assert.equal(guessBrand({ name: 'ASUS TUF Gaming Laptop' }, brands).slug, 'asus');
  assert.deepEqual(guessBrand({ name: 'Unknown Maker Phone' }, brands), {
    slug: '',
    id: null,
    confidence: 0,
  });
});

test('AI catalog guesses require an existing slug and minimum confidence', () => {
  const catalog = [{ slug: 'gaming-laptops' }];

  assert.deepEqual(validateCatalogGuess('gaming-laptops', 0.8, catalog), {
    slug: 'gaming-laptops',
    confidence: 0.8,
  });
  assert.deepEqual(validateCatalogGuess('invented-category', 0.99, catalog), {
    slug: '',
    confidence: 0,
  });
  assert.deepEqual(validateCatalogGuess('gaming-laptops', 0.59, catalog), {
    slug: '',
    confidence: 0,
  });
});

test('spec extraction reads JSON-LD properties, tables, definition lists, spec cards, and lists', () => {
  const html = `
    <script type="application/ld+json">
      {"@type":"Product","name":"Sample headset","brand":{"@type":"Brand","name":"Acme Audio"},
       "category":"Headphones","additionalProperty":[{"@type":"PropertyValue","name":"Bluetooth","value":"5.3"}]}
    </script>
    <table class="woocommerce-product-attributes">
      <tr><th>Driver size</th><td><span>40 mm</span></td></tr>
    </table>
    <dl><dt>Connector</dt><dd><span>USB-C</span></dd></dl>
    <div class="spec-row"><strong>Battery life</strong><span>30 hours</span></div>
    <ul class="spec-list"><li><strong>Noise control:</strong> Adaptive ANC</li></ul>
  `;
  const result = extract(html, 'https://store.example/products/headset');

  assert.equal(result.brandGuess, 'Acme Audio');
  assert.equal(result.categoryGuess, 'Headphones');
  assert.deepEqual(result.specs, [
    { k: 'Bluetooth', v: '5.3' },
    { k: 'Driver size', v: '40 mm' },
    { k: 'Connector', v: 'USB-C' },
    { k: 'Battery life', v: '30 hours' },
    { k: 'Noise control', v: 'Adaptive ANC' },
  ]);
  assert.deepEqual(templateRewrite(result).specs, result.specs);
});

test('spec extraction reads nested product JSON and does not invent missing fields', () => {
  const html = `
    <script id="__NEXT_DATA__" type="application/json">
      {"props":{"pageProps":{"product":{"technicalSpecifications":{
        "Memory":"16 GB","Display":{"value":"15.6","unit":"inch"}
      }}}}}
    </script>
  `;
  const result = extract(html, 'https://store.example/item');

  assert.deepEqual(result.specs, [
    { k: 'Memory', v: '16 GB' },
    { k: 'Display', v: '15.6 inch' },
  ]);

  const empty = extract('<html><body><p>Sign in</p></body></html>', 'https://store.example/item');
  const template = templateRewrite(empty);
  assert.equal(empty.name, '');
  assert.deepEqual(empty.specs, []);
  assert.equal(template.name, '');
  assert.equal(template.shortDesc, '');
  assert.equal(template.description, '');
  assert.equal(template.seo.metaTitle, '');
});

test('unlisted source brand and category are preserved for review instead of discarded', () => {
  const resolved = resolveImportDetection({
    categoryGuess: 'Portable Audio',
    brandGuess: 'Acme Audio',
  }, { slug: '', confidence: 0 }, { slug: '', confidence: 0 });

  assert.equal(resolved.categorySlug, 'portable-audio');
  assert.equal(resolved.categorySource, 'source');
  assert.equal(resolved.brandSlug, 'acme-audio');
  assert.equal(resolved.brandSource, 'source');
  assert.equal(resolved.categoryConfidence, 0);
  assert.equal(resolved.brandConfidence, 0);
});

test('review approval can create source-only categories and brands with readable names', async () => {
  const originalCategoryFind = Category.findOne;
  const originalCategoryCreate = Category.create;
  const originalBrandFind = Brand.findOne;
  const originalBrandCreate = Brand.create;
  const createdCategories = [];
  const createdBrands = [];
  Category.findOne = async () => null;
  Category.create = async (input) => {
    createdCategories.push(input);
    return { _id: 'category-id', slug: input.slug, path: input.path };
  };
  Brand.findOne = async () => null;
  Brand.create = async (input) => {
    createdBrands.push(input);
    return { _id: 'brand-id' };
  };

  try {
    const detected = resolveImportDetection({
      categoryGuess: 'কম্পিউটার যন্ত্রাংশ',
      brandGuess: 'অ্যাকমে টেক',
    }, { slug: '', confidence: 0 }, { slug: '', confidence: 0 });
    const category = await importer.ensureImportCategory(detected.categorySlug, 'কম্পিউটার যন্ত্রাংশ');
    const brand = await importer.ensureImportBrand(detected.brandSlug, 'অ্যাকমে টেক');

    assert.match(detected.categorySlug, /^category-[a-f0-9]{8}$/);
    assert.match(detected.brandSlug, /^brand-[a-f0-9]{8}$/);
    assert.equal(category.categoryPath[0], detected.categorySlug);
    assert.equal(brand, 'brand-id');
    assert.equal(createdCategories[0].name, 'কম্পিউটার যন্ত্রাংশ');
    assert.equal(createdBrands[0].name, 'অ্যাকমে টেক');
  } finally {
    Category.findOne = originalCategoryFind;
    Category.create = originalCategoryCreate;
    Brand.findOne = originalBrandFind;
    Brand.create = originalBrandCreate;
  }
});

test('manual category creation preserves its selected parent hierarchy', async () => {
  const originalFind = Category.findOne;
  const originalCreate = Category.create;
  const parent = { _id: 'audio-id', slug: 'audio', path: ['electronics', 'audio'] };
  let created;
  Category.findOne = async ({ slug }) => slug === 'audio' ? parent : null;
  Category.create = async (input) => {
    created = input;
    return { _id: 'headsets-id', slug: input.slug, path: input.path };
  };

  try {
    const result = await importer.ensureImportCategory(
      'wireless-headsets',
      'Wireless Headsets',
      'audio',
    );
    assert.equal(created.name, 'Wireless Headsets');
    assert.equal(created.parent, parent._id);
    assert.deepEqual(created.path, ['electronics', 'audio', 'wireless-headsets']);
    assert.deepEqual(result.categoryPath, created.path);
  } finally {
    Category.findOne = originalFind;
    Category.create = originalCreate;
  }
});

test('approval refuses to invent a product name when extraction found none', async () => {
  const originalFindById = AiImport.findById;
  AiImport.findById = async () => ({
    status: 'ready',
    aiContent: { name: '' },
    extracted: { name: '' },
  });
  try {
    await assert.rejects(importer.approveImport('import-id', {}, null), {
      status: 400,
      message: 'Product name was not extracted — enter a product name before approval',
    });
  } finally {
    AiImport.findById = originalFindById;
  }
});

test('approval requires a category instead of silently assigning accessories', async () => {
  const originalFindById = AiImport.findById;
  const originalGetSettings = AiSetting.get;
  AiImport.findById = async () => ({
    status: 'ready',
    aiContent: { name: 'Test product' },
    extracted: { name: 'Test product' },
    price: 1000,
  });
  AiSetting.get = async () => ({ import: { defaultCategory: '' } });
  try {
    await assert.rejects(importer.approveImport('import-id', {}, null), {
      status: 400,
      message: 'Choose a category before approving this import',
    });
  } finally {
    AiImport.findById = originalFindById;
    AiSetting.get = originalGetSettings;
  }
});

test('manual category approval rejects an empty category name', async () => {
  const originalFindById = AiImport.findById;
  const originalGetSettings = AiSetting.get;
  AiImport.findById = async () => ({
    status: 'ready',
    aiContent: { name: 'Test product' },
    extracted: { name: 'Test product' },
    price: 1000,
  });
  AiSetting.get = async () => ({ import: { defaultCategory: 'accessories' } });
  try {
    await assert.rejects(importer.approveImport('import-id', {
      category: '',
      categoryManual: true,
    }, null), {
      status: 400,
      message: 'Enter a category name before approving this import',
    });
  } finally {
    AiImport.findById = originalFindById;
    AiSetting.get = originalGetSettings;
  }
});

test('AI rewrite supplies a valid JSON example and requires a product name', async () => {
  const originalComplete = provider.complete;
  let request;
  provider.complete = async (input) => {
    request = input;
    return {
      text: '{"name":"Test laptop","specs":[{"k":"RAM","v":"64 GB"}]}',
      provider: 'gemini',
      model: 'gemini-3.7-flash',
    };
  };

  try {
    const result = await importer.aiRewrite({
      name: 'Test laptop',
      specs: [{ k: 'RAM', v: '16 GB' }],
      features: [],
    });

    assert.match(request.system, /\{"name":"\.\.\."/);
    assert.equal(request.responseSchema.required.includes('name'), true);
    assert.equal(request.responseSchema.properties.name.type, 'STRING');
    assert.equal(result.content.name, 'Test laptop');
    assert.deepEqual(result.content.specs, [{ k: 'RAM', v: '16 GB' }]);
  } finally {
    provider.complete = originalComplete;
  }
});
