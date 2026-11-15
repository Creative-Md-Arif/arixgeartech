#!/usr/bin/env node
// arixgear.tech — final project pack → download/arixgear-full-project(.zip)
// Includes source + builds + docs + QA suites; never node_modules/.git/logs.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';

/* audit fix — ROOT was hardcoded to the old project path; resolve relative to this repo */
const ROOT = process.env.PROJECT_ROOT || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DL = '/home/z/my-project/download';
const DEST = `${DL}/arixgear-full-project`;
const ZIP = `${DL}/arixgear-full-project.zip`;
const VERSION = execSync(`cat ${ROOT}/VERSION`).toString().trim();

const EXCL = [
  'node_modules', 'node_modules/**', '.git', '.git/**',
  '*.log', 'logs/**', 'uploads/**',
  '.vite/**', 'dist/assets/.vite/**',
  '.env', '**/.env', // never ship secrets — .env.example ships instead
];

// 1) fresh DEST
if (existsSync(DEST)) rmSync(DEST, { recursive: true, force: true });
execSync(`mkdir -p ${DEST}`, { shell: '/bin/bash' });

// 2) rsync trees (keep structure)
const opts = `-a --delete ${EXCL.map((e) => `--exclude='${e}'`).join(' ')}`;
for (const dir of ['backend', 'frontend', 'admin', 'scripts', 'docs']) {
  execSync(`rsync ${opts} ${ROOT}/${dir}/ ${DEST}/${dir}/`, { shell: '/bin/bash', stdio: 'inherit' });
}

// 3) root files
for (const f of ['package.json', 'package-lock.json', 'README.md', 'CONTRACT.md', 'worklog.md', 'VERSION']) {
  if (existsSync(`${ROOT}/${f}`)) execSync(`cp -f "${ROOT}/${f}" "${DEST}/${f}"`, { shell: '/bin/bash' });
}
// backend env template ships (documented); real .env never does
if (existsSync(`${ROOT}/backend/.env.example`)) execSync(`cp -f "${ROOT}/backend/.env.example" "${DEST}/backend/.env.example"`, { shell: '/bin/bash' });

// 4) rebuild zip fresh
if (existsSync(ZIP)) rmSync(ZIP);
execSync(`cd ${DL} && zip -rq arixgear-full-project.zip arixgear-full-project -x "*/node_modules/*" -x "*/.git/*" -x "*.log" -x "*/logs/*" -x "*/uploads/*" -x "*/.env"`, { shell: '/bin/bash', stdio: 'inherit' });

// 5) report
const out = execSync(`unzip -l ${ZIP} | tail -1`).toString().trim();
const n = execSync(`find ${DEST} -type f | wc -l`).toString().trim();
const size = execSync(`du -sh ${ZIP} | cut -f1`).toString().trim();
console.log(`arixgear.tech v${VERSION} → ${ZIP}`);
console.log(`ZIP: ${out} · DEST files: ${n} · size: ${size}`);
