const test = require('node:test');
const assert = require('node:assert/strict');

const userQueries = [];
const countQueries = [];
const aggregateQueries = [];
const findQueries = [];

function missingUserQuery(filter) {
  userQueries.push(filter);
  return {
    select() { return this; },
    lean() { return Promise.resolve(null); },
    then(resolve, reject) { return Promise.resolve(null).then(resolve, reject); },
  };
}

const userQuery = {
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  select() { return this; },
  lean() { return Promise.resolve([]); },
};

const sharedPath = require.resolve('../src/controllers/admin/_shared');
require.cache[sharedPath] = {
  id: sharedPath,
  filename: sharedPath,
  loaded: true,
  exports: {
    notifier: { notifyUser() {} },
    User: {
      findOne: missingUserQuery,
      countDocuments: async (filter) => { countQueries.push(filter); return 0; },
      aggregate: async (pipeline) => { aggregateQueries.push(pipeline); return []; },
      find: (filter) => { findQueries.push(filter); return userQuery; },
    },
    Order: { aggregate: async () => [], find: () => ({ sort() { return this; }, limit() { return this; }, select() { return this; }, lean: async () => [] }) },
    loyaltyEngine: { getRules: async () => ({}), pointsToDiscount: () => 0 },
    LoyaltyLog: { aggregate: async () => [], historyFor: async () => [] },
    Setting: {},
    cache: {},
  },
};

const customers = require('../src/controllers/admin/customers');

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function assertCustomerOnly(handler, req) {
  userQueries.length = 0;
  const res = response();
  let error;
  await handler(req, res, (e) => { error = e; });
  assert.ifError(error);
  assert.equal(res.statusCode, 404);
  assert.equal(userQueries.length, 1);
  assert.equal(userQueries[0].role, 'customer');
}

test('CRM tags and customer reset reject non-customer accounts', async () => {
  await assertCustomerOnly(customers.customerTags, { params: { id: 'staff-id' }, body: {} });
  await assertCustomerOnly(customers.resetCustomerPassword, { params: { id: 'staff-id' } });
});

test('loyalty history and adjustments reject non-customer accounts', async () => {
  await assertCustomerOnly(customers.loyaltyDetail, { params: { userId: 'staff-id' } });
  await assertCustomerOnly(customers.loyaltyAdjust, { params: { userId: 'staff-id' }, body: { points: 10 } });
});

test('loyalty listing and totals only include customer accounts', async () => {
  countQueries.length = 0;
  aggregateQueries.length = 0;
  findQueries.length = 0;
  const res = response();
  let error;
  await customers.loyaltyList({ query: {} }, res, (e) => { error = e; });
  assert.ifError(error);
  assert.equal(countQueries[0].role, 'customer');
  assert.equal(aggregateQueries[0][0].$match.role, 'customer');
  assert.equal(findQueries[0].role, 'customer');
});
