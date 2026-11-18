const test = require('node:test');
const assert = require('node:assert/strict');

const AiSetting = require('../src/models/AiSetting');
const provider = require('../src/services/ai/provider');

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(data),
    json: async () => data,
  };
}

test('Gemini 503 advances to the next configured model', async () => {
  const originalResolveProvider = AiSetting.resolveProvider;
  const originalFetch = global.fetch;
  const requestedModels = [];
  AiSetting.resolveProvider = async () => ({
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    key: 'test-key',
    timeoutMs: 1000,
  });
  global.fetch = async (url) => {
    const model = String(url).match(/models\/([^:]+):generateContent/)[1];
    requestedModels.push(model);
    if (model === 'gemini-3.8-flash') {
      return response(503, { error: { message: 'temporarily unavailable' } });
    }
    return response(200, {
      candidates: [{ content: { parts: [{ text: 'ready' }] } }],
      usageMetadata: {},
    });
  };
  provider.invalidate();

  try {
    const result = await provider.complete({ messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(result.text, 'ready');
    assert.equal(result.model, 'gemini-3.7-flash');
    assert.deepEqual(requestedModels, ['gemini-3.8-flash', 'gemini-3.7-flash']);
  } finally {
    AiSetting.resolveProvider = originalResolveProvider;
    global.fetch = originalFetch;
    provider.invalidate();
  }
});

test('Gemini timeout advances once to a configured fallback model', async () => {
  const originalResolveProvider = AiSetting.resolveProvider;
  const originalFetch = global.fetch;
  const requestedModels = [];
  AiSetting.resolveProvider = async () => ({
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    key: 'test-key',
    timeoutMs: 1000,
  });
  global.fetch = async (url) => {
    const model = String(url).match(/models\/([^:]+):generateContent/)[1];
    requestedModels.push(model);
    if (model === 'gemini-3.8-flash') {
      const error = new Error('This operation was aborted');
      error.name = 'AbortError';
      throw error;
    }
    return response(200, {
      candidates: [{ content: { parts: [{ text: 'ready' }] } }],
      usageMetadata: {},
    });
  };
  provider.invalidate();

  try {
    const result = await provider.complete({ messages: [{ role: 'user', content: 'hello' }] });
    assert.equal(result.text, 'ready');
    assert.equal(result.model, 'gemini-3.7-flash');
    assert.deepEqual(requestedModels, ['gemini-3.8-flash', 'gemini-3.7-flash']);
  } finally {
    AiSetting.resolveProvider = originalResolveProvider;
    global.fetch = originalFetch;
    provider.invalidate();
  }
});

test('Gemini JSON generation forwards the requested response schema', async () => {
  const originalResolveProvider = AiSetting.resolveProvider;
  const originalFetch = global.fetch;
  const schema = {
    type: 'OBJECT',
    properties: { name: { type: 'STRING' } },
    required: ['name'],
  };
  let requestBody;
  AiSetting.resolveProvider = async () => ({
    provider: 'gemini',
    model: 'gemini-3.7-flash',
    key: 'test-key',
    timeoutMs: 1000,
  });
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return response(200, {
      candidates: [{ content: { parts: [{ text: '{"name":"Test"}' }] } }],
      usageMetadata: {},
    });
  };
  provider.invalidate();

  try {
    await provider.complete({
      messages: [{ role: 'user', content: 'Return a product name' }],
      json: true,
      responseSchema: schema,
    });
    assert.deepEqual(requestBody.generationConfig.responseSchema, schema);
  } finally {
    AiSetting.resolveProvider = originalResolveProvider;
    global.fetch = originalFetch;
    provider.invalidate();
  }
});

test('repeated Gemini timeouts stop after one fallback attempt', async () => {
  const originalResolveProvider = AiSetting.resolveProvider;
  const originalFetch = global.fetch;
  let requestCount = 0;
  AiSetting.resolveProvider = async () => ({
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    key: 'test-key',
    timeoutMs: 1000,
  });
  global.fetch = async () => {
    requestCount++;
    const error = new Error('This operation was aborted');
    error.name = 'AbortError';
    throw error;
  };
  provider.invalidate();

  try {
    await assert.rejects(
      provider.complete({ messages: [{ role: 'user', content: 'hello' }] }),
      { code: 'PROVIDER_UNAVAILABLE' },
    );
    assert.equal(requestCount, 2);
  } finally {
    AiSetting.resolveProvider = originalResolveProvider;
    global.fetch = originalFetch;
    provider.invalidate();
  }
});

test('Gemini authentication errors do not advance to another model', async () => {
  const originalResolveProvider = AiSetting.resolveProvider;
  const originalFetch = global.fetch;
  let requestCount = 0;
  AiSetting.resolveProvider = async () => ({
    provider: 'gemini',
    model: 'gemini-3.8-flash',
    key: 'test-key',
    timeoutMs: 1000,
  });
  global.fetch = async () => {
    requestCount++;
    return response(401, { error: { message: 'unauthorized' } });
  };
  provider.invalidate();

  try {
    await assert.rejects(
      provider.complete({ messages: [{ role: 'user', content: 'hello' }] }),
      { code: 'PROVIDER_UNAVAILABLE' },
    );
    assert.equal(requestCount, 1);
  } finally {
    AiSetting.resolveProvider = originalResolveProvider;
    global.fetch = originalFetch;
    provider.invalidate();
  }
});
