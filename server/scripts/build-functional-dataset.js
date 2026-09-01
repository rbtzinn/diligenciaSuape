#!/usr/bin/env node
// ==========================================================
// DILIGÊNCIA 360 — Gera a base funcional minimizada
// Lê a folha institucional completa e grava um CSV apenas com as
// colunas que a aplicação usa. A remuneração fica fora do arquivo
// de saída, e portanto fora do repositório.
//
// Uso:
//   node scripts/build-functional-dataset.js <folha.xlsx> [saida.csv]
// ==========================================================

const fs = require('fs');
const path = require('path');
const { readPayrollWorkbook } = require('../src/egos/adapters/internal-suape/payroll-workbook');
const { writeFunctionalDataset } = require('../src/egos/adapters/internal-suape/functional-dataset');

function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg) {
    console.error('Informe a planilha de origem. Exemplo:');
    console.error('  node scripts/build-functional-dataset.js ../folha-julho-2026.xlsx data/base-funcional.csv');
    process.exit(1);
  }

  const inputPath = path.resolve(inputArg);
  if (!fs.existsSync(inputPath)) {
    console.error(`Arquivo não encontrado: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = path.resolve(outputArg || path.join(__dirname, '..', 'data', 'base-funcional.csv'));
  const parsed = readPayrollWorkbook(fs.readFileSync(inputPath), {
    sourceName: path.basename(inputPath),
  });

  if (parsed.people.length === 0) {
    console.error('Nenhuma identidade funcional foi reconhecida na planilha.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, writeFunctionalDataset(parsed.people), 'utf8');

  console.log(`Base funcional minimizada gravada em ${outputPath}`);
  console.log(`Pessoas: ${parsed.people.length} | Competência: ${parsed.dataset.referencePeriod || 'não informada'}`);
  for (const sheet of parsed.dataset.sheets) {
    console.log(`  ${sheet.sheet}: ${sheet.people}`);
  }
  console.log('Remuneração, eventos de folha e totais não foram gravados.');
}

main();
