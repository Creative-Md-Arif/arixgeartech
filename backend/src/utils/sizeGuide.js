/* ArixGear util — shared Size Guide normalizer (Task 32).
   One source of truth for every guide surface:
   • Setting.sizeGuide (global table — Task 31)
   • Setting.categoryGuides[] (per-category tables — Task 32)
   • Product.sizeGuide (per-product custom table — Task 32)
   Rules: 1–6 non-empty headers (blank headers auto-named positionally),
   ≤30 rows, every row padded/trimmed to the header width, FULLY blank rows
   dropped (the admin editor can leave an empty trailing row behind — that
   used to leak ['',''] into the saved table), cells ≤40 chars, title/note
   trimmed with sane defaults. */

const MAX_COLS = 6;
const MAX_ROWS = 30;
const MAX_CELL = 40;

const asStr = (v) => String(v == null ? '' : v).trim().slice(0, MAX_CELL);

/* normalizeGuide(input, prev?)
   input  — payload guide block (may be partial)
   prev   — previous stored block (used to fill blanks so a partial save
            cannot wipe an existing table)
   Returns { error } on a hard failure, { guide } otherwise (plain object —
   safe to assign onto a mongoose subdoc or store verbatim). */
function normalizeGuide(input, prev) {
  if (input === null || input === undefined) return { guide: null };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'size guide block must be an object' };
  }
  const p = prev && typeof prev === 'object' ? prev : {};
  const out = {};

  /* visibility — explicit only; partial saves keep the previous flag */
  if (input.enabled !== undefined) out.enabled = Boolean(input.enabled);
  else if (p.enabled !== undefined) out.enabled = Boolean(p.enabled);
  else out.enabled = true;

  /* title / note — blank falls back to the previous value, then defaults.
     Task 58 — *Bn twins ride along the same way (optional, no defaults). */
  const title = input.title !== undefined ? String(input.title).trim().slice(0, 80) : (p.title != null ? String(p.title) : '');
  out.title = title || (p.title != null ? String(p.title) : '') || 'Size Guide';
  const note = input.note !== undefined ? String(input.note).trim().slice(0, 300) : (p.note != null ? String(p.note) : '');
  out.note = note || (p.note != null ? String(p.note) : '') || '';
  const titleBn = input.titleBn !== undefined ? String(input.titleBn).trim().slice(0, 80) : (p.titleBn != null ? String(p.titleBn) : '');
  out.titleBn = titleBn || (p.titleBn != null ? String(p.titleBn) : '') || '';
  const noteBn = input.noteBn !== undefined ? String(input.noteBn).trim().slice(0, 300) : (p.noteBn != null ? String(p.noteBn) : '');
  out.noteBn = noteBn || (p.noteBn != null ? String(p.noteBn) : '') || '';

  /* headers — 1–6 non-empty; blanks dropped; surviving blanks auto-named "Column N" */
  let headers;
  if (input.headers !== undefined) {
    if (!Array.isArray(input.headers)) return { error: 'size guide headers must be an array of strings' };
    headers = input.headers.map(asStr);
  } else if (Array.isArray(p.headers)) {
    headers = p.headers.map(asStr);
  } else {
    return { error: 'size guide headers are required (1–6 non-empty columns)' };
  }
  const clean = headers.filter((h) => h.length);
  if (clean.length < 1) return { error: 'size guide needs at least 1 non-empty header column' };
  if (clean.length > MAX_COLS) return { error: `size guide supports up to ${MAX_COLS} columns` };
  headers = clean.map((h, i) => h || `Column ${i + 1}`);
  out.headers = headers;

  /* rows — always re-aligned to the header width; blank rows dropped */
  let rowsIn;
  if (input.rows !== undefined) {
    if (!Array.isArray(input.rows)) return { error: 'size guide rows must be an array of rows' };
    rowsIn = input.rows;
  } else if (Array.isArray(p.rows)) {
    rowsIn = p.rows;
  } else {
    rowsIn = [];
  }
  if (rowsIn.length > MAX_ROWS) return { error: `size guide supports up to ${MAX_ROWS} rows` };
  const w = headers.length;
  const rows = [];
  for (const r of rowsIn) {
    const cells = (Array.isArray(r) ? r : [r]).map(asStr);
    while (cells.length < w) cells.push('');
    const norm = cells.slice(0, w);
    if (norm.every((c) => !c)) continue; // fully blank row → dropped
    rows.push(norm);
  }
  out.rows = rows;

  return { guide: out };
}

/* product-level helper — shape of Product.sizeGuide (mode decides everything) */
function normalizeProductGuide(input, prev) {
  if (input === null || input === undefined) return { guide: null };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'sizeGuide must be an object' };
  }
  const p = prev && typeof prev === 'object' ? prev : {};
  const mode = input.mode !== undefined ? String(input.mode) : (p.mode || 'inherit');
  if (!['inherit', 'custom'].includes(mode)) return { error: 'sizeGuide.mode must be inherit | custom' };
  if (mode === 'inherit') {
    /* inherit keeps nothing custom — the PDP falls through category → global */
    return { guide: { mode: 'inherit', enabled: true, title: 'Size Guide', note: '', headers: [], rows: [] } };
  }
  const base = normalizeGuide({
    ...input,
    enabled: input.enabled !== undefined ? input.enabled : (p.enabled !== undefined ? p.enabled : true),
  }, { enabled: p.enabled, title: p.title, note: p.note, headers: p.headers, rows: p.rows });
  if (base.error) return base;
  return { guide: { mode: 'custom', ...base.guide } };
}

/* category guide entry — {category, enabled, title, note, headers, rows} */
function normalizeCategoryGuide(input, prev) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'category guide entry must be an object' };
  }
  const category = String(input.category == null ? '' : input.category).trim().toLowerCase();
  if (!category || category.length > 60) return { error: 'category guide needs a valid category slug (≤60 chars)' };
  const base = normalizeGuide(input, prev);
  if (base.error) return base;
  if (!base.guide.rows.length) return { error: `category "${category}" guide needs at least 1 non-empty row` };
  return { guide: { category, ...base.guide } };
}

module.exports = { normalizeGuide, normalizeProductGuide, normalizeCategoryGuide, MAX_COLS, MAX_ROWS };
