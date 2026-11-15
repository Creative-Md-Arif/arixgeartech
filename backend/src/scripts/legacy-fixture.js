/* Phase 2 QA — inserts a LEGACY fitness-era catalog fixture (v1 shape:
   flat string categories, no brands, no SKUs, no tree refs, no warranty
   block) so migrate-catalog-v2.js can be tested end-to-end.
   Usage: node legacy_fixture.js <mongo-uri> <db-name>            */
const mongoose = require('mongoose');
require('dotenv').config();

/* audit fix — requires used absolute paths from the OLD repo layout (always
   module-not-found here), and the default DB was the legacy 'forged'. */
const uri = process.argv[2] || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/arixgear';
const Product = require('../models/Product');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

(async () => {
  await mongoose.connect(uri);
  await Promise.all([
    Product.deleteMany({}), Category.deleteMany({}), Brand.deleteMany({}),
    mongoose.connection.collection('products_backup_pre_v2').deleteMany({}),
    mongoose.connection.collection('categories_backup_pre_v2').deleteMany({}),
  ]);

  await Category.insertMany([
    { name: 'Apparel', slug: 'apparel', path: [] },
    { name: 'Equipment', slug: 'equipment', path: [] },
    { name: 'Accessories', slug: 'accessories', path: [] },
    { name: 'Gear (legacy parent)', slug: 'gear', path: [] },
  ]);

  const S = (k, v) => ({ k, v });
  await Product.insertMany([
    { slug: 'tee', name: 'Apex Compression Tee', category: 'apparel', price: 4490, stock: 16,
      images: [{ url: '/assets/x.png' }], sizes: ['S', 'M', 'L'], sizeStocks: [{ s: 'S', stock: 3 }],
      specs: [S('Fabric', 'nylon'), S('Warranty', '6 months')] },
    { slug: 'shorts', name: 'Gripshort Pro', category: 'apparel', price: 3990, stock: 15,
      images: [{ url: '/assets/x.png' }], sizes: ['M', 'L'] },
    { slug: 'belt', name: 'Vulcan Lifting Belt', category: 'equipment', price: 8490, stock: 12,
      images: [{ url: '/assets/x.png' }], sizes: ['S', 'M'], specs: [S('Leather', 'veg-tan'), S('Warranty', '2 years')] },
    { slug: 'knee', name: 'Knee Sleeves 7MM', category: 'equipment', price: 5190, stock: 14,
      images: [{ url: '/assets/x.png' }], sizes: ['M', 'L'] },
    { slug: 'dumbbell', name: 'Hex Dumbbell 20KG', category: 'equipment', price: 12490, stock: 12,
      images: [{ url: '/assets/x.png' }], sizes: ['20KG'], sizePrices: [{ s: '20KG', price: 12490 }],
      specs: [S('Warranty', 'Lifetime on handle weld')] },
    { slug: 'shaker', name: 'Steel Core Shaker', category: 'accessories', price: 1990, stock: 40,
      images: [{ url: '/assets/x.png' }] },
    { slug: 'gloves', name: 'Griplock Gloves', category: 'accessories', price: 3290, stock: 13,
      images: [{ url: '/assets/x.png' }], sizes: ['M', 'L'], specs: [S('Warranty', '24 months')] },
    { slug: 'whey', name: 'Isolate Whey 2KG', category: 'supplements', price: 6490, stock: 15,
      images: [{ url: '/assets/x.png' }], sizes: ['2KG'] },
  ]);
  console.log('[fixture] legacy catalog ready:', await Product.countDocuments({}), 'products,', await Category.countDocuments({}), 'categories');
  await mongoose.disconnect();
})().catch((e) => { console.error('[fixture] FAILED:', e.message); process.exit(1); });
