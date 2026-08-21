// ==========================================================
// DILIGÊNCIA 360 — Serviço de Autenticação e Bootstrap (Firebase Auth)
// ==========================================================

const { UserRepository } = require('../repositories/user.repository');

const AuthService = {
  getInitialAdminEmail() {
    return (process.env.INITIAL_ADMIN_EMAIL || '').toLowerCase().trim();
  },

  async bootstrapAdmin() {
    const adminEmails = [this.getInitialAdminEmail()];
    let provisionedAdmin = null;

    for (const email of adminEmails) {
      if (!email) continue;
      const existing = await UserRepository.findByEmail(email);
      if (!existing) {
        provisionedAdmin = await UserRepository.create({
          name: (process.env.INITIAL_ADMIN_NAME || 'Administrador SUAPE').trim(),
          email,
          role: 'admin',
          active: true,
        });
        console.log(`[Auth] Administrador inicial provisionado no repositório de usuários: ${email}`);
      } else if (existing.role !== 'admin' || !existing.active) {
        provisionedAdmin = await UserRepository.update(existing.id, { role: 'admin', active: true });
        console.log(`[Auth] Administrador inicial atualizado no repositório de usuários: ${email}`);
      } else {
        provisionedAdmin = existing;
      }
    }

    return provisionedAdmin;
  },

  async ensureInitialAdmin(email) {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail || normalizedEmail !== this.getInitialAdminEmail()) return null;

    await this.bootstrapAdmin();
    return await UserRepository.findByEmail(normalizedEmail);
  },

  async getCurrentUser(userId) {
    const user = await UserRepository.findById(userId);
    if (!user || !user.active) return null;

    return {
      id: user.id,
      firebaseUid: user.firebaseUid,
      name: user.name,
      email: user.email,
      role: user.role,
      lastLoginAt: user.lastLoginAt,
    };
  },
};

module.exports = { AuthService };
