#!/usr/bin/env node
// Sync live project → download/forged-full-project/ → rebuild final zip
// (mirrors the established pack: no node_modules / dbdata / .git / api.log / mongo.log)
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

const ROOT = '/home/z/my-project';
const DEST = `${ROOT}/download/forged-full-project`;
const ZIP = `${ROOT}/download/forged-full-project.zip`;

const EXCL = [
  'node_modules', 'node_modules/**', '.git', '.git/**', 'dbdata', 'dbdata/**',
  'api.log', 'mongo.log', '*.log', 'scripts/api.log', 'scripts/mongo.log',
  '.vite/**', 'dist/assets/.vite/**',
];

if (!existsSync(DEST)) throw new Error('DEST missing — create download/forged-full-project first');
if (!existsSync(`${DEST}/backend`)) throw new Error('backend dir missing in DEST');

// 1) sync (delete extraneous, keep structure) — dry-run style with real flags
const opts = `-rlptD --delete ${EXCL.map(e => `--exclude='${e}'`).join(' ')}`;
execSync(`rsync ${opts} ${ROOT}/backend/   ${DEST}/backend/`,   { shell: '/bin/bash', stdio: 'inherit' });
execSync(`rsync ${opts} ${ROOT}/frontend/  ${DEST}/frontend/`,  { shell: '/bin/bash', stdio: 'inherit' });
execSync(`rsync ${opts} ${ROOT}/admin/     ${DEST}/admin/`,     { shell: '/bin/bash', stdio: 'inherit' });
execSync(`rsync ${opts} ${ROOT}/scripts/   ${DEST}/scripts/`,   { shell: '/bin/bash', stdio: 'inherit' });
for (const f of ['package.json', 'package-lock.json', 'README.md', 'CONTRACT.md', 'worklog.md']) {
  if (existsSync(`${ROOT}/${f}`)) execSync(`cp -f ${ROOT}/${f} ${DEST}/${f}`);
  // else: keep the existing copy already in DEST (e.g. workspace package-lock.json)
}
// qa-shots: copy the task screenshots referenced by latest tasks
execSync(`mkdir -p ${DEST}/qa-shots && cp -f ${ROOT}/scripts/t3*.png ${ROOT}/scripts/t4*.png ${DEST}/qa-shots/ 2>/dev/null || true`, { shell: '/bin/bash' });

// 2) rebuild zip fresh
if (existsSync(ZIP)) rmSync(ZIP);
execSync(`cd ${ROOT}/download && zip -rq forged-full-project.zip forged-full-project -x "*/node_modules/*" -x "*/.git/*" -x "*/dbdata/*" -x "*/api.log" -x "*/mongo.log"`, { shell: '/bin/bash', stdio: 'inherit' });

// 3) report
const out = execSync(`unzip -l ${ZIP} | tail -1`).toString().trim();
console.log('ZIP:', out);
const n = execSync(`find ${DEST} -type f | wc -l`).toString().trim();
console.log('DEST files:', n);
