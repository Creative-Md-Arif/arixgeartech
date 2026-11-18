const test = require('node:test');
const assert = require('node:assert/strict');

const AiImport = require('../src/models/AiImport');
const controller = require('../src/controllers/aiAdminController');
const importer = require('../src/services/ai/importer');

test('stale processing imports are marked failed and pending imports are resumed', async () => {
  const originalUpdateMany = AiImport.updateMany;
  const originalFind = AiImport.find;
  const calls = {};
  AiImport.updateMany = async (filter, update) => {
    calls.filter = filter;
    calls.update = update;
    return { modifiedCount: 2 };
  };
  AiImport.find = (filter) => {
    calls.pendingFilter = filter;
    return {
      select() { return this; },
      lean: async () => [],
    };
  };

  try {
    const result = await importer.recoverStuckImports();
    assert.equal(calls.filter.status, 'processing');
    assert.ok(calls.filter.updatedAt.$lt instanceof Date);
    assert.equal(calls.update.$set.status, 'failed');
    assert.equal(calls.update.$unset.processingToken, 1);
    assert.deepEqual(calls.pendingFilter, { status: 'pending' });
    assert.deepEqual(result, { failed: 2, resumed: 0 });
  } finally {
    AiImport.updateMany = originalUpdateMany;
    AiImport.find = originalFind;
  }
});

test('retry rejects active imports and atomically requeues a stale import', async () => {
  const originalFindById = AiImport.findById;
  const originalFindOneAndUpdate = AiImport.findOneAndUpdate;
  const originalProcessImport = importer.processImport;
  let doc;
  let updateCall;
  let processCalls = 0;
  AiImport.findById = async () => doc;
  AiImport.findOneAndUpdate = async (filter, update, options) => {
    updateCall = { filter, update, options };
    return { ...doc, status: 'pending' };
  };
  importer.processImport = async () => { processCalls++; };

  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    doc = { _id: 'import-id', status: 'processing', updatedAt: new Date() };
    await controller.importRetry({ params: { id: 'import-id' } }, response);
    assert.equal(response.statusCode, 409);
    assert.equal(processCalls, 0);

    doc = {
      _id: 'import-id',
      status: 'processing',
      updatedAt: new Date(Date.now() - importer.IMPORT_STALE_MS - 1),
    };
    response.statusCode = 200;
    await controller.importRetry({ params: { id: 'import-id' } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.item.status, 'pending');
    assert.equal(updateCall.filter.status, 'processing');
    assert.equal(updateCall.update.$set.progress, 0);
    assert.equal(updateCall.update.$unset.processingToken, 1);
    assert.equal(processCalls, 1);
  } finally {
    AiImport.findById = originalFindById;
    AiImport.findOneAndUpdate = originalFindOneAndUpdate;
    importer.processImport = originalProcessImport;
  }
});
