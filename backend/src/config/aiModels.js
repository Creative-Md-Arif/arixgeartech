/* Central AI model policy. */
const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
const GEMINI_FALLBACK_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'];

const GEMINI_DEPRECATED = new Map([
  ['gemini-2.0-flash', GEMINI_DEFAULT_MODEL],
  ['gemini-2.0-flash-lite', 'gemini-3.5-flash-lite'],
  ['gemini-3-pro-preview', GEMINI_DEFAULT_MODEL],
]);

function cleanModel(value) {
  return String(value || '').trim().replace(/^models\//i, '');
}

function normalizeGeminiModel(value) {
  const model = cleanModel(value);
  return GEMINI_DEPRECATED.get(model) || model || GEMINI_DEFAULT_MODEL;
}

function geminiModelCandidates(preferred) {
  return [...new Set([normalizeGeminiModel(preferred), ...GEMINI_FALLBACK_MODELS])];
}

module.exports = { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODELS, normalizeGeminiModel, geminiModelCandidates };
