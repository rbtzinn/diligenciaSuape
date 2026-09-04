// ==========================================================
// DILIGÊNCIA 360 — Resolução de identidade da entidade investigada
// ==========================================================
// Camada central de identidade. Toda fonte que devolve texto livre (mídia,
// diário oficial, edital, processo de controle externo) precisa responder antes
// de qualquer análise: o documento fala DESTA empresa?
//
// A regra que motiva este módulo: uma palavra da razão social não identifica
// ninguém. "GUERRA CONSTRUCOES LTDA" e uma reportagem sobre a guerra na Síria
// compartilham o token "guerra" e absolutamente mais nada. Sem esta camada, o
// dossiê registrava a reportagem como ocorrência da empresa.
//
// A confirmação segue a ordem de força declarada pela metodologia:
//   1. CNPJ exato                          → CONFIRMED
//   2. razão social exata + contexto        → HIGH_CONFIDENCE
//   3. razão social + município/UF          → HIGH_CONFIDENCE
//   4. razão social + sócio                 → HIGH_CONFIDENCE
//   5. nome semelhante                      → POSSIBLE
//   6. só token genérico da razão social     → FALSE_POSITIVE
//
// Nada aqui afirma irregularidade: o módulo responde apenas "é a mesma
// empresa?", que é pergunta anterior a qualquer achado.
// ==========================================================

const crypto = require('crypto');

/** Níveis de confirmação de identidade. */
const MATCH_LEVEL = Object.freeze({
  CONFIRMED: 'CONFIRMED',
  HIGH_CONFIDENCE: 'HIGH_CONFIDENCE',
  POSSIBLE: 'POSSIBLE',
  FALSE_POSITIVE: 'FALSE_POSITIVE',
});

const LEVEL_RANK = Object.freeze({
  FALSE_POSITIVE: 0,
  POSSIBLE: 1,
  HIGH_CONFIDENCE: 2,
  CONFIRMED: 3,
});

// Pontuação declarada na metodologia de diligência. Mantida explícita para que
// o peso de cada sinal possa ser auditado sem ler o algoritmo.
const WEIGHTS = Object.freeze({
  EXACT_CNPJ: 100,
  EXACT_CORPORATE_NAME: 80,
  ABBREVIATED_CORPORATE_NAME: 80,
  EXACT_TRADE_NAME: 45,
  WEAK_SINGLE_TOKEN_NAME: 40,
  MUNICIPALITY: 30,
  STATE: 20,
  PARTNER_NAME: 30,
  KNOWN_CONTRACT: 30,
  GENERIC_TOKEN_ONLY: -100,
  NON_CORPORATE_CONTEXT: -100,
  INCOMPATIBLE_IDENTIFIER: -100,
});

const SCORE_THRESHOLD = Object.freeze({
  HIGH_CONFIDENCE: 80,
  POSSIBLE: 40,
});

// Sufixo societário não distingue empresa alguma.
const CORPORATE_SUFFIX_PATTERN =
  /\b(LTDA|LIMITADA|EIRELI|SLU|MEI|ME|EPP|S\s*A|SA|SOCIEDADE\s+ANONIMA|SOCIEDADE\s+SIMPLES|CIA|COMPANHIA)\b/g;

// Termos de ramo. Aparecem em milhares de razões sociais e, sozinhos, não
// identificam nada: "construcoes", "servicos", "comercio".
const GENERIC_BUSINESS_TOKENS = new Set([
  'CONSTRUCAO', 'CONSTRUCOES', 'CONSTRUTORA', 'ENGENHARIA', 'EMPREENDIMENTOS',
  'EMPREITEIRA', 'SERVICO', 'SERVICOS', 'COMERCIO', 'COMERCIAL', 'INDUSTRIA',
  'INDUSTRIAL', 'DISTRIBUIDORA', 'TRANSPORTE', 'TRANSPORTES', 'LOGISTICA',
  'TERCEIRIZACAO', 'TERCEIRIZACOES', 'PARTICIPACOES', 'HOLDING', 'GRUPO',
  'ADMINISTRACAO', 'ASSESSORIA', 'CONSULTORIA', 'TECNOLOGIA', 'SISTEMAS',
  'SOLUCOES', 'PROJETOS', 'OBRAS', 'MANUTENCAO', 'LOCACAO', 'LOCACOES',
  'REPRESENTACOES', 'IMPORTACAO', 'EXPORTACAO', 'ALIMENTOS', 'MATERIAIS',
  'EQUIPAMENTOS', 'PRODUTOS', 'MAO', 'OBRA', 'GERAL', 'GERAIS', 'BRASIL',
  'NACIONAL', 'DO', 'DA', 'DE', 'DOS', 'DAS', 'E',
]);

// Palavras comuns do português que também batizam empresas. Quando a razão
// social se reduz a uma delas, a correspondência textual isolada é ruído:
// "guerra", "sol", "vitória" aparecem em qualquer notícia.
const COMMON_WORD_TOKENS = new Set([
  'GUERRA', 'PAZ', 'SOL', 'LUZ', 'LUA', 'CAMPO', 'CAMPOS', 'MONTE', 'SERRA',
  'VALE', 'RIO', 'MAR', 'NORTE', 'SUL', 'LESTE', 'OESTE', 'CENTRO', 'FORTE',
  'REAL', 'NOVO', 'NOVA', 'BOA', 'BOM', 'PRIMAVERA', 'VERAO', 'INVERNO',
  'OUTONO', 'ESTRELA', 'AURORA', 'VITORIA', 'UNIAO', 'PROGRESSO', 'FUTURO',
  'HORIZONTE', 'ALIANCA', 'ESPERANCA', 'PONTE', 'PORTO', 'PRAIA', 'ILHA',
]);

// Marcadores de contexto empresarial/contratual. A presença de qualquer um
// indica que o texto trata de uma pessoa jurídica, e não de um substantivo
// comum homônimo.
const CORPORATE_CONTEXT_MARKERS = [
  'LTDA', 'EIRELI', 'S A', 'SA', 'CNPJ', 'EMPRESA', 'EMPRESAS', 'CONSTRUTORA',
  'EMPREITEIRA', 'FORNECEDOR', 'FORNECEDORA', 'CONTRATADA', 'CONTRATANTE',
  'CONTRATO', 'CONTRATOS', 'ADITIVO', 'LICITACAO', 'LICITATORIO', 'PREGAO',
  'EDITAL', 'CONCORRENCIA', 'TOMADA DE PRECOS', 'DISPENSA', 'INEXIGIBILIDADE',
  'RAZAO SOCIAL', 'SOCIEDADE', 'SOCIO', 'SOCIOS', 'MATRIZ', 'FILIAL',
  'PREFEITURA', 'SECRETARIA', 'ORGAO', 'AUTARQUIA', 'ADMINISTRACAO PUBLICA',
  'DIARIO OFICIAL', 'PORTARIA', 'OBRA', 'OBRAS', 'SERVICOS',
];

const UF_CODES = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

// ---------------------------------------------------------
// Normalização
// ---------------------------------------------------------

/** Caixa alta, sem acento e sem pontuação, para comparação textual estável. */
function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function formatCnpj(value) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return '';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function stripCorporateSuffix(normalizedName) {
  return normalizedName.replace(CORPORATE_SUFFIX_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Frase inteira, respeitando limite de palavra. `includes` cru casaria "SOL"
 * dentro de "SOLIMP" e produziria exatamente o falso positivo que este módulo
 * existe para impedir.
 */
function containsPhrase(normalizedHaystack, normalizedNeedle) {
  if (!normalizedNeedle) return false;
  return ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `);
}

function tokensOf(normalizedName) {
  return normalizedName.split(' ').filter(Boolean);
}

/** Tokens que efetivamente identificam a empresa: sem sufixo, sem termo de ramo. */
function distinctiveTokensOf(normalizedName) {
  return tokensOf(stripCorporateSuffix(normalizedName))
    .filter((token) => token.length >= 3 && !GENERIC_BUSINESS_TOKENS.has(token));
}

/**
 * Prefixos da razão social com pelo menos dois termos, do mais longo ao mais
 * curto. Registro oficial abrevia nome empresarial pelo fim: o TCE-PE inscreve
 * "SOLIMP TERCEIRIZACOES" para "SOLIMP TERCEIRIZACOES DE MAO DE OBRA LTDA".
 *
 * O piso de dois termos é o que separa abreviação de coincidência. Uma palavra
 * só — "guerra" — não é nome empresarial encurtado, é substantivo solto; foi
 * exatamente por essa fresta que a reportagem sobre a Síria entrou no dossiê.
 */
function corporateNamePrefixes(normalizedName) {
  const tokens = tokensOf(stripCorporateSuffix(normalizedName));
  const prefixes = [];
  for (let length = tokens.length - 1; length >= 2; length -= 1) {
    prefixes.push(tokens.slice(0, length).join(' '));
  }
  return prefixes;
}

function stableId(...parts) {
  return crypto
    .createHash('sha256')
    .update(parts.map((part) => String(part ?? '')).join('|'))
    .digest('hex')
    .slice(0, 24);
}

/** Pessoa física no QSA. Sócio pessoa jurídica não é nome de gente. */
function isNaturalPerson(shareholder) {
  const document = onlyDigits(shareholder?.cnpj_cpf_do_socio ?? shareholder?.cpfCnpj ?? shareholder?.documento);
  const rawDocument = String(shareholder?.cnpj_cpf_do_socio ?? shareholder?.cpfCnpj ?? '');
  const identifier = String(shareholder?.identificador_de_socio ?? shareholder?.partnerType ?? '').trim();
  const name = normalize(shareholder?.nome_socio ?? shareholder?.name ?? shareholder?.nome);
  if (!name) return false;
  if (identifier === '1') return false;
  if (identifier === '2') return true;
  if (document.length === 14 && !rawDocument.includes('*')) return false;
  return !/\b(LTDA|LIMITADA|EIRELI|SA|S A|SOCIEDADE|COMPANHIA|CIA|EMPRESA|HOLDING|PARTICIPACOES|FUNDO|BANCO|INSTITUTO|ASSOCIACAO)\b/.test(name);
}

// ---------------------------------------------------------
// Perfil da entidade
// ---------------------------------------------------------

/**
 * Monta o perfil canônico da entidade investigada. É o objeto que todas as
 * fontes devem receber para decidir se um documento é dela.
 *
 * @param {object} input dados cadastrais e QSA, em qualquer das grafias usadas
 *   no projeto (`razaoSocial`/`razao_social`, `socios`/`qsa`/`shareholders`).
 * @returns {object} perfil imutável.
 */
function buildEntityProfile(input = {}) {
  const razaoSocial = String(input.razaoSocial ?? input.razao_social ?? '').replace(/\s+/g, ' ').trim();
  const nomeFantasia = String(input.nomeFantasia ?? input.nome_fantasia ?? '').replace(/\s+/g, ' ').trim();
  const cnpjNormalized = onlyDigits(input.cnpj);
  const municipio = String(input.municipio ?? input.municipality ?? '').replace(/\s+/g, ' ').trim();
  const ufRaw = normalize(input.uf ?? input.state ?? '');
  const uf = UF_CODES.has(ufRaw) ? ufRaw : '';

  const normalizedRazao = normalize(razaoSocial);
  const normalizedFantasia = normalize(nomeFantasia);
  const razaoSemSufixo = stripCorporateSuffix(normalizedRazao);
  const distinctiveTokens = distinctiveTokensOf(normalizedRazao);

  // Apelidos com força de razão social: a grafia completa e a mesma grafia sem
  // o tipo societário. O diário oficial escreve "GUERRA CONSTRUCOES", não
  // "GUERRA CONSTRUCOES LTDA"; as duas identificam a empresa igualmente bem.
  const corporateAliases = [];
  const pushAlias = (value) => {
    const normalized = normalize(value);
    if (!normalized || corporateAliases.includes(normalized)) return;
    corporateAliases.push(normalized);
  };
  pushAlias(normalizedRazao);
  pushAlias(razaoSemSufixo);
  for (const extra of Array.isArray(input.aliases) ? input.aliases : []) pushAlias(extra);

  // Nome fantasia é apelido mais fraco: costuma ser curto e colidir com palavra
  // comum, então recebe peso próprio e nunca o de razão social.
  const tradeAliases = [];
  if (normalizedFantasia && !corporateAliases.includes(normalizedFantasia)) {
    tradeAliases.push(normalizedFantasia);
    const fantasiaSemSufixo = stripCorporateSuffix(normalizedFantasia);
    if (fantasiaSemSufixo && fantasiaSemSufixo !== normalizedFantasia) tradeAliases.push(fantasiaSemSufixo);
  }

  const rawPartners = Array.isArray(input.socios) ? input.socios
    : Array.isArray(input.shareholders) ? input.shareholders
      : Array.isArray(input.qsa) ? input.qsa : [];

  const seenPartners = new Set();
  const socios = [];
  for (const partner of rawPartners) {
    const name = String(partner?.nome_socio ?? partner?.name ?? partner?.nome ?? '').replace(/\s+/g, ' ').trim();
    const normalizedName = normalize(name);
    if (!normalizedName || seenPartners.has(normalizedName)) continue;
    seenPartners.add(normalizedName);
    socios.push(Object.freeze({
      name,
      normalizedName,
      qualification: String(partner?.qualificacao_socio ?? partner?.qualification ?? '').trim() || null,
      naturalPerson: isNaturalPerson(partner),
      // Documento nunca é copiado em claro: só a marcação de existência.
      hasDocument: Boolean(onlyDigits(partner?.cnpj_cpf_do_socio ?? partner?.cpfCnpj)),
    }));
  }

  // Administrador é o subconjunto do QSA cuja qualificação indica gestão.
  const administradores = socios.filter((partner) => (
    /ADMINISTRADOR|DIRETOR|PRESIDENTE|GERENTE|GESTOR|SOCIO ADMIN/.test(normalize(partner.qualification))
  ));

  return Object.freeze({
    entityId: stableId('entity', cnpjNormalized || normalizedRazao || normalizedFantasia),
    cnpj: formatCnpj(cnpjNormalized) || String(input.cnpj ?? '').trim(),
    cnpjNormalized,
    razaoSocial,
    nomeFantasia,
    aliases: Object.freeze([...corporateAliases, ...tradeAliases]),
    corporateAliases: Object.freeze(corporateAliases),
    tradeAliases: Object.freeze(tradeAliases),
    municipio,
    municipioNormalized: normalize(municipio),
    uf,
    socios: Object.freeze(socios),
    administradores: Object.freeze(administradores),
    distinctiveTokens: Object.freeze(distinctiveTokens),
    // Prefixos válidos da razão social, para reconhecer o nome abreviado que os
    // registros oficiais usam sem aceitar palavra solta.
    namePrefixes: Object.freeze(corporateNamePrefixes(normalizedRazao)),
    // Nome que se resume a um único token exige âncora externa para confirmar.
    singleTokenName: distinctiveTokens.length <= 1,
  });
}

// ---------------------------------------------------------
// Resolução de correspondência
// ---------------------------------------------------------

function hasCorporateContext(normalizedText) {
  return CORPORATE_CONTEXT_MARKERS.some((marker) => containsPhrase(normalizedText, marker));
}

/** CNPJs bem formados citados no texto, com ou sem pontuação. */
function extractCnpjs(rawText) {
  const text = String(rawText ?? '');
  const found = new Set();
  const punctuated = text.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g) || [];
  for (const value of punctuated) found.add(onlyDigits(value));
  const bare = text.match(/(?<!\d)\d{14}(?!\d)/g) || [];
  for (const value of bare) found.add(value);
  return [...found];
}

/**
 * Decide se um documento textual pertence à entidade investigada.
 *
 * @param {object} profile perfil de `buildEntityProfile`.
 * @param {object} evidence
 * @param {string} evidence.text texto integral disponível (título + trecho).
 * @param {string} [evidence.municipio] município declarado pela fonte.
 * @param {string} [evidence.uf] UF declarada pela fonte.
 * @param {string[]} [evidence.knownContracts] números de contrato já confirmados
 *   da empresa; citá-los é âncora forte.
 * @returns {object} nível, pontuação, sinais e base textual da decisão.
 */
function resolveEntityMatch(profile, evidence = {}) {
  const rawText = [evidence.text, evidence.title, evidence.snippet].filter(Boolean).join(' ');
  const normalizedText = normalize(rawText);
  const textDigits = String(rawText).replace(/\D/g, '');
  const signals = [];
  let score = 0;

  const add = (code, label, points, detail) => {
    score += points;
    signals.push({ code, label, points, matched: points > 0, detail: detail || undefined });
  };

  // 1. CNPJ exato — o único identificador que confirma sozinho.
  const cnpjMatch = Boolean(profile.cnpjNormalized.length === 14 && textDigits.includes(profile.cnpjNormalized));
  if (cnpjMatch) add('EXACT_CNPJ', 'CNPJ da empresa citado no documento', WEIGHTS.EXACT_CNPJ, profile.cnpj);

  // 2. Razão social exata (com ou sem o tipo societário).
  const corporateAliasHit = profile.corporateAliases.find((alias) => (
    alias.length >= 3 && containsPhrase(normalizedText, alias)
  )) || '';
  const tradeAliasHit = profile.tradeAliases.find((alias) => (
    alias.length >= 4 && containsPhrase(normalizedText, alias)
  )) || '';

  const corporateContext = hasCorporateContext(normalizedText);
  // Nome de uma palavra só: sem contexto empresarial no texto, a coincidência
  // não distingue a empresa de um substantivo qualquer.
  const weakSingleToken = Boolean(corporateAliasHit)
    && profile.singleTokenName
    && (COMMON_WORD_TOKENS.has(corporateAliasHit) || corporateAliasHit.length < 5)
    && !corporateContext
    && !cnpjMatch;

  if (corporateAliasHit && !weakSingleToken) {
    add('EXACT_CORPORATE_NAME', 'Razão social citada integralmente', WEIGHTS.EXACT_CORPORATE_NAME, corporateAliasHit);
  } else if (corporateAliasHit) {
    add(
      'WEAK_SINGLE_TOKEN_NAME',
      'Nome empresarial de palavra única, sem contexto empresarial no texto',
      WEIGHTS.WEAK_SINGLE_TOKEN_NAME,
      corporateAliasHit,
    );
  }
  // 2b. Razão social abreviada, como os registros oficiais a inscrevem.
  // Só vale quando nenhum apelido completo casou e o prefixo carrega ao menos um
  // termo distintivo — do contrário seria coincidência de palavra de ramo.
  const prefixHit = corporateAliasHit ? '' : (profile.namePrefixes || []).find((prefix) => (
    containsPhrase(normalizedText, prefix)
    && tokensOf(prefix).some((token) => profile.distinctiveTokens.includes(token))
  )) || '';
  if (prefixHit) {
    add(
      'ABBREVIATED_CORPORATE_NAME',
      'Razão social citada de forma abreviada',
      WEIGHTS.ABBREVIATED_CORPORATE_NAME,
      prefixHit,
    );
  }

  if (tradeAliasHit) {
    add('EXACT_TRADE_NAME', 'Nome fantasia citado integralmente', WEIGHTS.EXACT_TRADE_NAME, tradeAliasHit);
  }

  const exactNameMatch = Boolean(corporateAliasHit || tradeAliasHit || prefixHit);

  // 3. Âncoras geográficas.
  const municipalityMatch = Boolean(
    profile.municipioNormalized.length >= 3
    && containsPhrase(normalizedText, profile.municipioNormalized),
  );
  if (municipalityMatch) add('MUNICIPALITY', 'Município da empresa citado', WEIGHTS.MUNICIPALITY, profile.municipio);

  const stateMatch = Boolean(profile.uf && containsPhrase(normalizedText, profile.uf));
  if (stateMatch) add('STATE', 'UF da empresa citada', WEIGHTS.STATE, profile.uf);

  // 4. Sócio confirmado — nome completo da pessoa física do QSA.
  const partnerHit = profile.socios.find((partner) => (
    partner.naturalPerson
    && tokensOf(partner.normalizedName).length >= 2
    && containsPhrase(normalizedText, partner.normalizedName)
  ));
  if (partnerHit) add('PARTNER_NAME', 'Nome de integrante do quadro societário citado', WEIGHTS.PARTNER_NAME, partnerHit.name);

  // 5. Contrato já confirmado da empresa citado no texto.
  const knownContracts = (Array.isArray(evidence.knownContracts) ? evidence.knownContracts : [])
    .map((value) => normalize(value))
    .filter((value) => value.length >= 3);
  const contractHit = knownContracts.find((value) => containsPhrase(normalizedText, value)) || '';
  if (contractHit) add('KNOWN_CONTRACT', 'Contrato já confirmado da empresa citado', WEIGHTS.KNOWN_CONTRACT, contractHit);

  // ---- Penalidades -------------------------------------------------------
  const matchedDistinctiveTokens = profile.distinctiveTokens
    .filter((token) => containsPhrase(normalizedText, token));
  const tokenCoverage = profile.distinctiveTokens.length
    ? matchedDistinctiveTokens.length / profile.distinctiveTokens.length
    : 0;

  // Apenas parte do nome apareceu, e nenhuma frase completa. É o caso da
  // reportagem sobre a guerra na Síria diante de GUERRA CONSTRUCOES LTDA.
  if (!cnpjMatch && !exactNameMatch && matchedDistinctiveTokens.length > 0) {
    add(
      'GENERIC_TOKEN_ONLY',
      'Somente palavra isolada da razão social aparece no texto',
      WEIGHTS.GENERIC_TOKEN_ONLY,
      `${matchedDistinctiveTokens.join(', ')} (${Math.round(tokenCoverage * 100)}% do nome distintivo)`,
    );
  }

  // Nome de palavra única, palavra comum do idioma e nenhum marcador
  // empresarial: o texto não trata de pessoa jurídica.
  if (weakSingleToken) {
    add(
      'NON_CORPORATE_CONTEXT',
      'Nenhum marcador empresarial ou contratual no texto',
      WEIGHTS.NON_CORPORATE_CONTEXT,
      corporateAliasHit,
    );
  }

  // Documento identifica outra pessoa jurídica e não a investigada.
  const citedCnpjs = extractCnpjs(rawText);
  const incompatibleCnpj = !cnpjMatch
    && !exactNameMatch
    && citedCnpjs.length > 0
    && !citedCnpjs.includes(profile.cnpjNormalized);
  if (incompatibleCnpj) {
    add(
      'INCOMPATIBLE_IDENTIFIER',
      'O documento cita CNPJ diferente do investigado',
      WEIGHTS.INCOMPATIBLE_IDENTIFIER,
      citedCnpjs.slice(0, 3).map(formatCnpj).join(', '),
    );
  }

  // ---- Classificação -----------------------------------------------------
  // Município, UF e nome de sócio são âncoras: elevam a confiança de uma
  // identificação que já existe, mas não identificam a empresa por si sós. Um
  // documento que apenas cita "Recife, PE" fala da cidade, não da contratada.
  const hasCompanyIdentifier = Boolean(cnpjMatch || exactNameMatch || contractHit);

  let level;
  if (cnpjMatch) level = MATCH_LEVEL.CONFIRMED;
  else if (!hasCompanyIdentifier) level = MATCH_LEVEL.FALSE_POSITIVE;
  else if (score >= SCORE_THRESHOLD.HIGH_CONFIDENCE) level = MATCH_LEVEL.HIGH_CONFIDENCE;
  else if (score >= SCORE_THRESHOLD.POSSIBLE) level = MATCH_LEVEL.POSSIBLE;
  else level = MATCH_LEVEL.FALSE_POSITIVE;

  if (!hasCompanyIdentifier && !cnpjMatch) {
    signals.push({
      code: 'NO_COMPANY_IDENTIFIER',
      label: 'Nenhum identificador nominal da empresa no documento',
      points: 0,
      matched: false,
      detail: 'Município, UF ou nome de pessoa não identificam a pessoa jurídica isoladamente.',
    });
  }

  const positives = signals.filter((signal) => signal.points > 0);
  const negatives = signals.filter((signal) => signal.points < 0);
  const basis = level === MATCH_LEVEL.FALSE_POSITIVE
    ? (negatives[0]?.label || 'Nenhum identificador da empresa foi encontrado no documento.')
    : positives.map((signal) => signal.label).join('; ');

  return {
    level,
    score,
    // Confiança em escala 0–100, para exibição junto de outras fontes.
    confidence: Math.max(0, Math.min(100, Math.round(score))),
    signals,
    basis,
    matched: {
      cnpj: cnpjMatch,
      corporateName: (Boolean(corporateAliasHit) && !weakSingleToken) || Boolean(prefixHit),
      tradeName: Boolean(tradeAliasHit),
      municipality: municipalityMatch,
      state: stateMatch,
      partner: Boolean(partnerHit),
      partnerName: partnerHit?.name || null,
      knownContract: Boolean(contractHit),
      distinctiveTokenCoverage: Math.round(tokenCoverage * 100),
    },
  };
}

/** Ordena níveis sem espalhar a tabela de ranking pelo restante do código. */
function isAtLeast(level, minimum) {
  return (LEVEL_RANK[level] ?? -1) >= (LEVEL_RANK[minimum] ?? Number.POSITIVE_INFINITY);
}

module.exports = {
  MATCH_LEVEL,
  LEVEL_RANK,
  WEIGHTS,
  SCORE_THRESHOLD,
  buildEntityProfile,
  resolveEntityMatch,
  isAtLeast,
  normalize,
  containsPhrase,
  distinctiveTokensOf,
  corporateNamePrefixes,
  stripCorporateSuffix,
  extractCnpjs,
  isNaturalPerson,
};
