// ==========================================================
// DILIGÊNCIA 360 — Rotas de Identidade e Sessão (Firebase Auth)
// ==========================================================

const express = require('express');
const { authenticate } = require('../middlewares/auth.middleware');
const { UserRepository } = require('../repositories/user.repository');

const router = express.Router();

// 1. Perfil do Usuário Autenticado
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await UserRepository.findById(req.user.id);
    if (!user || !user.active) {
      return res.status(403).json({
        ok: false,
        erro: 'Usuário não encontrado ou desativado no Diligência 360.',
      });
    }

    return res.json({
      ok: true,
      user: {
        id: user.id,
        firebaseUid: user.firebaseUid,
        name: user.name,
        email: user.email,
        role: user.role,
        active: user.active,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

// 2. Logout (Informativo, o logout real é efetuado via Firebase SDK no cliente)
router.post('/logout', (req, res) => {
  return res.json({ ok: true, message: 'Sessão encerrada com sucesso.' });
});

module.exports = router;
