/* ArixGear service — tiny in-memory TTL cache for the public product catalog.
   Layer 3 (Task 27): catalog list/filters responses are hot (every visitor hits
   them on every page) but only change when an admin edits a product or a review
   re-computes a rating — so a short TTL + explicit invalidation keeps MongoDB
   free during traffic bursts with zero new dependencies.

   - get(key)  → cached value or null (expired/missing)
   - set(key, value)
   - bump()    → invalidate everything (single namespace: products)
   - stats()   → { entries, ttlMs } for QA/diagnostics */
const store = new Map(); // key → { at, value }
/* 15s — short by design: `npm run seed` is a separate process that wipes Mongo
   without touching this server's memory, so any stale entry self-heals fast
   (the 60s first draft poisoned a QA suite that reseeds mid-run). Burst
   protection is preserved; correctness always wins over cache hit rate. */
const TTL_MS = 15 * 1000;

exports.get = (key) => {
  const hit = store.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) { store.delete(key); return null; }
  return hit.value;
};

exports.set = (key, value) => {
  /* hard cap so a flood of unique filter combos can't grow the map forever */
  if (store.size >= 500) store.clear();
  store.set(key, { at: Date.now(), value });
};

exports.bump = () => {
  for (const k of store.keys()) store.delete(k);
};

exports.stats = () => ({ entries: store.size, ttlMs: TTL_MS });
