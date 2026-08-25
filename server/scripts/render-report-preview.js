const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const { DiligenceHistoryService } = require('../src/services/diligence-history.service');
const { ReportGenerator } = require('../src/services/report/report-generator');
const { generateReportNumber, sanitizeFileName } = require('../src/services/report/report-formatter');

async function main() {
  const diligenceId = process.argv[2];
  if (!diligenceId) throw new Error('Informe o identificador da diligência.');

  const diligence = await DiligenceHistoryService.getDiligenceById(diligenceId);
  if (!diligence) throw new Error(`Diligência não encontrada: ${diligenceId}`);

  const reportNumber = generateReportNumber(diligence.id);
  const { buffer } = await ReportGenerator.generateBuffer(diligence, reportNumber, true);
  const outputDir = path.join(__dirname, '..', '..', 'output', 'pdf');
  const outputPath = path.join(
    outputDir,
    `${reportNumber}_${sanitizeFileName(diligence.razaoSocial)}_PREVIA.pdf`
  );

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, buffer);
  process.stdout.write(`${outputPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
