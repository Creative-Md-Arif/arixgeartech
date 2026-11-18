const test = require('node:test');
const assert = require('node:assert/strict');
const { CATEGORIES, PRODUCTS } = require('../src/seed/techData');

test('category seed defines the requested bilingual parent categories and a valid tree', () => {
  const bySlug = new Map(CATEGORIES.map((category) => [category.slug, category]));
  assert.equal(bySlug.size, CATEGORIES.length, 'category slugs are unique');
  assert.equal(
    new Set(CATEGORIES.map((category) => category.name.trim().toLowerCase())).size,
    CATEGORIES.length,
    'category names are globally unique for databases with a unique name index',
  );
  const parents = [
    ['accessories', 'Accessories & Gadgets', 'এক্সেসরিজ ও গ্যাজেট'],
    ['components', 'PC Components & Monitors', 'পিসি কম্পোনেন্ট ও মনিটর'],
    ['phones', 'Phones & Tablets', 'ফোন ও ট্যাবলেট'],
    ['networking', 'Networking & Security', 'নেটওয়ার্কিং ও সিকিউরিটি'],
    ['appliances', 'Home Appliances', 'হোম অ্যাপ্লায়েন্স'],
    ['kitchen-appliances', 'Kitchen Appliances', 'কিচেন অ্যাপ্লায়েন্স'],
    ['lifestyle', 'LifeStyle', 'লাইফস্টাইল'],
    ['health-beauty', 'Health & Beauty', 'স্বাস্থ্য ও সৌন্দর্য'],
    ['power', 'Power & UPS', 'পাওয়ার ও ইউপিএস'],
    ['laptops', 'Laptops & Desktops', 'ল্যাপটপ ও ডেস্কটপ'],
  ];

  for (const [slug, name, nameBn] of parents) {
    const category = bySlug.get(slug);
    assert.ok(category, `parent "${slug}" is seeded`);
    assert.equal(category.name, name);
    assert.equal(category.nameBn, nameBn);
    assert.equal(category.parent, null);
  }

  assert.deepEqual(
    CATEGORIES.filter((category) => category.parent === 'accessories').map((category) => category.slug),
    [
      'mobile-accessories',
      'computer-accessories',
      'audio',
      'gaming',
      'cables-adapters-hubs',
      'storage-memory',
      'smart-gadgets',
    ],
  );

  for (const category of CATEGORIES) {
    if (category.parent) {
      assert.ok(bySlug.has(category.parent), `${category.slug} has a seeded parent`);
      assert.ok(
        CATEGORIES.indexOf(bySlug.get(category.parent)) < CATEGORIES.indexOf(category),
        `${category.parent} appears before ${category.slug}`,
      );
    }
  }
  const childrenByParent = new Map();
  for (const category of CATEGORIES) {
    if (!category.parent) continue;
    childrenByParent.set(category.parent, [
      ...(childrenByParent.get(category.parent) || []),
      category,
    ]);
  }
  const depthOf = (category) => category.parent
    ? depthOf(bySlug.get(category.parent)) + 1
    : 1;
  const roots = CATEGORIES.filter((category) => category.parent === null);
  assert.equal(roots.length, parents.length);
  for (const root of roots) {
    const rootChildren = childrenByParent.get(root.slug) || [];
    assert.ok(rootChildren.length, `${root.slug} has subcategories`);
    assert.ok(
      rootChildren.some((category) => (childrenByParent.get(category.slug) || []).length > 0),
      `${root.slug} taxonomy includes third-level subcategories`,
    );
  }
  assert.ok(CATEGORIES.every((category) => depthOf(category) <= 3), 'category depth stays within three levels');
  for (const product of PRODUCTS) {
    assert.ok(bySlug.has(product.category), `${product.slug} category "${product.category}" is seeded`);
  }
});

test('legacy product category slugs remain children of the new parents', () => {
  const bySlug = new Map(CATEGORIES.map((category) => [category.slug, category]));
  assert.equal(bySlug.get('desktops').parent, 'laptops');
  assert.equal(bySlug.get('tablets').parent, 'phones');
  assert.equal(bySlug.get('monitors').parent, 'components');
  assert.equal(bySlug.get('gaming').parent, 'accessories');
  assert.equal(bySlug.get('security').parent, 'networking');
});
