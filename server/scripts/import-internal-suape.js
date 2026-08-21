require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { getPrismaClient } = require('../src/config/database');
const { importInternalSuape } = require('../src/egos/adapters/internal-suape/internal-suape.importer');

async function main() {
  const filePath = process.argv[2] || process.env.INTERNAL_SUAPE_XLSX_PATH;
  const organization = process.env.INTERNAL_SUAPE_ORGANIZATION || 'SUAPE';
  if (!filePath) throw new Error('Informe o caminho da planilha ou configure INTERNAL_SUAPE_XLSX_PATH.');
  const prisma = await getPrismaClient();
  if (!prisma) throw new Error('PostgreSQL indisponível.');
  const result = await importInternalSuape(prisma, filePath, organization);
  console.log(`[InternalSUAPE] ${result.reused ? 'Base já importada' : 'Importação concluída'}: ${result.uniquePersonCount} pessoas, ${result.recordCount} vínculos mínimos.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(`[InternalSUAPE] Falha: ${error.message}`);
  process.exitCode = 1;
});
