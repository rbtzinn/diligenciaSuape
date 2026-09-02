const test = require('node:test');
const assert = require('node:assert/strict');
const AdmZip = require('adm-zip');

const { readPayrollWorkbook, employmentTypeFrom, referencePeriodFrom } = require('../src/egos/adapters/internal-suape/payroll-workbook');

// Monta um XLSX mínimo com a mesma estrutura da folha institucional:
// cabeçalho de identidade e de folha, linha da pessoa e linhas de evento.
function buildWorkbook(sheets) {
  const zip = new AdmZip();
  const strings = [];
  const stringIndex = new Map();
  const internString = (value) => {
    if (!stringIndex.has(value)) {
      stringIndex.set(value, strings.length);
      strings.push(value);
    }
    return stringIndex.get(value);
  };

  const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];
  const sheetXml = sheets.map((sheet) => {
    const rows = sheet.rows.map((cells, rowIndex) => {
      const encoded = cells.map((value, columnIndex) => {
        if (value === null || value === undefined || value === '') return '';
        const reference = `${columns[columnIndex]}${rowIndex + 1}`;
        if (typeof value === 'number') return `<c r="${reference}"><v>${value}</v></c>`;
        return `<c r="${reference}" t="s"><v>${internString(String(value))}</v></c>`;
      }).join('');
      return `<row r="${rowIndex + 1}">${encoded}</row>`;
    }).join('');
    return `<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
  });

  sheets.forEach((_, index) => {
    zip.addFile(`xl/worksheets/sheet${index + 1}.xml`, Buffer.from(sheetXml[index], 'utf8'));
  });

  const sheetTags = sheets
    .map((sheet, index) => `<sheet name="${sheet.name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');
  zip.addFile('xl/workbook.xml', Buffer.from(`<?xml version="1.0"?><workbook><sheets>${sheetTags}</sheets></workbook>`, 'utf8'));

  const relTags = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join('');
  zip.addFile('xl/_rels/workbook.xml.rels', Buffer.from(`<?xml version="1.0"?><Relationships>${relTags}</Relationships>`, 'utf8'));

  const stringTags = strings.map((value) => `<si><t>${value.replace(/&/g, '&amp;')}</t></si>`).join('');
  zip.addFile('xl/sharedStrings.xml', Buffer.from(`<?xml version="1.0"?><sst>${stringTags}</sst>`, 'utf8'));

  return zip.toBuffer();
}

const HEADER = ['NOME', 'CHAPA', 'CPF', 'TIPO DE FUNCIONÁRIO', 'DESCRIÇÃO DO EVENTO', 'PERIÓDO', 'ANO COMPETÊNCIA', 'MÊS COMPETÊNCIA', 'PROVENTO/DESCONTO/BASE', 'SALÁRIO', 'VALOR DA FICHA'];

test('folha institucional entrega identidade funcional e descarta remuneração', () => {
  const buffer = buildWorkbook([
    {
      name: 'FUNCIONÁRIO JULHO 2026',
      rows: [
        ['', '', '', '', '', '', '', '', '', '', 'TOTAIS'],
        HEADER,
        ['ADRIANO ALVES DE ALENCAR', '0001405', '***.509.434-**', 'N', '1- 0001 - SALARIO', 1, 2026, 7, 'P', 5246.9, 5246.9],
        ['', '', '', '', '1- 0039 - ADICIONAL', 1, 2026, 7, 'P', 5246.9, 1574.07],
        ['MARIA DAS DORES SILVA', '0002200', '***.111.222-**', 'N', '1- 0001 - SALARIO', 1, 2026, 7, 'P', 9000, 9000],
      ],
    },
    {
      name: 'CONSELHO ADM JULHO 2026',
      rows: [
        HEADER,
        ['CASEMIRO TERCIO DOS REIS LIMA CARVALHO', '0002069', '***.431.528-**', 'A', '1- 0770 - GRATIF CONSELHO', 3, 2026, 7, 'P', 0, 5036.21],
      ],
    },
  ]);

  const result = readPayrollWorkbook(buffer, { sourceName: 'Base de teste' });

  assert.equal(result.people.length, 3);
  assert.equal(result.dataset.referencePeriod, '07/2026');
  assert.equal(result.dataset.payrollValuesImported, false);

  const [first] = result.people;
  assert.equal(first.name, 'ADRIANO ALVES DE ALENCAR');
  assert.equal(first.employeeKey, '0001405');
  assert.equal(first.maskedCpf, '***.509.434-**');
  assert.deepEqual(Object.keys(first).sort(), ['affiliations', 'employeeKey', 'maskedCpf', 'name']);
  assert.equal(first.affiliations[0].employmentType, 'Efetivo');
  assert.equal(first.affiliations[0].sourceSheet, 'FUNCIONÁRIO JULHO 2026');

  const counselor = result.people.find((person) => person.employeeKey === '0002069');
  assert.equal(counselor.affiliations[0].employmentType, 'Conselho de Administração');

  // Nenhum valor de folha pode sobreviver à leitura.
  const serialized = JSON.stringify(result);
  assert.equal(/5246\.9|9000|5036\.21|1574\.07/.test(serialized), false);
  assert.equal(/SALARIO|GRATIF|ADICIONAL/i.test(serialized), false);
});

test('linha sem CPF mascarado não vira pessoa', () => {
  const buffer = buildWorkbook([
    {
      name: 'FUNCIONÁRIO JULHO 2026',
      rows: [
        HEADER,
        ['TOTAL GERAL', '', '', '', '', '', 2026, 7, '', 0, 100],
        ['PESSOA VALIDA', '0009', '***.777.888-**', 'N', '', 1, 2026, 7, 'P', 1, 1],
      ],
    },
  ]);

  const result = readPayrollWorkbook(buffer, { sourceName: 'Base de teste' });
  assert.equal(result.people.length, 1);
  assert.equal(result.people[0].name, 'PESSOA VALIDA');
});

test('tipo de vínculo vem da planilha e cai no código quando a planilha é genérica', () => {
  assert.equal(employmentTypeFrom('COMISSIONADOS JULHO 2026', 'N'), 'Comissionado');
  assert.equal(employmentTypeFrom('CEDIDOS JULHO 2026', 'N'), 'Cedido');
  assert.equal(employmentTypeFrom('COMITE DE AUD. JULHO 2026', ''), 'Comitê de Auditoria');
  assert.equal(employmentTypeFrom('BASE GERAL', 'C'), 'Comissionado');
  assert.equal(employmentTypeFrom('BASE GERAL', ''), 'Vínculo institucional');
});

test('competência exige ano e mês numéricos', () => {
  assert.equal(referencePeriodFrom('2026', '7'), '07/2026');
  assert.equal(referencePeriodFrom('', '7'), null);
  assert.equal(referencePeriodFrom('2026', 'julho'), null);
});

test('base minimizada faz a volta completa sem carregar remuneração', () => {
  const { readFunctionalDataset, writeFunctionalDataset } = require('../src/egos/adapters/internal-suape/functional-dataset');

  const csv = writeFunctionalDataset([
    {
      employeeKey: '0001405',
      name: 'ADRIANO ALVES DE ALENCAR',
      maskedCpf: '***.509.434-**',
      affiliations: [{ employmentType: 'Efetivo', referencePeriod: '07/2026', sourceSheet: 'FUNCIONÁRIO JULHO 2026' }],
    },
    {
      employeeKey: '0002069',
      name: 'PESSOA COM, VÍRGULA',
      maskedCpf: '***.431.528-**',
      affiliations: [{ employmentType: 'Conselho de Administração', referencePeriod: '07/2026', sourceSheet: 'CONSELHO ADM JULHO 2026' }],
    },
  ]);

  assert.match(csv.split('\n')[0], /^nome,chapa,cpf_mascarado,tipo_vinculo,competencia,origem$/);
  assert.match(csv, /"PESSOA COM, VÍRGULA"/);

  const parsed = readFunctionalDataset(csv, { sourceName: 'Base de teste' });
  assert.equal(parsed.people.length, 2);
  assert.equal(parsed.dataset.referencePeriod, '07/2026');
  assert.equal(parsed.dataset.payrollValuesImported, false);
  assert.equal(parsed.people[1].name, 'PESSOA COM, VÍRGULA');
  assert.equal(parsed.people[1].affiliations[0].employmentType, 'Conselho de Administração');
});

test('base minimizada descarta linha sem CPF mascarado', () => {
  const { readFunctionalDataset } = require('../src/egos/adapters/internal-suape/functional-dataset');
  const csv = [
    'nome,chapa,cpf_mascarado,tipo_vinculo,competencia,origem',
    'TOTAL GERAL,,,Efetivo,07/2026,FOLHA',
    'PESSOA VALIDA,0009,***.777.888-**,Efetivo,07/2026,FOLHA',
  ].join('\n');

  const parsed = readFunctionalDataset(csv, { sourceName: 'Base de teste' });
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.people[0].name, 'PESSOA VALIDA');
});

test('base embutida como módulo preserva o conteúdo e escapa interpolação', () => {
  const { wrapAsModule, readFunctionalDataset } = require('../src/egos/adapters/internal-suape/functional-dataset');

  const csv = [
    'nome,chapa,cpf_mascarado,tipo_vinculo,competencia,origem',
    'PESSOA `COM` ${CRASE},0009,***.777.888-**,Efetivo,07/2026,FOLHA',
  ].join('\n');

  const moduleSource = wrapAsModule(csv, { referencePeriod: '07/2026', people: 1 });
  const sandboxModule = { exports: {} };
  new Function('module', 'exports', moduleSource)(sandboxModule, sandboxModule.exports);

  assert.equal(sandboxModule.exports.referencePeriod, '07/2026');
  assert.equal(sandboxModule.exports.csv, csv);

  const parsed = readFunctionalDataset(sandboxModule.exports.csv, { sourceName: 'Base de teste' });
  assert.equal(parsed.people.length, 1);
  assert.equal(parsed.people[0].name, 'PESSOA `COM` ${CRASE}');
});
