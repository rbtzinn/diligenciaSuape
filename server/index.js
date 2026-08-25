// ==========================================================
// DILIGÊNCIA 360 — Servidor Backend Node.js
// Compliance SUAPE
// ==========================================================

const path = require('path');
const dotenv = require('dotenv');

// No desenvolvimento, o arquivo de configuração fica na raiz do projeto.
// Um server/.env opcional pode sobrescrever valores apenas do backend.
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });
const app = require('./src/app');
const { checkGoogleSheetsHealth } = require('./src/config/google-sheets');

const PORT = process.env.PORT || 3000;
const CGU_API_KEY = process.env.CGU_API_KEY || '';

async function startServer() {
  const storage = await checkGoogleSheetsHealth();
  if (!storage.connected) {
    console.warn(`[GoogleSheets] O servidor iniciará em modo degradado: ${storage.message}`);
  }

  return app.listen(PORT, () => {
    console.log(`\n  Diligência 360 Backend — http://localhost:${PORT}`);
    console.log(`  CGU API: ${CGU_API_KEY ? '✓ Configurada' : '✗ Sem chave'}\n`);
    console.log(`  Histórico: ${storage.connected ? '✓ Google Sheets' : '✗ Não configurado'}\n`);
  });
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('[Server] Falha ao iniciar:', err.message);
    process.exit(1);
  });
}

// A Vercel executa o Express como uma Function e precisa receber a instância
// da aplicação. A propriedade startServer mantém o uso local e os testes.
module.exports = app;
module.exports.startServer = startServer;
