const test = require('node:test');
const assert = require('node:assert/strict');

const AiChat = require('../src/models/AiChat');

function mockMethod(object, name, implementation) {
  const original = object[name];
  object[name] = implementation;
  return () => { object[name] = original; };
}

test('a guest lookup cannot reuse an authenticated customer chat', async () => {
  const queries = [];
  const created = [];
  const privateSession = { _id: 'chat-private', user: 'customer-a' };
  const restoreFind = mockMethod(AiChat, 'findOne', async (query) => {
    queries.push(query);
    return Object.prototype.hasOwnProperty.call(query, 'user') ? null : privateSession;
  });
  const restoreCreate = mockMethod(AiChat, 'create', async (doc) => {
    created.push(doc);
    return doc;
  });
  try {
    const result = await AiChat.findOrCreate({ sessionKey: 'same-key', user: null, channel: 'web' });
    assert.deepEqual(queries, [{ sessionKey: 'same-key', channel: 'web', user: null }]);
    assert.equal(result.user, null);
    assert.notEqual(result, privateSession);
    assert.equal(created.length, 1);
  } finally {
    restoreFind();
    restoreCreate();
  }
});

test('a customer can safely claim their existing guest session', async () => {
  const guestSession = { _id: 'chat-guest', user: null };
  const updates = [];
  const restoreFind = mockMethod(AiChat, 'findOne', async () => null);
  const restoreUpdate = mockMethod(AiChat, 'findOneAndUpdate', async (query, update, options) => {
    updates.push({ query, update, options });
    guestSession.user = update.$set.user;
    return guestSession;
  });
  try {
    const result = await AiChat.findOrCreate({ sessionKey: 'guest-key', user: 'customer-a', channel: 'web' });
    assert.equal(result, guestSession);
    assert.deepEqual(updates[0], {
      query: { sessionKey: 'guest-key', channel: 'web', user: null },
      update: { $set: { user: 'customer-a' } },
      options: { new: true },
    });
  } finally {
    restoreFind();
    restoreUpdate();
  }
});

test('a customer cannot reuse another customer chat and gets an owned session', async () => {
  const queries = [];
  const updates = [];
  const created = [];
  const restoreFind = mockMethod(AiChat, 'findOne', async (query) => {
    queries.push(query);
    return null;
  });
  const restoreUpdate = mockMethod(AiChat, 'findOneAndUpdate', async (query) => {
    updates.push(query);
    return null;
  });
  const restoreCreate = mockMethod(AiChat, 'create', async (doc) => {
    created.push(doc);
    return doc;
  });
  try {
    const result = await AiChat.findOrCreate({ sessionKey: 'same-key', user: 'customer-b', channel: 'web' });
    assert.deepEqual(queries[0], { sessionKey: 'same-key', channel: 'web', user: 'customer-b' });
    assert.deepEqual(updates[0], { sessionKey: 'same-key', channel: 'web', user: null });
    assert.equal(result.user, 'customer-b');
    assert.equal(created.length, 1);
  } finally {
    restoreFind();
    restoreUpdate();
    restoreCreate();
  }
});

test('an authenticated customer can continue their own chat', async () => {
  const owned = { _id: 'chat-a', user: 'customer-a' };
  const queries = [];
  const restoreFind = mockMethod(AiChat, 'findOne', async (query) => {
    queries.push(query);
    return owned;
  });
  const restoreUpdate = mockMethod(AiChat, 'findOneAndUpdate', async () => {
    assert.fail('an owned session should not claim a guest session');
  });
  try {
    const result = await AiChat.findOrCreate({ sessionKey: 'key-a', user: 'customer-a', channel: 'web' });
    assert.equal(result, owned);
    assert.deepEqual(queries[0], { sessionKey: 'key-a', channel: 'web', user: 'customer-a' });
  } finally {
    restoreFind();
    restoreUpdate();
  }
});

test('storefront AI chat optionally authenticates customers', () => {
  const router = require('../src/routes/aiRoutes');
  const layer = router.stack.find((entry) => entry.route && entry.route.path === '/chat');
  assert.ok(layer);
  assert.equal(layer.route.stack[0].handle.name, 'protectOptional');
});

test('AI-only sub-admins can read categories for import approval', () => {
  const router = require('../src/routes/adminRoutes');
  const layer = router.stack.find((entry) => entry.route && entry.route.path === '/categories' && entry.route.methods.get);
  assert.ok(layer);
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  let nextCalled = false;
  layer.route.stack[0].handle(
    { user: { role: 'subadmin', permissions: ['ai'] } },
    res,
    () => { nextCalled = true; }
  );
  assert.equal(nextCalled, true);
});

test('AI schema mapping parses the provider response text', async () => {
  const aiAdmin = require('../src/controllers/aiAdminController');
  const AiImport = require('../src/models/AiImport');
  const Category = require('../src/models/Category');
  const provider = require('../src/services/ai/provider');
  const restoreImport = mockMethod(AiImport, 'findById', () => ({
    lean: async () => ({ category: 'laptop', aiContent: { specs: [{ k: 'RAM', v: '16 GB' }] } }),
  }));
  const restoreCategory = mockMethod(Category, 'findOne', () => ({
    select() { return this; },
    lean: async () => null,
  }));
  const restoreResolve = mockMethod(provider, 'resolve', async () => ({ provider: 'gemini' }));
  const restoreComplete = mockMethod(provider, 'complete', async () => ({
    text: '{"suggestions":[{"k":"RAM","type":"select","filterable":true}]}',
  }));
  const res = {
    body: null,
    json(body) { this.body = body; return this; },
  };
  try {
    await aiAdmin._raw.importSuggestMapping({ params: { id: 'import-id' } }, res);
    assert.equal(res.body.provider, 'gemini');
    assert.equal(res.body.suggestions[0].source, 'gemini');
    assert.equal(res.body.suggestions[0].k, 'RAM');
  } finally {
    restoreImport();
    restoreCategory();
    restoreResolve();
    restoreComplete();
  }
});
