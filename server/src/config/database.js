// ==========================================================
// DILIGÊNCIA 360 — Configuração do Prisma Client / PostgreSQL
// Inicialização resiliente e verificação de conectividade
// ==========================================================

let prismaInstance = null;
let isConnected = false;
let initializationPromise = null;
let lastAttemptAt = 0;
let lastConnectionError = null;
const RETRY_COOLDOWN_MS = 10_000;

async function getPrismaClient() {
  if (prismaInstance) return prismaInstance;
  if (initializationPromise) return initializationPromise;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    lastConnectionError = 'DATABASE_URL não configurada';
    return null;
  }

  if (Date.now() - lastAttemptAt < RETRY_COOLDOWN_MS) return null;
  lastAttemptAt = Date.now();

  initializationPromise = (async () => {
    try {
      const { PrismaClient } = require('@prisma/client');
      const { PrismaPg } = require('@prisma/adapter-pg');
      const adapter = new PrismaPg({ connectionString: dbUrl });
      const client = new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      });

      await client.$connect();
      await client.$queryRawUnsafe('SELECT 1');
      prismaInstance = client;
      isConnected = true;
      lastConnectionError = null;
      console.log('[Database] Conexão com PostgreSQL estabelecida com sucesso.');
      return prismaInstance;
    } catch (err) {
      lastConnectionError = err.message;
      console.warn(`[Database] Falha ao conectar no PostgreSQL: ${err.message}.`);
      isConnected = false;
      prismaInstance = null;
      return null;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
}

async function checkDatabaseHealth() {
  try {
    const prisma = await getPrismaClient();
    if (!prisma) return { connected: false, error: lastConnectionError || 'PostgreSQL indisponível' };
    await prisma.$queryRaw`SELECT 1`;
    isConnected = true;
    return { connected: true, provider: 'PostgreSQL' };
  } catch (err) {
    isConnected = false;
    return { connected: false, error: err.message };
  }
}

function isDatabaseConnected() {
  return isConnected;
}

module.exports = {
  getPrismaClient,
  checkDatabaseHealth,
  isDatabaseConnected,
};
