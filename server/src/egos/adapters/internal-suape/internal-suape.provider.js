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

const cache = new Map();

function datasetPath() {
  const configured = String(process.env.INTERNAL_SUAPE_DATASET_PATH || '').trim();
  return configured ? path.resolve(configured) : '';
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
      const parsed = readPayrollWorkbook(buffer, {
        sourceName: `Base funcional ${organization} — ${path.basename(filePath)}`,
      });

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
