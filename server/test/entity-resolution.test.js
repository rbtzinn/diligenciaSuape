const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MATCH_LEVEL,
  buildEntityProfile,
  resolveEntityMatch,
  isAtLeast,
  distinctiveTokensOf,
  extractCnpjs,
} = require('../src/entity-resolution/entity-resolution');

// Caso real que motivou a camada: a razão social contém uma palavra comum do
// idioma, e o buscador devolvia qualquer texto que a contivesse.
const guerra = buildEntityProfile({
  cnpj: '10.811.370/0001-62',
  razaoSocial: 'GUERRA CONSTRUCOES LTDA',
  municipio: 'Recife',
  uf: 'PE',
  qsa: [
    { nome_socio: 'JOAO CARLOS GUERRA', identificador_de_socio: 2, cnpj_cpf_do_socio: '***456789**', qualificacao_socio: 'Sócio-Administrador' },
    { nome_socio: 'MARIA LUCIA GUERRA', identificador_de_socio: 2, cnpj_cpf_do_socio: '***111222**', qualificacao_socio: 'Sócia' },
  ],
});

test('perfil da entidade expõe identidade, apelidos e quadro societário', () => {
  assert.equal(guerra.cnpjNormalized, '10811370000162');
  assert.equal(guerra.cnpj, '10.811.370/0001-62');
  assert.equal(guerra.uf, 'PE');
  assert.equal(guerra.municipioNormalized, 'RECIFE');
  assert.ok(guerra.entityId.length >= 16, 'a entidade precisa de identificador estável');
  assert.ok(guerra.aliases.includes('GUERRA CONSTRUCOES LTDA'));
  assert.ok(guerra.aliases.includes('GUERRA CONSTRUCOES'), 'o nome sem o tipo societário identifica igualmente bem');
  assert.equal(guerra.socios.length, 2);
  assert.equal(guerra.socios.every((partner) => partner.naturalPerson), true);
  assert.equal(guerra.administradores.length, 1);
  // "construcoes" é termo de ramo e não distingue empresa alguma.
  assert.deepEqual(distinctiveTokensOf('GUERRA CONSTRUCOES LTDA'), ['GUERRA']);
  // O documento do sócio nunca é copiado para o perfil.
  assert.equal(JSON.stringify(guerra).includes('456789'), false);
});

test('TESTE 1 — reportagem sobre a guerra na Síria é FALSO POSITIVO', () => {
  const match = resolveEntityMatch(guerra, {
    text: 'Patrimônios da Síria foram danificados pela guerra, segundo relatório da ONU sobre o conflito.',
  });

  assert.equal(match.level, MATCH_LEVEL.FALSE_POSITIVE);
  assert.ok(match.score < 0, 'a coincidência de uma palavra precisa pontuar negativo');
  assert.equal(match.matched.cnpj, false);
  assert.equal(match.matched.corporateName, false);
  assert.ok(
    match.signals.some((signal) => signal.code === 'GENERIC_TOKEN_ONLY'),
    'o motivo do descarte precisa ficar registrado',
  );
});

test('CNPJ exato confirma a identidade sozinho', () => {
  const comPontuacao = resolveEntityMatch(guerra, {
    text: 'Contrato firmado com a empresa inscrita no CNPJ 10.811.370/0001-62 para execução de obra.',
  });
  const semPontuacao = resolveEntityMatch(guerra, {
    text: 'Fornecedor 10811370000162 consta no empenho da unidade gestora.',
  });

  assert.equal(comPontuacao.level, MATCH_LEVEL.CONFIRMED);
  assert.equal(semPontuacao.level, MATCH_LEVEL.CONFIRMED);
  assert.equal(comPontuacao.matched.cnpj, true);
});

test('razão social exata, com ou sem tipo societário, é alta confiança', () => {
  const completa = resolveEntityMatch(guerra, {
    text: 'A Guerra Construções Ltda venceu a concorrência pública.',
  });
  const semSufixo = resolveEntityMatch(guerra, {
    text: 'A Guerra Construções assinou termo aditivo com a Prefeitura.',
  });

  assert.equal(completa.level, MATCH_LEVEL.HIGH_CONFIDENCE);
  assert.equal(semSufixo.level, MATCH_LEVEL.HIGH_CONFIDENCE);
  assert.equal(semSufixo.matched.corporateName, true);
});

test('município e UF somam como âncoras, nunca confirmam sozinhos', () => {
  const soGeografia = resolveEntityMatch(guerra, {
    text: 'Recife, PE, registrou aumento no número de obras públicas neste exercício.',
  });

  assert.equal(soGeografia.level, MATCH_LEVEL.FALSE_POSITIVE);
  assert.equal(soGeografia.score, 50, 'município mais UF ficam abaixo do limiar de confirmação');
});

test('nome de sócio confirmado eleva a correspondência', () => {
  const comSocio = resolveEntityMatch(guerra, {
    text: 'A Guerra Construções tem João Carlos Guerra como responsável técnico da obra.',
  });

  assert.equal(comSocio.matched.partner, true);
  assert.equal(comSocio.matched.partnerName, 'JOAO CARLOS GUERRA');
  assert.equal(comSocio.level, MATCH_LEVEL.HIGH_CONFIDENCE);
});

test('documento que identifica outro CNPJ é descartado', () => {
  const outro = resolveEntityMatch(guerra, {
    text: 'A guerra de preços envolveu a empresa 99.999.999/0001-11, sediada em outra unidade da federação.',
  });

  assert.equal(outro.level, MATCH_LEVEL.FALSE_POSITIVE);
  assert.ok(outro.signals.some((signal) => signal.code === 'INCOMPATIBLE_IDENTIFIER'));
  assert.deepEqual(extractCnpjs('CNPJ 99.999.999/0001-11 e 10811370000162'), ['99999999000111', '10811370000162']);
});

test('nome de palavra única exige contexto empresarial no texto', () => {
  const soPalavra = buildEntityProfile({ cnpj: '11222333000181', razaoSocial: 'GUERRA LTDA' });

  const semContexto = resolveEntityMatch(soPalavra, {
    text: 'A guerra deixou milhares de desabrigados na região.',
  });
  const comContexto = resolveEntityMatch(soPalavra, {
    text: 'A empresa Guerra Ltda foi declarada vencedora da licitação.',
  });

  assert.equal(semContexto.level, MATCH_LEVEL.FALSE_POSITIVE);
  assert.ok(semContexto.signals.some((signal) => signal.code === 'NON_CORPORATE_CONTEXT'));
  assert.equal(comContexto.level, MATCH_LEVEL.HIGH_CONFIDENCE);
});

test('limite de palavra impede casar nome dentro de outra palavra', () => {
  const solimp = buildEntityProfile({ cnpj: '22333444000155', razaoSocial: 'SOLIMP TERCEIRIZACOES LTDA' });
  const sol = resolveEntityMatch(solimp, { text: 'O sol apareceu depois da chuva no litoral.' });

  assert.equal(sol.level, MATCH_LEVEL.FALSE_POSITIVE);
  assert.equal(sol.matched.corporateName, false);
});

test('contrato já confirmado da empresa serve de âncora', () => {
  const comContrato = resolveEntityMatch(guerra, {
    text: 'O termo aditivo ao contrato 21/2022 prorrogou a vigência por doze meses em Recife.',
    knownContracts: ['21/2022'],
  });

  assert.equal(comContrato.matched.knownContract, true);
  assert.equal(comContrato.score, 60, 'contrato conhecido mais município ainda dependem de confirmação nominal');
  assert.equal(comContrato.level, MATCH_LEVEL.POSSIBLE);
});

test('a ordem dos níveis é comparável sem espalhar a tabela pelo código', () => {
  assert.equal(isAtLeast(MATCH_LEVEL.CONFIRMED, MATCH_LEVEL.HIGH_CONFIDENCE), true);
  assert.equal(isAtLeast(MATCH_LEVEL.POSSIBLE, MATCH_LEVEL.HIGH_CONFIDENCE), false);
  assert.equal(isAtLeast(MATCH_LEVEL.FALSE_POSITIVE, MATCH_LEVEL.POSSIBLE), false);
});
