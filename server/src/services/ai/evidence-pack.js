// ==========================================================
// DILIGÊNCIA 360 — Pacote de evidências enviado à IA
// Converte o dossiê inteiro em uma lista numerada e auditável.
// A IA só pode afirmar aquilo que estiver aqui: cada achado precisa citar
// um identificador desta lista, e achados sem citação válida são descartados.
// ==========================================================

const MAX_EVIDENCE_ITEMS = 220;
const MAX_DETAIL_LENGTH = 700;

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function truncate(value, limit = MAX_DETAIL_LENGTH) {
  const cleaned = text(value);
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}

function joinParts(parts) {
  return parts.map(text).filter(Boolean).join(' | ');
}

function formatCurrency(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  return numeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

class EvidenceCollector {
  constructor() {
    this.items = [];
    this.coverage = [];
    this.truncated = false;
  }

  add(entry) {
    if (this.items.length >= MAX_EVIDENCE_ITEMS) {
      this.truncated = true;
      return null;
    }
    const id = `E${this.items.length + 1}`;
    this.items.push({
      id,
      eixo: entry.eixo,
      titulo: truncate(entry.titulo, 220),
      detalhe: truncate(entry.detalhe),
      fonte: text(entry.fonte) || 'Não informada',
      url: text(entry.url) || null,
      data: text(entry.data) || null,
    });
    return id;
  }

  // status: CONSULTADO_COM_ACHADOS | CONSULTADO_SEM_ACHADOS | PARCIAL | INDISPONIVEL | NAO_CONSULTADO
  cover(eixo, status, detalhe, fonte) {
    this.coverage.push({
      eixo,
      status,
      detalhe: truncate(detalhe, 400),
      fonte: text(fonte) || null,
    });
  }
}

function collectRegistration(collector, dossier) {
  const empresa = dossier.empresa || {};
  const fonte = text(dossier.companySource) || 'Receita Federal (dados públicos de CNPJ)';

  if (!empresa.cnpj && !empresa.razao_social) {
    collector.cover('CADASTRO', 'INDISPONIVEL', 'Não há dados cadastrais carregados no dossiê.', fonte);
    return;
  }

  collector.add({
    eixo: 'CADASTRO',
    titulo: `Identificação cadastral de ${text(empresa.razao_social) || 'empresa sem razão social informada'}`,
    detalhe: joinParts([
      `CNPJ ${text(empresa.cnpj) || text(dossier.cnpj)}`,
      empresa.nome_fantasia && `Nome fantasia: ${empresa.nome_fantasia}`,
      empresa.descricao_situacao_cadastral && `Situação cadastral: ${empresa.descricao_situacao_cadastral}`,
      empresa.data_situacao_cadastral && `Desde: ${empresa.data_situacao_cadastral}`,
      empresa.data_inicio_atividade && `Início de atividade: ${empresa.data_inicio_atividade}`,
      empresa.natureza_juridica && `Natureza jurídica: ${empresa.natureza_juridica}`,
      empresa.descricao_porte && `Porte: ${empresa.descricao_porte}`,
      empresa.cnae_fiscal_descricao && `CNAE principal: ${empresa.cnae_fiscal} — ${empresa.cnae_fiscal_descricao}`,
      Number.isFinite(Number(empresa.capital_social)) && `Capital social: ${formatCurrency(empresa.capital_social)}`,
      (empresa.municipio || empresa.uf) && `Sede: ${joinParts([empresa.municipio, empresa.uf])}`,
    ]),
    fonte,
    data: text(dossier.companyConsultedAt),
  });

  collector.cover('CADASTRO', 'CONSULTADO_COM_ACHADOS', 'Dados cadastrais públicos carregados.', fonte);
}

function collectShareholders(collector, dossier) {
  const socios = Array.isArray(dossier.socios) ? dossier.socios : [];
  const fonte = 'Quadro de Sócios e Administradores (QSA) público';

  if (socios.length === 0) {
    collector.cover('SOCIETARIO', 'CONSULTADO_SEM_ACHADOS', 'O QSA público não retornou integrantes.', fonte);
    return;
  }

  for (const socio of socios) {
    collector.add({
      eixo: 'SOCIETARIO',
      titulo: `Integrante do quadro societário: ${text(socio.nome_socio)}`,
      detalhe: joinParts([
        socio.qualificacao_socio && `Qualificação: ${socio.qualificacao_socio}`,
        socio.cnpj_cpf_do_socio && `Documento (mascarado na origem): ${socio.cnpj_cpf_do_socio}`,
        socio.data_entrada_sociedade && `Entrada: ${socio.data_entrada_sociedade}`,
        socio.data_saida_sociedade && `Saída: ${socio.data_saida_sociedade}`,
        socio.faixa_etaria && `Faixa etária: ${socio.faixa_etaria}`,
        socio.pais && `País: ${socio.pais}`,
      ]),
      fonte,
    });
  }

  collector.cover('SOCIETARIO', 'CONSULTADO_COM_ACHADOS', `${socios.length} integrante(s) no QSA público.`, fonte);
}

function collectSanctionList(collector, summary, eixo, rotulo) {
  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', `${rotulo} não foi consultado nesta execução.`, rotulo);
    return;
  }

  const fonte = text(summary.fonte) || rotulo;

  if (summary.semChave) {
    collector.cover(eixo, 'INDISPONIVEL', `${rotulo} exige credencial da CGU que não está configurada.`, fonte);
    return;
  }
  if (!summary.ok) {
    collector.cover(eixo, 'INDISPONIVEL', text(summary.erro) || `Falha na consulta ao ${rotulo}.`, fonte);
    return;
  }

  const registros = Array.isArray(summary.registros) ? summary.registros : [];
  if (registros.length === 0) {
    collector.cover(
      eixo,
      summary.consultaParcial ? 'PARCIAL' : 'CONSULTADO_SEM_ACHADOS',
      `Nenhuma sanção localizada no ${rotulo} para o CNPJ consultado.`,
      fonte
    );
    return;
  }

  for (const registro of registros) {
    collector.add({
      eixo,
      titulo: `Sanção registrada no ${rotulo}: ${text(registro.sancao) || 'tipo não informado'}`,
      detalhe: joinParts([
        registro.sancionado && `Sancionado: ${registro.sancionado}`,
        registro.documentoSancionado && `Documento: ${registro.documentoSancionado}`,
        registro.orgao && `Órgão sancionador: ${registro.orgao}`,
        registro.esfera && `Esfera: ${registro.esfera}`,
        registro.uf && `UF: ${registro.uf}`,
        registro.abrangencia && `Abrangência: ${registro.abrangencia}`,
        registro.inicio && `Início: ${registro.inicio}`,
        registro.fim && `Fim: ${registro.fim}`,
        `Vigente: ${registro.vigente === true ? 'sim' : registro.vigente === false ? 'não' : 'não informado'}`,
        registro.processo && `Processo: ${registro.processo}`,
        registro.valorMulta && `Valor da multa: ${registro.valorMulta}`,
        registro.fundamentacao && `Fundamentação: ${registro.fundamentacao}`,
      ]),
      fonte,
      data: text(summary.consultadoEm),
    });
  }

  collector.cover(
    eixo,
    summary.consultaParcial ? 'PARCIAL' : 'CONSULTADO_COM_ACHADOS',
    `${registros.length} registro(s); vigentes: ${summary.vigentes ?? 'não informado'}.`,
    fonte
  );
}

function collectPersonSanctions(collector, dossier) {
  const summary = dossier.personSanctions;
  const eixo = 'SANCOES_PESSOAS';
  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Rastreio nominal de sócios em CEIS/CNEP não executado.', 'CGU');
    return;
  }

  const fonte = text(summary.provider) || 'CGU — CEIS/CNEP (busca nominal)';
  const resultados = Array.isArray(summary.resultados) ? summary.resultados : [];
  const comCandidatos = resultados.filter((item) => Array.isArray(item?.registros) && item.registros.length > 0);

  for (const resultado of comCandidatos) {
    for (const registro of resultado.registros) {
      collector.add({
        eixo,
        titulo: `Homônimo ou candidato sancionado para "${text(resultado.nome)}"`,
        detalhe: joinParts([
          'ATENÇÃO: a busca é por nome, sem CPF completo, portanto é hipótese e não identificação confirmada.',
          registro.sancionado && `Sancionado: ${registro.sancionado}`,
          registro.sancao && `Sanção: ${registro.sancao}`,
          registro.orgao && `Órgão: ${registro.orgao}`,
          registro.inicio && `Início: ${registro.inicio}`,
          registro.fim && `Fim: ${registro.fim}`,
          `Vigente: ${registro.vigente === true ? 'sim' : registro.vigente === false ? 'não' : 'não informado'}`,
        ]),
        fonte,
        data: text(summary.consultadoEm),
      });
    }
  }

  const statusMap = {
    CONSULTED: comCandidatos.length > 0 ? 'CONSULTADO_COM_ACHADOS' : 'CONSULTADO_SEM_ACHADOS',
    PARTIAL: 'PARCIAL',
    UNAVAILABLE: 'INDISPONIVEL',
    NOT_APPLICABLE: 'NAO_CONSULTADO',
  };

  collector.cover(
    eixo,
    statusMap[summary.coverageStatus] || 'PARCIAL',
    joinParts([
      `Pessoas no QSA: ${summary.peopleInQsa ?? 0}`,
      `Pesquisadas: ${summary.peopleSearched ?? 0}`,
      `Candidatos: ${summary.totalCandidates ?? 0}`,
      summary.limitacao,
      summary.aviso,
      summary.erro,
    ]),
    fonte
  );
}

function collectPep(collector, dossier) {
  const resultados = Array.isArray(dossier.pepResults) ? dossier.pepResults : [];
  const eixo = 'PEP';
  const fonte = 'Portal da Transparência — Pessoas Expostas Politicamente';

  if (resultados.length === 0) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Nenhuma verificação de PEP registrada no dossiê.', fonte);
    return;
  }

  let achados = 0;
  for (const resultado of resultados) {
    const registros = Array.isArray(resultado.registros) ? resultado.registros : [];
    for (const registro of registros) {
      achados += 1;
      collector.add({
        eixo,
        titulo: `Pessoa exposta politicamente relacionada: ${text(registro.nome) || text(resultado.nome)}`,
        detalhe: joinParts([
          registro.funcao && `Função: ${registro.funcao}`,
          registro.orgao && `Órgão: ${registro.orgao}`,
          registro.inicio && `Início: ${registro.inicio}`,
          registro.fim && `Fim: ${registro.fim}`,
          registro.carencia && `Carência: ${registro.carencia}`,
          'Condição de PEP não é irregularidade; exige diligência reforçada.',
        ]),
        fonte: text(resultado.fonte) || fonte,
        data: text(resultado.consultadoEm),
      });
    }
  }

  collector.cover(
    eixo,
    achados > 0 ? 'CONSULTADO_COM_ACHADOS' : 'CONSULTADO_SEM_ACHADOS',
    `${resultados.length} pessoa(s) verificada(s); ${achados} vínculo(s) PEP.`,
    fonte
  );
}

function collectJudicial(collector, dossier) {
  const processos = Array.isArray(dossier.processosJudiciais) ? dossier.processosJudiciais : [];
  const descobertos = Array.isArray(dossier.processosDescobertos) ? dossier.processosDescobertos : [];
  const eixo = 'JUDICIAL';
  const fonte = 'CNJ — DataJud (Base Nacional de Dados do Poder Judiciário)';

  for (const processo of processos) {
    const movimentos = Array.isArray(processo.movimentos) ? processo.movimentos : [];
    const ultimo = movimentos[0];
    collector.add({
      eixo,
      titulo: `Processo judicial ${text(processo.numero)} — ${text(processo.classe?.nome) || 'classe não informada'}`,
      detalhe: joinParts([
        processo.tribunalNome && `Tribunal: ${processo.tribunalNome}`,
        processo.grau && `Grau: ${processo.grau}`,
        processo.categoria?.label && `Categoria: ${processo.categoria.label}`,
        Array.isArray(processo.assuntos) && processo.assuntos.length > 0
          && `Assuntos: ${processo.assuntos.map((assunto) => text(assunto?.nome)).filter(Boolean).join('; ')}`,
        processo.orgaoJulgador?.nome && `Órgão julgador: ${processo.orgaoJulgador.nome}`,
        processo.dataAjuizamento && `Ajuizamento: ${processo.dataAjuizamento}`,
        Number.isFinite(Number(processo.totalMovimentos)) && `Movimentos: ${processo.totalMovimentos}`,
        ultimo?.nome && `Último movimento: ${ultimo.nome}`,
        'O DataJud não informa o polo da parte, então a posição processual não pode ser afirmada.',
      ]),
      fonte: text(processo.fonte) || fonte,
      data: text(processo.consultadoEm) || text(processo.ultimaAtualizacao),
    });
  }

  for (const descoberto of descobertos) {
    if (processos.some((processo) => processo.numeroLimpo === descoberto.processNumber)) continue;
    collector.add({
      eixo,
      titulo: `Processo citado em fonte aberta: ${text(descoberto.formattedProcessNumber) || text(descoberto.processNumber)}`,
      detalhe: joinParts([
        descoberto.tribunal && `Tribunal indicado: ${descoberto.tribunal}`,
        descoberto.status && `Situação da descoberta: ${descoberto.status}`,
        Array.isArray(descoberto.sources)
          && `Origens: ${descoberto.sources.map((source) => text(source?.type || source?.label)).filter(Boolean).join('; ')}`,
        'Número extraído de menção pública, ainda sem confirmação no DataJud.',
      ]),
      fonte: 'Descoberta processual em fontes abertas',
      data: text(descoberto.lastUpdated),
    });
  }

  if (processos.length === 0 && descobertos.length === 0) {
    collector.cover(
      eixo,
      dossier.processDiscoveryExecuted ? 'CONSULTADO_SEM_ACHADOS' : 'NAO_CONSULTADO',
      'Nenhum processo localizado nas bases consultadas.',
      fonte
    );
    return;
  }

  collector.cover(
    eixo,
    'CONSULTADO_COM_ACHADOS',
    `${processos.length} processo(s) no DataJud e ${descobertos.length} número(s) descoberto(s) em fontes abertas.`,
    fonte
  );
}

function collectAdverseMedia(collector, dossier) {
  const summary = dossier.adverseMedia;
  const eixo = 'MIDIA';

  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Pesquisa de mídia e ocorrências públicas não executada.', 'Busca web');
    return;
  }

  const fonte = text(summary.provider) || 'Busca web multi-fonte';
  const resultados = (Array.isArray(summary.results) ? summary.results : [])
    .filter((item) => item?.status !== 'discarded');

  // Prioriza o que é relevante a risco e as correspondências fortes,
  // mas mantém as menções neutras no fim para não esconder contexto.
  const ordenados = [...resultados].sort((left, right) => {
    const peso = (item) => (item.riskRelevant ? 2 : 0)
      + (item.matchStrength === 'high' ? 1 : item.matchStrength === 'medium' ? 0.5 : 0);
    return peso(right) - peso(left);
  });

  for (const resultado of ordenados) {
    collector.add({
      eixo,
      titulo: text(resultado.title) || 'Publicação sem título',
      detalhe: joinParts([
        resultado.snippet && `Trecho: ${resultado.snippet}`,
        resultado.subjectName && `Sujeito pesquisado: ${resultado.subjectName}`,
        resultado.subjectType && `Tipo de sujeito: ${resultado.subjectType === 'person' ? 'pessoa física' : 'empresa'}`,
        resultado.subjectQualification && `Qualificação: ${resultado.subjectQualification}`,
        Array.isArray(resultado.categories) && resultado.categories.length > 0
          && `Categorias: ${resultado.categories.join('; ')}`,
        Array.isArray(resultado.matchedTerms) && resultado.matchedTerms.length > 0
          && `Termos: ${resultado.matchedTerms.join('; ')}`,
        `Força da correspondência: ${text(resultado.matchStrength) || 'não classificada'}`,
        `Relevante a risco: ${resultado.riskRelevant ? 'sim' : 'não'}`,
        resultado.identityStatus && `Identidade: ${resultado.identityStatus}`,
        resultado.requiresHumanReview && 'Exige validação humana de identidade.',
        resultado.status && `Situação da triagem: ${resultado.status}`,
      ]),
      fonte: text(resultado.domain) || fonte,
      url: text(resultado.canonicalUrl) || text(resultado.url),
      data: text(resultado.publishedAt),
    });
  }

  const statusCobertura = summary.coverageStatus === 'UNAVAILABLE'
    ? 'INDISPONIVEL'
    : summary.coverageStatus === 'PARTIAL' || summary.consultaParcial || summary.deadlineExceeded
      ? 'PARCIAL'
      : resultados.length > 0
        ? 'CONSULTADO_COM_ACHADOS'
        : 'CONSULTADO_SEM_ACHADOS';

  collector.cover(
    eixo,
    statusCobertura,
    joinParts([
      `Total encontrado: ${summary.totalFound ?? 0}`,
      `Relevantes a risco: ${summary.riskRelevantCount ?? 0}`,
      `Correspondências fortes: ${summary.strongMatches ?? 0}`,
      `Pessoas pesquisadas: ${summary.peopleSearched ?? 0} de ${summary.peopleRequested ?? 0}`,
      summary.personSearchTruncated && 'A busca por pessoas foi truncada por limite de tempo.',
      summary.deadlineExceeded && 'O prazo global da pesquisa foi atingido.',
      summary.aviso,
      Array.isArray(summary.providerSources) && summary.providerSources.length > 0
        && `Canais: ${summary.providerSources.join('; ')}`,
    ]),
    fonte
  );
}

function collectGazettes(collector, dossier) {
  const summary = dossier.officialGazettes;
  const eixo = 'DIARIOS_OFICIAIS';
  const fonte = text(summary?.provider) || 'Querido Diário — diários oficiais municipais';

  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Busca em diários oficiais não executada.', fonte);
    return;
  }

  const resultados = Array.isArray(summary.results) ? summary.results : [];
  for (const resultado of resultados) {
    collector.add({
      eixo,
      titulo: `Menção em diário oficial: ${text(resultado.territoryName) || text(resultado.territory_name) || 'município não identificado'}`,
      detalhe: joinParts([
        resultado.excerpt && `Trecho: ${resultado.excerpt}`,
        resultado.subjectName && `Sujeito pesquisado: ${resultado.subjectName}`,
        resultado.state && `UF: ${resultado.state}`,
        resultado.editionNumber && `Edição: ${resultado.editionNumber}`,
        resultado.isExtraEdition && 'Edição extra.',
      ]),
      fonte,
      url: text(resultado.url) || text(resultado.txtUrl),
      data: text(resultado.date),
    });
  }

  collector.cover(
    eixo,
    !summary.ok
      ? 'INDISPONIVEL'
      : summary.partial
        ? 'PARCIAL'
        : resultados.length > 0
          ? 'CONSULTADO_COM_ACHADOS'
          : 'CONSULTADO_SEM_ACHADOS',
    joinParts([
      `Total encontrado: ${summary.totalFound ?? 0}`,
      `Retornado: ${summary.returned ?? resultados.length}`,
      summary.scope && `Escopo: ${summary.scope}`,
      summary.erro,
    ]),
    fonte
  );
}

function collectCorporateNetwork(collector, dossier) {
  const summary = dossier.corporateNetwork;
  const eixo = 'REDE_SOCIETARIA';
  const fonte = text(summary?.provider) || 'Minha Receita / grafo societário público';

  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Expansão de rede societária não executada.', fonte);
    return;
  }

  const empresas = Array.isArray(summary.companies) ? summary.companies : [];
  const relacoes = Array.isArray(summary.relationships) ? summary.relationships : [];

  for (const empresa of empresas) {
    if (text(empresa.cnpj) === text(summary.rootCnpj)) continue;
    collector.add({
      eixo,
      titulo: `Empresa relacionada na rede societária: ${text(empresa.razaoSocial) || text(empresa.razao_social)}`,
      detalhe: joinParts([
        empresa.cnpj && `CNPJ: ${empresa.cnpj}`,
        empresa.situacao && `Situação cadastral: ${empresa.situacao}`,
        empresa.municipio && `Município: ${empresa.municipio}`,
        empresa.uf && `UF: ${empresa.uf}`,
        Number.isFinite(Number(empresa.depth)) && `Profundidade a partir da raiz: ${empresa.depth}`,
        empresa.atividade && `Atividade: ${empresa.atividade}`,
      ]),
      fonte,
      data: text(summary.consultadoEm),
    });
  }

  collector.cover(
    eixo,
    !summary.ok
      ? 'INDISPONIVEL'
      : summary.consultaParcial
        ? 'PARCIAL'
        : empresas.length > 1
          ? 'CONSULTADO_COM_ACHADOS'
          : 'CONSULTADO_SEM_ACHADOS',
    joinParts([
      `${empresas.length} empresa(s) e ${relacoes.length} relação(ões) mapeadas`,
      Number.isFinite(Number(summary.failures)) && summary.failures > 0 && `${summary.failures} consulta(s) falharam`,
      summary.erro,
    ]),
    fonte
  );
}

function collectOffshore(collector, dossier) {
  const summary = dossier.offshore;
  const eixo = 'OFFSHORE';
  const fonte = text(summary?.provider) || 'ICIJ Offshore Leaks';

  if (!summary) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Triagem em vazamentos offshore não executada.', fonte);
    return;
  }

  const candidatos = Array.isArray(summary.candidates) ? summary.candidates : [];
  for (const candidato of candidatos) {
    collector.add({
      eixo,
      titulo: `Candidato em base offshore: ${text(candidato.name) || text(candidato.nome)}`,
      detalhe: joinParts([
        'Correspondência apenas nominal; não confirma identidade nem ilicitude.',
        candidato.entityType && `Tipo: ${candidato.entityType}`,
        candidato.jurisdiction && `Jurisdição: ${candidato.jurisdiction}`,
        candidato.sourceDataset && `Vazamento: ${candidato.sourceDataset}`,
        candidato.matchedTerm && `Termo casado: ${candidato.matchedTerm}`,
      ]),
      fonte,
      url: text(candidato.url),
      data: text(summary.consultadoEm),
    });
  }

  collector.cover(
    eixo,
    !summary.ok
      ? 'INDISPONIVEL'
      : candidatos.length > 0
        ? 'CONSULTADO_COM_ACHADOS'
        : 'CONSULTADO_SEM_ACHADOS',
    joinParts([`${candidatos.length} candidato(s) nominal(is)`, summary.erro]),
    fonte
  );
}

function collectInternalEgos(collector, dossier) {
  const egos = dossier.egos;
  const eixo = 'BASE_INTERNA_SUAPE';
  const fonte = 'EGOS — cruzamento com a base funcional interna autorizada';

  if (!egos) {
    collector.cover(eixo, 'NAO_CONSULTADO', 'Nenhum cruzamento EGOS registrado no dossiê.', fonte);
    return;
  }

  const findings = (Array.isArray(egos.findings) ? egos.findings : [])
    .filter((finding) => finding?.reviewStatus !== 'discarded');

  for (const finding of findings) {
    collector.add({
      eixo,
      titulo: `Hipótese EGOS (${text(finding.axis)}): ${text(finding.title) || text(finding.summary)}`,
      detalhe: joinParts([
        finding.description || finding.summary,
        finding.severity && `Severidade atribuída: ${finding.severity}`,
        finding.status && `Situação: ${finding.status}`,
        finding.reviewStatus && `Revisão humana: ${finding.reviewStatus}`,
        'Hipótese de identidade: exige confirmação humana antes de qualquer conclusão.',
      ]),
      fonte,
      data: text(egos.generatedAt),
    });
  }

  collector.cover(
    eixo,
    findings.length > 0 ? 'CONSULTADO_COM_ACHADOS' : 'CONSULTADO_SEM_ACHADOS',
    joinParts([
      `${findings.length} hipótese(s) ativa(s)`,
      Array.isArray(egos.insights) && egos.insights.length > 0 && egos.insights.join(' '),
      'A base interna importa apenas identidade funcional; remuneração nunca é lida.',
    ]),
    fonte
  );
}

function collectRisk(collector, dossier) {
  const risco = dossier.risco;
  if (!risco) return;

  const detalhes = Array.isArray(risco.detalhes) ? risco.detalhes : [];
  for (const detalhe of detalhes) {
    collector.add({
      eixo: 'SCORE_INTERNO',
      titulo: `Critério de exposição já pontuado: ${text(detalhe.criterio)}`,
      detalhe: joinParts([
        detalhe.info,
        Number.isFinite(Number(detalhe.pontos)) && `Pontos: ${detalhe.pontos}`,
        detalhe.categoria && `Categoria: ${detalhe.categoria}`,
        detalhe.natureza && `Natureza: ${detalhe.natureza}`,
        detalhe.confianca && `Confiança: ${detalhe.confianca}`,
      ]),
      fonte: `Metodologia interna ${text(risco.methodologyVersion) || 'de exposição'}`,
      data: text(dossier.dataAnalise),
    });
  }

  collector.cover(
    'SCORE_INTERNO',
    'CONSULTADO_COM_ACHADOS',
    joinParts([
      `Score ${risco.score} — ${risco.nivel}`,
      `Decisão sugerida: ${risco.decisao}`,
      risco.manualOverride && 'Há reclassificação manual registrada pelo Compliance.',
    ]),
    'Metodologia interna Diligência 360'
  );
}

/**
 * Monta a lista numerada de evidências e o mapa de cobertura das fontes.
 */
function buildEvidencePack(dossier = {}) {
  const collector = new EvidenceCollector();

  collectRegistration(collector, dossier);
  collectShareholders(collector, dossier);
  collectSanctionList(collector, dossier.ceis, 'SANCOES_EMPRESA_CEIS', 'CEIS (Inidôneas e Suspensas)');
  collectSanctionList(collector, dossier.cnep, 'SANCOES_EMPRESA_CNEP', 'CNEP (Empresas Punidas)');
  collectPersonSanctions(collector, dossier);
  collectPep(collector, dossier);
  collectJudicial(collector, dossier);
  collectAdverseMedia(collector, dossier);
  collectGazettes(collector, dossier);
  collectCorporateNetwork(collector, dossier);
  collectOffshore(collector, dossier);
  collectInternalEgos(collector, dossier);
  collectRisk(collector, dossier);

  return {
    evidencias: collector.items,
    cobertura: collector.coverage,
    truncado: collector.truncated,
    limite: MAX_EVIDENCE_ITEMS,
  };
}

module.exports = { buildEvidencePack, MAX_EVIDENCE_ITEMS };
