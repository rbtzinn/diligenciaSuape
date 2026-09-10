// ==========================================================
// DILIGÊNCIA 360 — Aplicação Express (app.js)
// Modular, desacoplada e autenticada pelo Firebase
// ==========================================================

const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth.routes');
const workflowRoutes = require('./routes/workflow.routes');
const companyRoutes = require('./routes/company.routes');
const cguRoutes = require('./routes/cgu.routes');
const judicialRoutes = require('./routes/judicial.routes');
const adverseMediaRoutes = require('./routes/adverse-media.routes');
const officialGazetteRoutes = require('./routes/official-gazette.routes');
const offshoreRoutes = require('./routes/offshore.routes');
const diligenceRoutes = require('./routes/diligence.routes');
const reportRoutes = require('./routes/report.routes');
const statusRoutes = require('./routes/status.routes');
const aiRoutes = require('./routes/ai.routes');
const pncpRoutes = require('./routes/pncp.routes');

const app = express();

const configuredOrigins = String(process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  ...configuredOrigins,
]);

app.use(cors({
  credentials: true,
  exposedHeaders: ['Retry-After'],
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada pelo Diligência 360.'));
  },
}));
// Mantém margem abaixo do limite de 4,5 MB das Vercel Functions sem truncar
// dossiês ricos em evidências e relações.
app.use(express.json({ limit: '4mb' }));

const providerRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, erro: 'Limite temporário de consultas atingido. Aguarde alguns minutos.' },
});
const mediaRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, erro: 'Limite temporário de pesquisas de mídia atingido.' },
});

app.use(['/api/empresa', '/api/cgu', '/api/judicial', '/api/official-gazettes', '/api/offshore', '/api/pncp'], providerRateLimit);
app.use('/api/adverse-media', mediaRateLimit);

// A cota gratuita dos provedores de IA é diária, então o limite local é curto
// de propósito: evita torrar o saldo do dia em poucos minutos de uso.
const aiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { ok: false, erro: 'Limite temporário de análises por IA atingido. Aguarde alguns minutos.' },
});
app.use('/api/ai', aiRateLimit);

// Servir arquivos estáticos da SPA
app.use(express.static(path.join(__dirname, '..', '..', 'dist')));

// Rotas de API
app.use('/api/auth', authRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/empresa', companyRoutes);
app.use('/api/cgu', cguRoutes);
app.use('/api/judicial', judicialRoutes);
app.use('/api/adverse-media', adverseMediaRoutes);
app.use('/api/official-gazettes', officialGazetteRoutes);
app.use('/api/offshore', offshoreRoutes);
app.use('/api/diligences', diligenceRoutes);
app.use('/api/diligences', reportRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/pncp', pncpRoutes);

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      ok: false,
      erro: 'O dossiê excede o limite de 4 MB para envio. Reduza anexos ou evidências muito extensas antes de salvar.',
    });
  }
  if (err?.message === 'Origem não autorizada pelo Diligência 360.') {
    return res.status(403).json({ ok: false, erro: err.message });
  }
  console.error('[HTTP] Erro não tratado:', err?.message || 'Erro desconhecido');
  return res.status(500).json({ ok: false, erro: 'Falha interna ao processar a requisição.' });
});

// Fallback para SPA em rotas não-API
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    const distIndex = path.join(__dirname, '..', '..', 'dist', 'index.html');
    const rootIndex = path.join(__dirname, '..', '..', 'index.html');
    res.sendFile(distIndex, (err) => {
      if (err) res.sendFile(rootIndex);
    });
  }
});

module.exports = app;
