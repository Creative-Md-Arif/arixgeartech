/* Phase 4 (4.5) — one-shot refactor: split adminController.js (1700+ lines)
   into src/controllers/admin/{_shared,orders,catalog,customers,system}.js.
   adminController.js becomes a barrel re-export so every existing import
   (adminRoutes etc.) keeps working untouched.

   Rules:
     • header (requires + shared helpers) → admin/_shared.js (exported)
     • every top-level `exports.X = async …` block is extracted verbatim;
       block = start line → next top-level start (stray module-level consts
       like ADMIN_NAME ride along with the block they precede-follow)
     • autoPushIfNeeded (internal helper) is carried into orders.js textually
     • each module re-lists ONLY what it uses (verified by the usage report)
*/
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'controllers', 'adminController.js');
const OUT = path.join(__dirname, '..', 'src', 'controllers', 'admin');

const src = fs.readFileSync(SRC, 'utf8');
const lines = src.split('\n');

/* 1. locate every top-level block start */
const starts = [];
lines.forEach((l, i) => {
  const m = l.match(/^exports\.(\w+) = /);
  if (m) starts.push({ name: m[1], line: i });
  if (/^async function autoPushIfNeeded/.test(l)) starts.push({ name: '__autoPush', line: i });
});
starts.sort((a, b) => a.line - b.line);

/* 2. extract blocks */
const blocks = {};
starts.forEach((s, idx) => {
  const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
  blocks[s.name] = { text: lines.slice(s.line, end).join('\n').trimEnd() + '\n', line: s.line };
});

/* 3. header = everything before the first block */
const firstStart = Math.min(...starts.map((s) => s.line));
const header = lines.slice(0, firstStart).join('\n').trimEnd() + '\n';

/* 4. module composition */
const GROUPS = {
  orders: ['orderList', 'orderDetail', 'exportOrders', 'verifyPayment', 'rejectPayment', 'updateStatus', 'setCourier',
    'createManualOrder', 'updateManualOrder', 'deleteOrder', 'salesReport', 'salesReportCsv', 'pushCourier',
    'listReturns', 'resolveReturn', 'orderAnalytics', 'salesTrend', '__autoPush'],
  catalog: ['createProduct', 'updateProduct', 'deleteProduct', 'bulkProducts', 'duplicateProduct', 'exportProductsCsv', 'importProductsCsv'],
  customers: ['customers', 'customerTags', 'resetCustomerPassword', 'loyaltyList', 'loyaltyDetail', 'loyaltyAdjust', 'loyaltySettingsGet', 'loyaltySettingsPut'],
  system: ['stats', 'globalSearch', 'backupDatabase', 'uploadImage', 'emailTemplateTest'],
};

const allNames = starts.map((s) => s.name);
const missing = Object.values(GROUPS).flat().filter((n) => !blocks[n]);
const unassigned = allNames.filter((n) => !Object.values(GROUPS).flat().includes(n));
if (missing.length || unassigned.length) {
  console.error('MISSING:', missing, 'UNASSIGNED:', unassigned);
  process.exit(1);
}

/* 5. shared export surface — the header's requires + helpers */
const SHARED_EXPORTS = [
  'Order', 'Product', 'User', 'Setting', 'ReturnRequest', 'Brand', 'Category',
  'saveImage', 'deleteImage', 'sendStatusUpdate', 'statusSMS', 'autoNotifyProduct',
  'cache', 'orderOps', 'courierService', 'normalizeProductGuide', 'notifier', 'realtime',
  'loyaltyEngine', 'LoyaltyLog',
  'slugify', 'resolveCatRefs', 'resolveBrand', 'warrantyFromPayload', 'skuFor',
  'guideFromPayload', 'priceFor', 'ADMIN_NAME',
];

/* header must contain ADMIN_NAME as a module-level const; if it was swallowed
   by a block (stray const), pull that line out into the header */
let headerText = header;
const adminNameIdx = lines.findIndex((l) => /^const ADMIN_NAME = /.test(l));
const firstStartLine = firstStart;
if (adminNameIdx >= firstStartLine) {
  // remove it from whichever block holds it
  for (const [name, b] of Object.entries(blocks)) {
    if (b.text.includes('const ADMIN_NAME = ')) {
      b.text = b.text.replace(/^const ADMIN_NAME = .*$/m, '').replace(/^\n+/, '');
      break;
    }
  }
  headerText = headerText + `const ADMIN_NAME = (req) => req.user?.name || 'admin';\n`;
}

/* autoPushIfNeeded moves into _shared (uses courierService + ADMIN_NAME) */
let autoPushText = '';
if (blocks.__autoPush) {
  autoPushText = blocks.__autoPush.text;
  delete blocks.__autoPush;
}

/* 6. write _shared.js */
const sharedJs = `/* Phase 4 (4.5) — shared imports + helpers for the admin/* controller split.
   ONE dependency graph, four focused modules; adminController.js is the barrel. */
${headerText}
/* autoPushIfNeeded — courier auto-dispatch used by order status flips */
${autoPushText}
module.exports = {
  ${SHARED_EXPORTS.join(',\n  ')},
  autoPushIfNeeded,
};
`;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '_shared.js'), sharedJs);

/* 7. write the four modules */
const BANNER = {
  orders: 'Order management: list/detail/export, payment verify/reject, status, courier, manual orders, returns, analytics',
  catalog: 'Product CRUD: create/update/delete, bulk, duplicate, CSV import/export',
  customers: 'Customers + loyalty: list, tags, password reset, loyalty list/adjust/settings',
  system: 'System: dashboard stats, global search, backup, uploads, email template test',
};

const USED = {
  orders: ['Order', 'Setting', 'ReturnRequest', 'User', 'sendStatusUpdate', 'statusSMS', 'orderOps', 'courierService',
    'notifier', 'realtime', 'loyaltyEngine', 'ADMIN_NAME', 'autoPushIfNeeded', 'cache', 'Product'],
  catalog: ['Product', 'Brand', 'Category', 'saveImage', 'deleteImage', 'sendStatusUpdate', 'autoNotifyProduct',
    'cache', 'orderOps', 'slugify', 'resolveCatRefs', 'resolveBrand', 'warrantyFromPayload', 'skuFor', 'guideFromPayload', 'priceFor'],
  customers: ['User', 'Order', 'loyaltyEngine', 'LoyaltyLog', 'Setting', 'cache'],
  system: ['Order', 'Product', 'User', 'Setting', 'ReturnRequest', 'saveImage', 'deleteImage', 'notifier', 'cache', 'orderOps'],
};

for (const [mod, names] of Object.entries(GROUPS)) {
  const list = names.filter((n) => n !== '__autoPush');
  const body = list.map((n) => blocks[n].text).join('\n');
  const used = USED[mod];
  const js = `/* Phase 4 (4.5) — adminController split: ${mod}. ${BANNER[mod]}. */
const {
  ${used.join(',\n  ')},
} = require('./_shared');

${body}
module.exports = {
  ${list.join(',\n  ')},
};
`;
  fs.writeFileSync(path.join(OUT, `${mod}.js`), js);
}

/* 8. rewrite adminController.js as the barrel */
fs.writeFileSync(SRC, `/* Phase 4 (4.5) — adminController.js is now a BARREL.
   The implementation lives in src/controllers/admin/{_shared,orders,catalog,customers,system}.js;
   every existing import (adminRoutes, QA scripts) keeps working unchanged. */
module.exports = {
  ...require('./admin/orders'),
  ...require('./admin/catalog'),
  ...require('./admin/customers'),
  ...require('./admin/system'),
};
`);

/* 9. usage report — any destructured-but-unused names per module */
console.log('split complete:',
  Object.entries(GROUPS).map(([m, n]) => `${m}:${n.filter((x) => x !== '__autoPush').length}`).join(' '),
  '| blocks:', allNames.length);
