const { spawn } = require('node:child_process');
const electron = require('electron');

const child = spawn(electron, ['.'], {
  env: { ...process.env, V7_COMPAT_CHECK: '1' },
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
