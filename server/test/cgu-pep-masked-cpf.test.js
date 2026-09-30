const test = require('node:test');
const assert = require('node:assert/strict');

// A chave é lida quando o módulo carrega; sem ela o serviço nem consulta.
process.env.CGU_API_KEY = process.env.CGU_API_KEY || 'chave-de-teste';
const CguService = require('../src/services/cgu.service');
const { maskedCpfDigits, identityByMaskedCpf } = CguService;

function pepRow(nome, cpf, orgao) {
  return { nome, cpf, descricao_funcao: 'Secretário', nome_orgao: orgao, dt_inicio_exercicio: '01/01/2023' };
}

async function withPortal(rows, run) {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, status: 200, json: async () => rows });
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

test('extrai os seis dígitos centrais do CPF mascarado ou completo', () => {
  assert.equal(maskedCpfDigits('***.123.456-**'), '123456');
  assert.equal(maskedCpfDigits('***123456**'), '123456');
  assert.equal(maskedCpfDigits('987.123.456-00'), '123456');
  assert.equal(maskedCpfDigits(''), '');
  assert.equal(maskedCpfDigits('12.345.678/0001-90'), '');
});

test('classifica a identidade pelo CPF mascarado', () => {
  assert.equal(identityByMaskedCpf('123456', '***.123.456-**'), 'CPF_CONFERE');
  assert.equal(identityByMaskedCpf('123456', '***.654.321-**'), 'CPF_DIVERGENTE');
  assert.equal(identityByMaskedCpf('', '***.123.456-**'), 'SOMENTE_NOME');
  assert.equal(identityByMaskedCpf('123456', ''), 'SOMENTE_NOME');
});

test('homônimo com CPF diferente sai dos registros e fica auditável', async () => {
  const result = await withPortal([
    pepRow('JOSE DA SILVA', '***.123.456-**', 'Prefeitura de Ipojuca'),
    pepRow('JOSE DA SILVA', '***.999.888-**', 'Câmara de Olinda'),
  ], () => CguService.getPEP('JOSE DA SILVA', '***123456**'));

  assert.equal(result.ok, true);
  assert.equal(result.quantidade, 1);
  assert.equal(result.confirmadosPorCpf, 1);
  assert.equal(result.registros[0].identidade, 'CPF_CONFERE');
  assert.equal(result.registros[0].orgao, 'Prefeitura de Ipojuca');
  assert.equal(result.descartados.length, 1);
  assert.equal(result.cpfConsultado, '***.123.456-**');
});

test('só homônimos com CPF divergente: nenhum PEP encontrado', async () => {
  const result = await withPortal([
    pepRow('JOSE DA SILVA', '***.999.888-**', 'Câmara de Olinda'),
  ], () => CguService.getPEP('JOSE DA SILVA', '***123456**'));

  assert.equal(result.encontrado, false);
  assert.equal(result.descartados.length, 1);
});

test('sem CPF do sócio, o resultado continua nominal', async () => {
  const result = await withPortal([
    pepRow('JOSE DA SILVA', '***.999.888-**', 'Câmara de Olinda'),
  ], () => CguService.getPEP('JOSE DA SILVA'));

  assert.equal(result.encontrado, true);
  assert.equal(result.confirmadosPorCpf, 0);
  assert.equal(result.registros[0].identidade, 'SOMENTE_NOME');
});
