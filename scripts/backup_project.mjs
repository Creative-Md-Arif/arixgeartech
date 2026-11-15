#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
//  FORGED — Versioned Backup System
//  Every run creates a NEW immutable version zip; old versions are
//  NEVER deleted. Mirrors kept in 3 independent locations so a wipe
//  of any single directory (or an environment reset) cannot lose all
//  copies. Canonical "latest" zip is refreshed each run as well.
//
//  Usage:
//    node scripts/backup_project.mjs --note "what changed"
//    node scripts/backup_project.mjs --version 2.2.0 --note "..."
//    node scripts/backup_project.mjs --verify     (audit all backups)
// ════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, chmodSync, appendFileSync } from 'node:fs';

const ROOT = '/home/z/my-project';
const DEST = `${ROOT}/download/forged-full-project`;
const BACKUPS = `${ROOT}/download/backups`;
const MIRRORS = ['/home/z/forged-backups', '/tmp/forged-backups'];
const VERSION_FILE = `${ROOT}/VERSION`;
const MANIFEST = `${BACKUPS}/versions.json`;
const CANONICAL = `${ROOT}/download/forged-full-project.zip`;

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const NOTE = get('--note') || 'update';
const VERIFY_ONLY = args.includes('--verify');

const sh = (c) => execSync(c, { shell: '/bin/bash' }).toString().trim();
const sha256 = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

// ── verify mode ────────────────────────────────────────────────────
if (VERIFY_ONLY) {
  if (!existsSync(MANIFEST)) { console.error('No manifest yet.'); process.exit(1); }
  const list = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  let bad = 0;
  for (const v of list) {
    for (const p of v.paths) {
      let ok = 'MISSING';
      if (existsSync(p)) ok = sha256(p) === v.sha256 ? 'OK' : 'HASH-MISMATCH';
      if (ok !== 'OK') bad++;
      console.log(`v${v.version}  ${ok.padEnd(14)} ${p}`);
    }
  }
  console.log(bad === 0 ? `\nAll ${list.length} version(s) verified — every copy intact.` : `\n${bad} problem(s) found!`);
  process.exit(bad === 0 ? 0 : 1);
}

// ── version resolution ─────────────────────────────────────────────
let ver = get('--version');
if (!ver) {
  const cur = existsSync(VERSION_FILE) ? readFileSync(VERSION_FILE, 'utf8').trim() : '2.0.0';
  const [a, b, c] = cur.split('.').map(Number);
  ver = `${a}.${b}.${c + 1}`;
}
const date = new Date().toISOString().slice(0, 10);
const base = `forged-full-project-v${ver}-${date}`;
writeFileSync(VERSION_FILE, ver + '\n');

// ── 1. sync live tree → download copy ──────────────────────────────
mkdirSync(BACKUPS, { recursive: true });
if (!existsSync(`${DEST}/backend`)) throw new Error('download/forged-full-project missing');
// safety guard: refuse to back up a broken/incomplete tree
const REQUIRED = [
  'backend/.env', 'backend/.env.example', 'backend/server.js', 'backend/package.json',
  'frontend/dist/index.html', 'admin/dist/index.html', 'frontend/public/sw.js',
  'admin/src/pages/team.jsx', 'scripts/qa_task43_bugcheck.mjs', 'worklog.md',
];
const missing = REQUIRED.filter((f) => !existsSync(`${ROOT}/${f}`));
if (missing.length) throw new Error('Refusing backup — missing: ' + missing.join(', '));
const EX = [
  '--exclude=node_modules', '--exclude=.git', '--exclude=dbdata', '--exclude=*.log',
  '--exclude=.vite', '--exclude=mongodb-bin', '--exclude=scripts/qa-shots-tmp',
];
const R = `-rlptD --delete ${EX.join(' ')}`;
for (const d of ['backend', 'frontend', 'admin', 'scripts', 'qa-shots']) {
  sh(`rsync ${R} ${ROOT}/${d}/ ${DEST}/${d}/`);
}
for (const f of ['package.json', 'README.md', 'CONTRACT.md', 'worklog.md', 'VERSION']) {
  if (existsSync(`${ROOT}/${f}`)) sh(`cp -f ${ROOT}/${f} ${DEST}/${f}`);
}

// ── 2. canonical zip (latest, overwritten each run) ────────────────
sh(`cd ${ROOT}/download && rm -f forged-full-project.zip && zip -rq forged-full-project.zip forged-full-project -x "*/node_modules/*" -x "*/.git/*" -x "*/dbdata/*" -x "*/api.log" -x "*/mongo.log"`);

// ── 3. versioned zip (immutable) ───────────────────────────────────
const versionedZip = `${BACKUPS}/${base}.zip`;
if (existsSync(versionedZip)) throw new Error(`Version already exists: ${versionedZip} — pick a new --version`);
sh(`cd ${ROOT}/download && zip -rq backups/${base}.zip forged-full-project -x "*/node_modules/*" -x "*/.git/*" -x "*/dbdata/*" -x "*/api.log" -x "*/mongo.log"`);

// ── 4. manifest entry ──────────────────────────────────────────────
const entries = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : [];
const zipPaths = [versionedZip, ...MIRRORS.map((m) => `${m}/${base}.zip`)];
const files = Number(sh(`unzip -l ${versionedZip} | tail -1 | awk '{print $2}'`));
const bytes = statSync(versionedZip).size;
const digest = sha256(versionedZip);
entries.push({ version: ver, date, note: NOTE, files, bytes, sha256: digest, paths: zipPaths, created: new Date().toISOString() });
writeFileSync(MANIFEST, JSON.stringify(entries, null, 2));

// ── 5. mirror copies (3 locations) ─────────────────────────────────
for (const m of MIRRORS) {
  mkdirSync(m, { recursive: true });
  sh(`cp -f ${versionedZip} ${m}/`);
  sh(`cp -f ${CANONICAL} ${m}/forged-full-project-latest.zip`);
}
// read-only hardening against accidental overwrite/delete
[versionedZip, ...MIRRORS.map((m) => `${m}/${base}.zip`)].forEach((p) => chmodSync(p, 0o444));
chmodSync(MANIFEST, 0o664);

// ── 6. recovery note (text ledger survives even if JSON lost) ──────
appendFileSync(`${BACKUPS}/HISTORY.txt`,
  `v${ver} | ${date} | ${NOTE} | ${files} files | ${(bytes / 1048576).toFixed(2)} MB | sha256 ${digest.slice(0, 16)}…\n`);

console.log(`✅ BACKUP v${ver} COMPLETE`);
console.log(`   zip        : ${versionedZip}`);
console.log(`   mirrors    : ${MIRRORS.join(', ')}`);
console.log(`   latest also: ${CANONICAL}`);
console.log(`   contents   : ${files} files, ${(bytes / 1048576).toFixed(2)} MB`);
console.log(`   sha256     : ${digest}`);
console.log(`   versions so far: ${entries.length}`);
