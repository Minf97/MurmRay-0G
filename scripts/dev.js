import { spawn } from 'node:child_process';

const shellCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const isFirefox = process.argv[2] === 'firefox';

// 拉起进程
function startProcess(args) {
  return spawn(shellCommand, args, {
    stdio: 'inherit',
  });
}

const backendProcess = startProcess(['run', 'dev:backend']);
const extensionProcess = startProcess(['run', isFirefox ? 'dev:extension:firefox' : 'dev:extension']);
let shuttingDown = false;

// 统一退出
function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  backendProcess.kill('SIGTERM');
  extensionProcess.kill('SIGTERM');
  setTimeout(() => process.exit(exitCode), 200);
}

for (const child of [backendProcess, extensionProcess]) {
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (signal === 'SIGTERM') return;
    shutdown(code ?? 1);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
