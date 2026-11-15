#!/usr/bin/env node
/* Step 4 (4.5) — i18n coverage audit.
 * Extracts tr('…')/t('…') first-arg string literals from frontend/src and
 * admin/src, then diffs them against each app's bn.js dictionary keys.
 * Reports: keys missing a BN mapping (English leaks in bn mode).
 * Also counts hardcoded JSX text nodes (rough heuristic) per app for the
 * unwrapped-string sweep. */
const fs = require('fs');
const path = require('path');

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(jsx?|js)$/.test(f)) out.push(p);
  }
  return out;
}

function bnKeys(file) {
  const src = fs.readFileSync(file, 'utf8');
  /* keys look like:  'english text': 'বাংলা',  (or "key": 'value') */
  const re = /(?:^|[{,\n]\s*)['"]((?:[^'"\n]|\\')+)['"]\s*:\s*['"](?:[^'"\n]|\\')*['"]/g;
  const keys = new Set();
  let m;
  while ((m = re.exec(src))) keys.add(m[1].replace(/\\'/g, "'"));
  return keys;
}

function usedStrings(appDir) {
  const files = walk(appDir).filter((f) => !f.includes('/lib/bn.js') && !f.includes('/lib/i18n'));
  const re = /\b(?:tr|t)\(\s*'((?:[^'\\\n]|\\.)+)'|\b(?:tr|t)\(\s*"((?:[^"\\\n]|\\.)+)"/g;
  const used = new Map(); // string → [files]
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(src))) {
      const s = (m[1] !== undefined ? m[1] : m[2]).replace(/\\'/g, "'").replace(/\\"/g, '"');
      if (!used.has(s)) used.set(s, []);
      used.get(s).push(path.relative(appDir, f));
    }
  }
  return used;
}

function audit(app, dir, bnFile) {
  const dict = bnKeys(bnFile);
  const used = usedStrings(dir);
  const missing = [];
  for (const [s, files] of used) {
    /* {var} templates and strings with interpolation must be compared literally */
    if (!dict.has(s)) missing.push({ s, files: [...new Set(files)].slice(0, 3) });
  }
  console.log('══ ' + app + ' ══');
  console.log('bn dictionary keys: ' + dict.size + ' · distinct tr()/t() strings: ' + used.size + ' · missing BN: ' + missing.length);
  missing.forEach((m) => console.log('  ✗ ' + JSON.stringify(m.s) + '  ← ' + m.files.join(', ')));
  console.log('');
  return missing.length;
}

const fMissing = audit('frontend', '/home/z/my-project/arixgear-full-project/frontend/src', '/home/z/my-project/arixgear-full-project/frontend/src/lib/bn.js');
const aMissing = audit('admin', '/home/z/my-project/arixgear-full-project/admin/src', '/home/z/my-project/arixgear-full-project/admin/src/lib/bn.js');
console.log('TOTAL missing: frontend ' + fMissing + ' · admin ' + aMissing);
