const test = require('node:test');
const assert = require('node:assert/strict');

const AiImport = require('../src/models/AiImport');
const controller = require('../src/controllers/aiAdminController');

test('AI import pagination clamps the requested limit and page', async () => {
  const originalFind = AiImport.find;
  const originalCountDocuments = AiImport.countDocuments;
  const originalAggregate = AiImport.aggregate;
  const calls = {};

  AiImport.find = () => ({
    sort() { return this; },
    skip(value) { calls.skip = value; return this; },
    limit(value) { calls.limit = value; return this; },
    populate() { return this; },
    lean: async () => [],
  });
  AiImport.countDocuments = async () => 205;
  AiImport.aggregate = async () => [];

  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };

  try {
    await controller.importList({ query: { limit: '250', page: '3' } }, response);
    assert.equal(calls.limit, 100);
    assert.equal(calls.skip, 200);
    assert.equal(response.body.limit, 100);
    assert.equal(response.body.pages, 3);

    await controller.importList({ query: { limit: '-5', page: '-2' } }, response);
    assert.equal(calls.limit, 1);
    assert.equal(calls.skip, 0);
    assert.equal(response.body.page, 1);

    await controller.importList({ query: {} }, response);
    assert.equal(calls.limit, 40);
    assert.equal(response.body.limit, 40);
  } finally {
    AiImport.find = originalFind;
    AiImport.countDocuments = originalCountDocuments;
    AiImport.aggregate = originalAggregate;
  }
});
