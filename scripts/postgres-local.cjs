const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const action = process.argv[2] || 'start';
const localAppData = process.env.LOCALAPPDATA;

if (!localAppData) {
  console.error('[PostgreSQL] A pasta LOCALAPPDATA não está disponível.');
  process.exit(1);
}

const postgresRoot = path.join(localAppData, 'Diligencia360', 'PostgreSQL');
const postgresBin = path.join(postgresRoot, '17.11', 'pgsql', 'bin');
const dataDirectory = path.join(postgresRoot, 'data');
const logFile = path.join(postgresRoot, 'postgresql.log');
const pgCtl = path.join(postgresBin, 'pg_ctl.exe');
const pgIsReady = path.join(postgresBin, 'pg_isready.exe');

if (!fs.existsSync(pgCtl) || !fs.existsSync(path.join(dataDirectory, 'PG_VERSION'))) {
  console.error('[PostgreSQL] A instalação local do Diligência 360 não foi encontrada.');
  process.exit(1);
}

function run(executable, args, stdio = 'inherit') {
  return spawnSync(executable, args, {
    encoding: 'utf8',
    stdio,
    windowsHide: true,
  });
}

function isRunning() {
  return run(pgCtl, ['-D', dataDirectory, 'status'], 'ignore').status === 0;
}

if (action === 'status') {
  const ready = run(pgIsReady, ['-h', '127.0.0.1', '-p', '5432'], 'pipe');
  const online = ready.status === 0;
  console.log(online ? '[PostgreSQL] Online em localhost:5432.' : '[PostgreSQL] Offline.');
  process.exit(online ? 0 : 1);
}

if (action === 'stop') {
  if (!isRunning()) {
    console.log('[PostgreSQL] O banco já está parado.');
    process.exit(0);
  }

  const stopped = run(pgCtl, ['-D', dataDirectory, '-m', 'fast', '-w', 'stop']);
  process.exit(stopped.status ?? 1);
}

if (action !== 'start') {
  console.error(`[PostgreSQL] Ação desconhecida: ${action}`);
  process.exit(1);
}

if (isRunning()) {
  console.log('[PostgreSQL] Banco local já está online.');
  process.exit(0);
}

const started = run(pgCtl, [
  '-D', dataDirectory,
  '-l', logFile,
  '-o', '-h 127.0.0.1 -p 5432',
  '-w', 'start',
]);

process.exit(started.status ?? 1);
