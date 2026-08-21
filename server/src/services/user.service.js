// ==========================================================
// DILIGÊNCIA 360 — Serviço de Gestão de Usuários (RBAC Admin)
// ==========================================================

const { UserRepository } = require('../repositories/user.repository');
const { firebaseAuth } = require('../config/firebase-admin');

const VALID_ROLES = ['admin', 'analyst', 'reviewer', 'viewer'];

const UserService = {
  async listUsers() {
    return await UserRepository.listAll();
  },

  async createUser(adminUser, { name, email, password, role = 'analyst' }) {
    if (!name || !name.trim()) throw new Error('Nome do usuário é obrigatório.');
    if (!email || !email.includes('@')) throw new Error('E-mail corporativo válido é obrigatório.');
    if (!VALID_ROLES.includes(role)) throw new Error(`Perfil inválido. Perfis aceitos: ${VALID_ROLES.join(', ')}.`);

    const cleanEmail = email.toLowerCase().trim();
    const existing = await UserRepository.findByEmail(cleanEmail);
    if (existing) {
      throw new Error('Já existe um usuário cadastrado com este e-mail.');
    }

    let firebaseUid = null;

    // Se senha foi informada e Firebase Admin estiver disponível, provisiona no Firebase
    if (password && password.length >= 6) {
      try {
        const fbRecord = await firebaseAuth.createUser({
          email: cleanEmail,
          password,
          displayName: name.trim(),
        });
        firebaseUid = fbRecord.uid;
      } catch (fbErr) {
        // Se já existe no Firebase, busca o UID
        if (fbErr.code === 'auth/email-already-exists') {
          try {
            const existingFb = await firebaseAuth.getUserByEmail(cleanEmail);
            firebaseUid = existingFb.uid;
          } catch {}
        } else {
          console.warn('[UserService] Aviso na criação Firebase:', fbErr.message);
        }
      }
    }

    const created = await UserRepository.create({
      name: name.trim(),
      email: cleanEmail,
      firebaseUid,
      role,
      active: true,
    });

    return {
      id: created.id,
      firebaseUid: created.firebaseUid,
      name: created.name,
      email: created.email,
      role: created.role,
      active: created.active,
      createdAt: created.createdAt,
    };
  },

  async updateUser(adminUser, id, { name, role }) {
    const existing = await UserRepository.findById(id);
    if (!existing) throw new Error('Usuário não encontrado.');

    const updateData = {};
    if (name && name.trim()) updateData.name = name.trim();
    if (role && VALID_ROLES.includes(role)) updateData.role = role;

    const updated = await UserRepository.update(id, updateData);
    return {
      id: updated.id,
      firebaseUid: updated.firebaseUid,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      active: updated.active,
    };
  },

  async toggleActive(adminUser, id, active) {
    if (adminUser.id === id && !active) {
      throw new Error('Você não pode desativar seu próprio usuário administrador.');
    }

    const existing = await UserRepository.findById(id);
    if (!existing) throw new Error('Usuário não encontrado.');

    if (existing.role === 'admin' && !active) {
      const adminCount = await UserRepository.countAdmins();
      if (adminCount <= 1) {
        throw new Error('Não é possível desativar o único administrador ativo do sistema.');
      }
    }

    const updated = await UserRepository.update(id, { active: !!active });
    return {
      id: updated.id,
      firebaseUid: updated.firebaseUid,
      name: updated.name,
      email: updated.email,
      active: updated.active,
    };
  },
};

module.exports = { UserService };
