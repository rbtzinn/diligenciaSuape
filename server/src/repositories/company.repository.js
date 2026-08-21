// ==========================================================
// DILIGÊNCIA 360 — Repositório de Empresas (Company Repository)
// ==========================================================

const { getPrismaClient } = require('../config/database');
const crypto = require('crypto');

const memoryCompanies = new Map();

const CompanyRepository = {
  async findOrCreate(cnpj, corporateName, tradeName = '') {
    const cleanCnpj = cnpj.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const prisma = await getPrismaClient();

    if (prisma) {
      const existing = await prisma.company.findUnique({
        where: { cnpj: cleanCnpj },
      });

      if (existing) {
        if (corporateName && existing.corporateName !== corporateName) {
          return await prisma.company.update({
            where: { id: existing.id },
            data: { corporateName, tradeName: tradeName || existing.tradeName },
          });
        }
        return existing;
      }

      return await prisma.company.create({
        data: {
          cnpj: cleanCnpj,
          corporateName: corporateName || 'Razão Social Não Informada',
          tradeName: tradeName || '',
        },
      });
    }

    if (memoryCompanies.has(cleanCnpj)) {
      return memoryCompanies.get(cleanCnpj);
    }

    const newCompany = {
      id: crypto.randomUUID(),
      cnpj: cleanCnpj,
      corporateName: corporateName || 'Razão Social Não Informada',
      tradeName: tradeName || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    memoryCompanies.set(cleanCnpj, newCompany);
    return newCompany;
  },

  async findByCnpj(cnpj) {
    const cleanCnpj = cnpj.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const prisma = await getPrismaClient();

    if (prisma) {
      return await prisma.company.findUnique({
        where: { cnpj: cleanCnpj },
        include: { diligences: { orderBy: { createdAt: 'desc' } } },
      });
    }

    return memoryCompanies.get(cleanCnpj) || null;
  },
};

module.exports = { CompanyRepository };
