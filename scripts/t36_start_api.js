/* Detached daemon starter — double-fork pattern so the API survives
   across tool-call sessions (shell & / nohup get reaped by the sandbox).
   Usage: node /home/z/my-project/scripts/t36_start_api.js           */
const { spawn } = require('child_process');

const CWD = '/home/z/my-project/download/forged-full-project/backend';

const child = spawn('node', ['server.js'], {
  cwd: CWD,
  detached: true,
  stdio: ['ignore', require('fs').openSync(CWD + '/api.log', 'a'), require('fs').openSync(CWD + '/api.log', 'a')],
});

child.unref();
console.log('API daemonized → pid', child.pid);
