/* Step 7 — THUMBNAIL PREFETCH QUEUE (#11 of the improvement list).
   sharp encoding is CPU-bound; the Step 6 path paid for it inline on every
   upload request, and a bulk backfill would hog the event loop one image at
   a time. This queue takes thumb work OFF the request path:
     POST /api/admin/system/backfill-thumbs  → enqueues derivations, returns
     GET  /api/admin/system/thumb-queue      → live stats for the admin UI
   Design: bounded in-process FIFO (drop-oldest beyond MAX_PENDING), fixed
   concurrency 2 (sharp itself pools threads — more workers just add
   scheduling overhead), every job patches the owning Product doc through a
   filtered positional update so a failed job never poisons a doc. QA drives
   determinism with drain() (?wait=1). No timers — the worker chains itself,
   so the queue never keeps the process alive on its own. */
const fs = require('fs');
const { makeLocalThumbFromPath, THUMB_DIR } = require('./storageService');

const CONCURRENCY = 2;
const MAX_PENDING = 200;

const state = {
  pending: [],   // job[]
  active: 0,     // workers currently inside sharp
  done: 0,
  failed: 0,
  dropped: 0,    // jobs shed when the queue overflowed
  lastError: '',
};

/* job = { srcPath, name, url, productId } */
function enqueue(job) {
  if (state.pending.length >= MAX_PENDING) {
    state.pending.shift(); // drop-oldest — the newest scan wins
    state.dropped++;
  }
  state.pending.push(job);
  setImmediate(_pump);
  return { queued: state.pending.length };
}

function _pump() {
  while (state.active < CONCURRENCY && state.pending.length) {
    const job = state.pending.shift();
    state.active++;
    _run(job)
      .catch((e) => {
        state.failed++;
        state.lastError = String((e && e.message) || e).slice(0, 200);
      })
      .finally(() => {
        state.active--;
        if (state.pending.length) setImmediate(_pump);
      });
  }
}

async function _run({ srcPath, name, url, productId }) {
  const Product = require('../models/Product'); // lazy — no import cycle
  const thumb = await makeLocalThumbFromPath(srcPath, name);
  if (!thumb || !fs.existsSync(require('path').join(THUMB_DIR, thumb.replace('/uploads/thumbs/', '')))) {
    throw new Error('thumb derivation produced no file (' + name + ')');
  }
  /* patch exactly the image row that carries this url — safe under concurrent
     edits (filtered positional), and a no-op if the image was removed meanwhile */
  const r = await Product.updateOne(
    { _id: productId, 'images.url': url },
    { $set: { 'images.$.thumb': thumb } }
  );
  if (!r.matchedCount) throw new Error('image row vanished before the thumb landed (' + name + ')');
  state.done++;
}

/* QA/ops helper — resolves when the queue is fully drained (or 30s cap) */
function drain(timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      if (!state.pending.length && !state.active) return resolve({ drained: true, waited: Date.now() - started, ...stats() });
      if (Date.now() - started > timeoutMs) return resolve({ drained: false, waited: Date.now() - started, ...stats() });
      setTimeout(tick, 50);
    };
    setTimeout(tick, 20);
  });
}

function stats() {
  return {
    pending: state.pending.length,
    active: state.active,
    done: state.done,
    failed: state.failed,
    dropped: state.dropped,
    concurrency: CONCURRENCY,
    maxPending: MAX_PENDING,
    lastError: state.lastError,
  };
}

module.exports = { enqueue, drain, stats };
