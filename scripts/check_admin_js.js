#!/usr/bin/env node
/** Extract inline <script> blocks from admin/index.html and node --check them. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = fs.readFileSync('/home/z/my-project/download/forged-full-project/admin/index.html', 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log('script blocks:', blocks.length);
let fail = 0;
blocks.forEach((js, i) => {
  const tmp = path.join('/tmp', `admin_block_${i}.js`);
  fs.writeFileSync(tmp, js);
  try {
    execFileSync('node', ['--check', tmp], { stdio: 'pipe' });
    console.log(`block ${i}: OK (${js.length} chars)`);
  } catch (e) {
    fail++;
    console.log(`block ${i}: SYNTAX ERROR\n` + e.stderr.toString());
  }
});
process.exit(fail ? 1 : 0);
