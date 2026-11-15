#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
//  FORGED — Restore / Rollback Tool
//  Restores the live project tree + download copy from any versioned
//  backup zip (sha256-verified before touching anything).
//
//  Usage:
//    node scripts/restore_backup.mjs            → list versions
//    node scripts/restore_backup.mjs 2.1.0      → restore v2.1.0
//    node scripts/restore_backup.mjs latest     → newest version
//    add --dry                                  → extract to /tmp only, no overwrite
// ════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, rmSync, mkdtempSync } from 'node:fs';

const ROOT = '/home/z/my-project';
const MANIFEST = `${ROOT}/download/backups/versions.json`;
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || null;
const DRY = args.includes('--dry');
const sh = (c) => execSync(c, { shell: '/bin/bash' }).toString().trim();

if (!existsSync(MANIFEST)) { console.error('No versions.json — nothing to restore.'); process.exit(1); }
const list = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!target) {
  console.log('Available versions (newest last):');
  for (const v of list) console.log(`  v${v.version}  ${v.date}  ${v.files} files  — ${v.note}`);
  process.exit(0);
}
const entry = target === 'latest' ? list[list.length - 1] : list.find((v) => v.version === target);
if (!entry) { console.error(`Version ${target} not found. Run without args to list.`); process.exit(1); }

const zip = entry.paths.find((p) => existsSync(p));
if (!zip) { console.error('All copies of this version are missing!'); process.exit(1); }
const digest = createHash('sha256').update(readFileSync(zip)).digest('hex');
if (digest !== entry.sha256) { console.error('SHA256 MISMATCH — zip corrupted, refusing to restore.'); process.exit(1); }

const stage = mkdtempSync('/tmp/forged-restore-');
sh(`unzip -q ${zip} -d ${stage}`);
const src = `${stage}/forged-full-project`;
console.log(`Restoring v${entry.version} (${entry.date}) from ${zip}`);
console.log(`  sha256 verified ✓  ·  ${entry.files} files`);

const DIRS = ['backend', 'frontend', 'admin', 'scripts', 'qa-shots'];
const FILES = ['package.json', 'README.md', 'CONTRACT.md', 'worklog.md', 'VERSION'];

if (DRY) {
  console.log(`\n[DRY] extracted to ${stage} — live tree untouched.`);
  for (const d of DIRS) console.log(`  would sync: ${d}/ (${Number(sh(`find ${src}/${d} -type f | wc -l`))} files)`);
  process.exit(0);
}

const R = '-rlptD --delete';
for (const d of DIRS) sh(`rsync ${R} ${src}/${d}/ ${ROOT}/${d}/`);
for (const f of FILES) if (existsSync(`${src}/${f}`)) sh(`cp -f ${src}/${f} ${ROOT}/${f}`);
// refresh the download copy to the same state
sh(`rsync ${R} ${src}/ ${ROOT}/download/forged-full-project/`);
rmSync(stage, { recursive: true, force: true });
console.log('✅ RESTORED — reinstall deps if package versions changed:  npm run install:all');
console.log('   then boot:  npm run mongo · npm run seed · npm start');
