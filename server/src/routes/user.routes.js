// ==========================================================
// DILIGÊNCIA 360 — Rotas de Gestão de Usuários (Apenas Admin)
// ==========================================================

const express = require('express');
const { UserService } = require('../services/user.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Todas as rotas de usuários exigem perfil Administrador
router.use(authenticate);
router.use(authorize(['admin']));

router.get('/', async (req, res) => {
  try {
    const users = await UserService.listUsers();
    return res.json({ ok: true, count: users.length, items: users });
  } catch (err) {
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await UserService.createUser(req.user, req.body);
    return res.status(201).json({ ok: true, user: created });
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const updated = await UserService.updateUser(req.user, req.params.id, req.body);
    return res.json({ ok: true, user: updated });
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

router.patch('/:id/toggle-active', async (req, res) => {
  try {
    const { active } = req.body;
    const updated = await UserService.toggleActive(req.user, req.params.id, active);
    return res.json({ ok: true, user: updated });
  } catch (err) {
    return res.status(400).json({ ok: false, erro: err.message });
  }
});

module.exports = router;
