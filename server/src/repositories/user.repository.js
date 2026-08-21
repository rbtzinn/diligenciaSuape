// ==========================================================
// DILIGÊNCIA 360 — Repositório de Usuários (Firebase + PostgreSQL)
// ==========================================================

const { getPrismaClient } = require('../config/database');
const crypto = require('crypto');

const memoryUsers = new Map();

const UserRepository = {
  async findByFirebaseUid(firebaseUid) {
    if (!firebaseUid) return null;

    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.findUnique({
        where: { firebaseUid },
      });
    }

    return Array.from(memoryUsers.values()).find((u) => u.firebaseUid === firebaseUid) || null;
  },

  async findByEmail(email) {
    if (!email) return null;
    const cleanEmail = email.toLowerCase().trim();

    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.findUnique({
        where: { email: cleanEmail },
      });
    }

    return Array.from(memoryUsers.values()).find((u) => u.email === cleanEmail) || null;
  },

  async findById(id) {
    if (!id) return null;

    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.findUnique({
        where: { id },
      });
    }

    return memoryUsers.get(id) || null;
  },

  async linkFirebaseUid(id, firebaseUid) {
    return await this.update(id, { firebaseUid });
  },

  async create(userData) {
    const id = userData.id || crypto.randomUUID();
    const cleanEmail = userData.email.toLowerCase().trim();

    const data = {
      id,
      firebaseUid: userData.firebaseUid || null,
      name: userData.name,
      email: cleanEmail,
      passwordHash: userData.passwordHash || null,
      role: userData.role || 'analyst',
      active: userData.active !== false,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null,
    };

    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.create({ data });
    }

    memoryUsers.set(id, data);
    return data;
  },

  async update(id, updateData) {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.update({
        where: { id },
        data: { ...updateData, updatedAt: new Date() },
      });
    }

    const current = memoryUsers.get(id);
    if (!current) return null;

    const updated = { ...current, ...updateData, updatedAt: new Date() };
    memoryUsers.set(id, updated);
    return updated;
  },

  async listAll() {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          firebaseUid: true,
          name: true,
          email: true,
          role: true,
          active: true,
          createdAt: true,
          updatedAt: true,
          lastLoginAt: true,
        },
      });
    }

    return Array.from(memoryUsers.values())
      .map(({ passwordHash, ...safeUser }) => safeUser)
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  async countAdmins() {
    const prisma = await getPrismaClient();
    if (prisma) {
      return await prisma.user.count({
        where: { role: 'admin', active: true },
      });
    }

    return Array.from(memoryUsers.values()).filter(
      (u) => u.role === 'admin' && u.active
    ).length;
  },
};

module.exports = { UserRepository };
