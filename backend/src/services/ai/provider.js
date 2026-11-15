/* ════════════════════════════════════════════════════════════════════
   AI PROVIDER LAYER — one interface, three backends (modular + cheap).

     gemini  → Google AI Studio REST (generativelanguage.googleapis.com)
     openai  → ANY OpenAI-compatible endpoint (Ollama / vLLM / LM Studio /
               OpenRouter / text-generation-webui … open-source models)
     rules   → deterministic grounded composer handled in chat.js — this
               module only reports 'unavailable' so the caller falls back.
               Zero cost. Can never hallucinate: answers are composed from
               retrieved database facts only.

   resolve() reads AiSetting.resolveProvider() (DB config → env → rules
   floor). complete() throws PROVIDER_UNAVAILABLE instead of pretending;
   timeouts are enforced with AbortController. Usage tokens are returned
   so AiStat can track cost efficiency.
   ════════════════════════════════════════════════════════════════════ */

const AiSetting = require('../../models/AiSetting');
const { GEMINI_DEFAULT_MODEL, geminiModelCandidates } = require('../../config/aiModels');

class ProviderUnavailable extends Error {
  constructor(msg) { super(msg); this.code = 'PROVIDER_UNAVAILABLE'; }
}

let cached = null;
let cachedAt = 0;
const CACHE_MS = 30000;

/** Resolve the active provider config (30s cache — admin edits apply fast). */
async function resolve(force = false) {
  if (!force && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const rt = await AiSetting.resolveProvider();
  cached = rt;
  cachedAt = Date.now();
  return rt;
}

function invalidate() { cached = null; }

/** fetch with hard timeout */
async function fetchTimeout(url, opts = {}, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally { clearTimeout(t); }
}

/* ---------- Gemini (Google AI Studio) ---------- */
async function geminiComplete(rt, { system, messages, json, temperature, maxTokens, timeoutMs }) {
  const model = rt.model || GEMINI_DEFAULT_MODEL;
  /* audit fix — the API key previously rode in the query string (lands in
     proxy/access logs); the x-goog-api-key header is the documented way */
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = (messages || []).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.content || '') }],
  }));
  const body = {
    contents,
    generationConfig: {
      temperature: temperature ?? rt.temperature ?? 0.4,
      maxOutputTokens: maxTokens ?? rt.maxOutputTokens ?? 700,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const res = await fetchTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(rt.key || '') },
    body: JSON.stringify(body),
  }, timeoutMs ?? rt.timeoutMs ?? 15000);

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(`gemini HTTP ${res.status}: ${t.slice(0, 200)}`);
    err.status = res.status;
    err.model = model;
    throw err;
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  const usage = data.usageMetadata || {};
  return {
    text,
    provider: 'gemini',
    model,
    promptTokens: usage.promptTokenCount || 0,
    completionTokens: usage.candidatesTokenCount || 0,
  };
}

/* ---------- OpenAI-compatible (open-source / self-hosted) ---------- */
async function openaiComplete(rt, { system, messages, json, temperature, maxTokens, timeoutMs }) {
  const base = (rt.baseUrl || '').replace(/\/+$/, '');
  const model = rt.openaiModel || 'llama3.1';
  const msgs = [];
  if (system) msgs.push({ role: 'system', content: system });
  for (const m of messages || []) msgs.push({ role: m.role, content: String(m.content || '') });

  const res = await fetchTimeout(base + '/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(rt.openaiKey ? { Authorization: 'Bearer ' + rt.openaiKey } : {}),
    },
    body: JSON.stringify({
      model,
      messages: msgs,
      temperature: temperature ?? rt.temperature ?? 0.4,
      max_tokens: maxTokens ?? rt.maxOutputTokens ?? 700,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    }),
  }, timeoutMs ?? rt.timeoutMs ?? 15000);

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`openai HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return {
    text: String(text).trim(),
    provider: 'openai',
    model,
    promptTokens: data.usage?.prompt_tokens || 0,
    completionTokens: data.usage?.completion_tokens || 0,
  };
}

/**
 * One-shot completion.
 * @param {object} p { system, messages:[{role,content}], json, temperature, maxTokens }
 * @returns {object} { text, provider, model, promptTokens, completionTokens }
 * @throws ProviderUnavailable when no LLM is configured (caller falls back to rules composer)
 */
async function geminiWithFallback(rt, p) {
  let last;
  for (const model of geminiModelCandidates(rt.model)) {
    try {
      const out = await geminiComplete({ ...rt, model }, p);
      if (model !== rt.model) console.warn(`[ai] Gemini model fallback succeeded: ${rt.model} -> ${model}`);
      return out;
    } catch (e) {
      last = e;
      if (e.status !== 404) break;
      console.warn(`[ai] Gemini model unavailable (${model}) -> trying fallback`);
    }
  }
  throw last || new Error('Gemini unavailable');
}

async function complete(p = {}) {
  const rt = await resolve();
  if (rt.provider === 'gemini') {
    try { return await geminiWithFallback(rt, p); } catch (e) {
      console.warn('[ai] gemini failed →', e.message);
      throw new ProviderUnavailable(e.message);
    }
  }
  if (rt.provider === 'openai') {
    try { return await openaiComplete(rt, p); } catch (e) {
      console.warn('[ai] openai failed →', e.message);
      throw new ProviderUnavailable(e.message);
    }
  }
  throw new ProviderUnavailable('No LLM provider configured — rules mode');
}

/** Tolerant JSON extraction (models sometimes wrap JSON in ``` fences). */
function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch (_) {}
  const a = t.indexOf('{'); const b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (_) {} }
  return null;
}

module.exports = { resolve, invalidate, complete, parseJsonLoose, ProviderUnavailable };
