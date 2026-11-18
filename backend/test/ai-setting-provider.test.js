const test = require('node:test');
const assert = require('node:assert/strict');

const AiSetting = require('../src/models/AiSetting');

test('admin runtime reports the OpenAI-compatible API key source', async () => {
  const originalGet = AiSetting.get;
  const originalResolveProvider = AiSetting.resolveProvider;
  AiSetting.get = async () => ({ toObject: () => ({}) });
  AiSetting.resolveProvider = async () => ({
    provider: 'openai',
    keySource: 'none',
    openaiKey: 'configured-key',
    openaiKeySource: 'db',
  });

  try {
    const view = await AiSetting.adminView();
    assert.equal(view.runtime.keyConfigured, true);
    assert.equal(view.runtime.keySource, 'db');
  } finally {
    AiSetting.get = originalGet;
    AiSetting.resolveProvider = originalResolveProvider;
  }
});
