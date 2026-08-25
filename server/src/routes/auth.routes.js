// ==========================================================
// DILIGÊNCIA 360 — Rotas de Identidade e Sessão (Firebase Auth)
// ==========================================================

const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// 1. Perfil do Usuário Autenticado
router.get('/me', authenticate, async (req, res) => {
  return res.json({ ok: true, user: req.user });
});

// 2. Logout (Informativo, o logout real é efetuado via Firebase SDK no cliente)
router.post('/logout', (req, res) => {
  return res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
});

module.exports = router;
