// ==========================================================
// DILIGÊNCIA 360 — Configuração Prisma 7
// ==========================================================

module.exports = {
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/diligencia360?schema=public',
  },
};
