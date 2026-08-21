const { spawn, spawnSync } = require('child_process');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const viteCli = path.join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js');
const postgresStarter = path.join(projectRoot, 'scripts', 'postgres-local.cjs');

const database = spawnSync(process.execPath, [postgresStarter, 'start'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

if (database.status !== 0) {
  console.error('[Diligência 360] Não foi possível iniciar o banco local.');
  process.exit(database.status || 1);
}

const processes = [
  spawn(process.execPath, [path.join(projectRoot, 'server', 'index.js')], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  }),
  spawn(process.execPath, [viteCli], {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'inherit',
  }),
];

let stopping = false;

function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of processes) {
    if (!child.killed) child.kill();
  }
  setTimeout(() => process.exit(exitCode), 100).unref();
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!stopping && code && code !== 0) stop(code);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
