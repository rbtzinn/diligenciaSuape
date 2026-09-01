// ==========================================================
// DILIGÊNCIA 360 — Base funcional interna
// Carrega a identidade funcional a partir de uma planilha autorizada,
// apontada por INTERNAL_SUAPE_DATASET_PATH. Sem a variável, a base
// permanece indisponível e o painel mostra "não importada".
//
// A leitura descarta remuneração na origem: ver payroll-workbook.js.
// ==========================================================

const fs = require('fs');
const path = require('path');
const { readPayrollWorkbook } = require('./payroll-workbook');
const { readFunctionalDataset } = require('./functional-dataset');

const cache = new Map();

// Raiz do backend: server/src/egos/adapters/internal-suape -> server
const SERVER_ROOT = path.resolve(__dirname, '../../../..');

/**
 * Caminho absoluto continua valendo para execução local.
 * Caminho relativo é resolvido a partir da raiz do backend, e não do
 * diretório de trabalho, porque em ambiente serverless o processo não
 * roda necessariamente na pasta do projeto.
 */
function datasetPath() {
  const configured = String(process.env.INTERNAL_SUAPE_DATASET_PATH || '').trim();
  if (!configured) return '';
  return path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(SERVER_ROOT, configured);
}

function unavailable(message) {
  return { available: false, people: [], dataset: null, message };
}

const InternalSuapeProvider = {
  async load(organization = 'SUAPE') {
    const filePath = datasetPath();
    if (!filePath) {
      return unavailable('Nenhuma base interna autorizada está configurada nesta implantação.');
    }

    let stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return unavailable(`Base funcional não encontrada em ${path.basename(filePath)}.`);
    }

    const cacheKey = `${filePath}:${stats.mtimeMs}:${stats.size}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    try {
      const buffer = fs.readFileSync(filePath);
      const sourceName = `Base funcional ${organization} — ${path.basename(filePath)}`;
      // CSV é o formato minimizado, gerado por scripts/build-functional-dataset.js.
      // XLSX é a folha institucional original, de onde a remuneração é descartada.
      const parsed = path.extname(filePath).toLowerCase() === '.csv'
        ? readFunctionalDataset(buffer.toString('utf8'), { sourceName })
        : readPayrollWorkbook(buffer, { sourceName });

      if (parsed.people.length === 0) {
        return unavailable('A base funcional foi lida, mas nenhuma identidade funcional foi reconhecida.');
      }

      const result = {
        available: true,
        people: parsed.people,
        dataset: parsed.dataset,
      };
      cache.clear();
      cache.set(cacheKey, result);
      return result;
    } catch (error) {
      return unavailable(`Falha ao ler a base funcional: ${error.message}`);
    }
  },
};

module.exports = { InternalSuapeProvider };
