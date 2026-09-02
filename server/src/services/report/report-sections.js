const {
  PAGE,
  COLORS,
  cleanText,
  clampText,
  statusPalette,
  drawBrand,
  drawPill,
  beginSectionPage,
  drawMetricRow,
  drawCallout,
  drawSubheading,
  drawEmptyState,
  drawFooter,
} = require('./report-theme');
const { formatCNPJ, formatDate, formatDateTime } = require('./report-formatter');

const COVERAGE_LABELS = Object.freeze({
  CADASTRO: 'Cadastro empresarial',
  COMPANY: 'Cadastro empresarial',
  QSA: 'Quadro societário atual',
  QSA_HISTORY: 'Governança - 5 exercícios',
  SHAREHOLDERS: 'Quadro societário',
  GOVERNANCE: 'Governança - 5 exercícios',
  PEP: 'Pessoas expostas politicamente',
  CEIS: 'Sanções CEIS',
  PERSON_SANCTIONS: 'Sanções dos sócios (PF)',
  CNEP: 'Sanções CNEP',
  MEDIA: 'Mídia e ocorrências públicas',
  PROCESS_DISCOVERY: 'Descoberta processual',
  JUDICIAL_DISCOVERY: 'Descoberta processual',
  CNJ_DATAJUD: 'Enriquecimento DataJud',
  DATAJUD: 'Enriquecimento DataJud',
  ICIJ_OFFSHORE: 'Relações offshore',
  OFFSHORE: 'Relações offshore',
  DIARIOS_OFICIAIS: 'Diários oficiais',
  OFFICIAL_GAZETTE: 'Diários oficiais',
  INTERNAL_SUAPE: 'Vínculo institucional SUAPE',
  SUAPE: 'Vínculo institucional SUAPE',
  EGOS_ENTITY_RESOLUTION: 'Resolução de identidade',
  ENTITY_RESOLUTION: 'Resolução de identidade',
  EGOS_GRAPH: 'Rede de relacionamentos',
  RELATIONSHIPS: 'Rede de relacionamentos',
  CORPORATE_NETWORK: 'Expansão societária',
  CORPORATE_EXPANSION: 'Expansão societária',
  FUND_RELATIONSHIPS: 'Prestadores e rede de fundos',
  FUND_NETWORK: 'Prestadores e rede de fundos',
  PUBLIC_CONTRACTS: 'Contratos públicos confirmados',
  PUBLIC_PAYMENTS: 'Pagamentos públicos confirmados',
  EXTERNAL_CONTROL: 'Controle externo — TCE-PE',
});

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getRiskPalette(score, reviewCount) {
  if (score >= 60) return { foreground: COLORS.red, background: COLORS.redSoft, border: '#F0B8B3' };
  if (score >= 15 || reviewCount > 0) return { foreground: COLORS.amber, background: COLORS.amberSoft, border: '#E9CF83' };
  return { foreground: COLORS.green, background: COLORS.greenSoft, border: '#A8DDCC' };
}

function getReviewFindings(diligence) {
  const egosFindings = asArray(diligence.egos?.findings)
    .filter((finding) => ['REVIEW', 'INCONCLUSIVE'].includes(String(finding.status || '').toUpperCase()))
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  const riskFindings = asArray(diligence.risco?.detalhes)
    .filter((detail) => detail?.natureza !== 'manual_override' && (detail?.requerRevisao || Number(detail?.pontos || 0) > 0))
    .sort((a, b) => Math.abs(Number(b.pontos || 0)) - Math.abs(Number(a.pontos || 0)))
    .map((detail) => ({
      title: detail.criterio,
      explanation: detail.info,
      status: detail.natureza === 'confirmed' ? 'CONFIRMED' : 'REVIEW',
      confidence: detail.confianca === 'alta' ? 100 : detail.confianca === 'media' ? 70 : 40,
    }));
  return [...riskFindings, ...egosFindings]
    .filter((finding, index, all) => all.findIndex((item) => item.title === finding.title) === index);
}

function countGovernanceEntries(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : asArray(value).length;
}

function formatWorkflowStatus(status) {
  const labels = {
    in_progress: 'Em execução',
    awaiting_review: 'Aguardando revisão',
    under_review: 'Em revisão',
    returned: 'Devolvida para ajustes',
    completed: 'Concluída',
  };
  return labels[String(status || '').toLowerCase()] || cleanText(status, 'Em execução').replace(/_/g, ' ');
}

function getCoverageRows(diligence) {
  const egosCoverage = asArray(diligence.egos?.coverage);
  if (egosCoverage.length > 0) {
    return egosCoverage.map((item) => ({
      axis: COVERAGE_LABELS[item.axis] || cleanText(item.axis),
      provider: cleanText(item.provider, 'Fonte pública'),
      status: item.status || 'NOT_CONSULTED',
      count: Number.isFinite(item.resultCount) ? item.resultCount : 0,
      message: cleanText(item.message, 'Sem observações adicionais.'),
    }));
  }

  // Sem snapshot EGOS, a cobertura é derivada do resultado de cada fonte.
  // Nunca declare CONSULTED sem que a fonte tenha efetivamente respondido:
  // um dossiê em que o CEIS falhou não pode se parecer com um dossiê limpo.
  const sourceStatus = (result) => {
    if (!result) return { status: 'NOT_CONSULTED', message: 'Fonte não acionada nesta execução.' };
    if (result.semChave) return { status: 'UNAVAILABLE', message: 'Integração não configurada; a fonte não foi consultada.' };
    if (result.ok === false) return { status: 'UNAVAILABLE', message: cleanText(result.erro || result.aviso, 'A fonte não respondeu.') };
    if (result.consultaParcial) return { status: 'PARTIAL', message: cleanText(result.aviso, 'Consulta parcial: podem existir registros adicionais.') };
    return { status: 'CONSULTED', message: null };
  };

  const sanctionRow = (label, provider, result) => {
    const { status, message } = sourceStatus(result);
    return {
      axis: label,
      provider,
      status,
      count: status === 'CONSULTED' || status === 'PARTIAL' ? (result?.quantidade || 0) : 0,
      message: message || (result?.quantidade
        ? `${result.quantidade} registro(s) retornado(s) pela fonte.`
        : 'Fonte consultada, sem ocorrência para o documento pesquisado.'),
    };
  };

  const peps = asArray(diligence.pepResults);
  const pepUnavailable = peps.filter((item) => item.semChave || item.ok === false).length;
  const pepStatus = peps.length === 0
    ? 'NOT_CONSULTED'
    : pepUnavailable === peps.length ? 'UNAVAILABLE' : pepUnavailable > 0 ? 'PARTIAL' : 'CONSULTED';

  const personSanctions = diligence.personSanctions;
  const media = diligence.adverseMedia;
  const mediaStatus = sourceStatus(media);

  return [
    { axis: 'Cadastro empresarial', provider: 'Receita Federal', status: diligence.empresa ? 'CONSULTED' : 'UNAVAILABLE', count: diligence.empresa ? 1 : 0, message: diligence.empresa ? 'Cadastro e situação consultados.' : 'Cadastro não recuperado.' },
    {
      axis: 'Pessoas expostas politicamente',
      provider: 'CGU / PEP',
      status: pepStatus,
      count: peps.filter((item) => item.encontrado).length,
      message: pepStatus === 'UNAVAILABLE'
        ? 'Nenhum integrante pôde ser verificado.'
        : pepStatus === 'PARTIAL'
          ? `${peps.length - pepUnavailable} de ${peps.length} integrante(s) verificados.`
          : `${peps.length} integrante(s) pesquisados por nome.`,
    },
    sanctionRow('Sanções CEIS', 'CGU / CEIS', diligence.ceis),
    sanctionRow('Sanções CNEP', 'CGU / CNEP', diligence.cnep),
    {
      axis: 'Sanções dos sócios (PF)',
      provider: 'CGU / CEIS e CNEP — busca nominal',
      status: personSanctions?.coverageStatus || 'NOT_CONSULTED',
      count: personSanctions?.totalCandidates || 0,
      message: cleanText(personSanctions?.aviso, 'Sócios pessoa física não rastreados nesta execução.'),
    },
    {
      axis: 'Mídia e ocorrências públicas',
      provider: cleanText(media?.provider, 'Pesquisa Web'),
      status: mediaStatus.status,
      count: media?.totalFound || 0,
      message: mediaStatus.message || 'Pesquisa pública executada.',
    },
    {
      axis: 'Descoberta processual',
      provider: 'CNJ / fontes públicas',
      status: diligence.processDiscoveryExecuted ? 'CONSULTED' : 'NOT_CONSULTED',
      count: asArray(diligence.processosDescobertos).length,
      message: diligence.processDiscoveryExecuted
        ? 'Números processuais extraídos das fontes que responderam. Não houve varredura por parte.'
        : 'Nenhuma fonte de descoberta respondeu; não há varredura processual nesta execução.',
    },
  ];
}

function flattenPepMatches(diligence) {
  return asArray(diligence.pepResults).flatMap((person) => {
    const records = asArray(person.registros);
    if (records.length === 0 && person.encontrado) {
      return [{ searched: person.nome, candidate: person.nome, organization: '', role: '', period: 'Período não informado' }];
    }
    return records.map((record) => ({
      searched: person.nome,
      candidate: record.nome || person.nome,
      organization: record.orgao || 'Órgão não informado',
      role: record.funcao || 'Função não informada',
      period: `${formatDate(record.inicio)} a ${formatDate(record.fim)}`,
    }));
  });
}

function formatAddress(company) {
  const firstLine = [company.logradouro, company.numero, company.complemento]
    .filter(Boolean)
    .join(', ');
  const secondLine = [company.bairro, company.municipio, company.uf]
    .filter(Boolean)
    .join(' - ');
  return [firstLine, secondLine].filter(Boolean).join(' | ') || 'Não informado';
}

function drawCover(doc, diligence, reportNumber, isPreview, emittedAt) {
  const company = diligence.empresa || {};
  const risk = diligence.risco || {};
  const reviewCount = getReviewFindings(diligence).length;
  const riskPalette = getRiskPalette(Number(risk.score || 0), reviewCount);
  const companyName = cleanText(company.razao_social || diligence.razaoSocial, 'Empresa não identificada');
  const location = [company.municipio, company.uf].filter(Boolean).join(' / ') || 'Localização não informada';
  const nameFontSize = companyName.length > 72 ? 21 : companyName.length > 46 ? 24 : 28;

  doc.save();
  doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.white);
  doc.rect(0, 0, PAGE.width, 474).fill(COLORS.navy);
  doc.rect(0, 0, 11, PAGE.height).fill(COLORS.blue);
  doc.rect(11, 0, 4, PAGE.height).fill(COLORS.gold);
  doc.circle(507, 92, 118).fillOpacity(0.08).fill(COLORS.blue);
  doc.circle(505, 91, 69).fillOpacity(0.07).fill(COLORS.gold);
  doc.fillOpacity(1);
  drawBrand(doc, PAGE.left, 40, { inverse: true });

  if (isPreview) {
    drawPill(doc, 'PRÉVIA - NÃO CONCLUÍDA', 365, 45, { foreground: '#FFD8D3', background: '#6F2728' }, { width: 178, height: 23, fontSize: 6.8 });
  } else {
    drawPill(doc, 'DOSSIÊ FORMAL CONCLUÍDO', 365, 45, { foreground: '#C8F5E6', background: '#155343' }, { width: 178, height: 23, fontSize: 6.8 });
  }

  doc.fillColor('#A9C0D6').font('Courier-Bold').fontSize(7.2)
    .text('DOSSIÊ EXECUTIVO DE INTEGRIDADE DE TERCEIRO', PAGE.left, 132, { width: 420, characterSpacing: 0.7 });
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(nameFontSize)
    .text(companyName, PAGE.left, 166, { width: 465, lineGap: 2 });
  const companyBottom = Math.max(231, doc.y + 4);
  doc.fillColor('#B9CCE0').font('Helvetica').fontSize(9)
    .text(`${formatCNPJ(diligence.cnpj)}  |  ${cleanText(company.nome_fantasia || diligence.nomeFantasia, 'Sem nome fantasia')}  |  ${cleanText(location)}`, PAGE.left, companyBottom, { width: 465 });

  const riskY = 322;
  doc.roundedRect(PAGE.left, riskY, PAGE.contentWidth, 101, 13).fillAndStroke(COLORS.navySoft, '#31536F');
  doc.fillColor('#AFC5DA').font('Courier-Bold').fontSize(6.5)
    .text('CLASSIFICAÇÃO FINAL DE RISCO', PAGE.left + 18, riskY + 17, { characterSpacing: 0.5 });
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(28)
    .text(String(Number(risk.score || 0)), PAGE.left + 18, riskY + 36, { width: 70 });
  doc.fillColor('#91A8BF').font('Helvetica').fontSize(8).text('/ 100', PAGE.left + 55, riskY + 52, { width: 45 });
  drawPill(doc, risk.nivel || 'Atenção baixa', PAGE.left + 101, riskY + 39, riskPalette, { width: 108, height: 23, fontSize: 7 });
  doc.strokeColor('#31536F').lineWidth(0.7).moveTo(PAGE.left + 230, riskY + 18).lineTo(PAGE.left + 230, riskY + 82).stroke();
  doc.fillColor('#AFC5DA').font('Courier-Bold').fontSize(6.5)
    .text('LEITURA PARA DECISÃO', PAGE.left + 250, riskY + 18, { characterSpacing: 0.5 });
  const decisionHeadline = Number(risk.score || 0) >= 60
    ? 'Submeter ao comitê de riscos'
    : Number(risk.score || 0) >= 35
      ? 'Aprofundar antes da decisão'
      : reviewCount > 0
        ? 'Avance somente após a revisão humana'
        : 'Monitoramento ordinário com risco residual';
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(11)
    .text(decisionHeadline, PAGE.left + 250, riskY + 37, { width: 217, lineGap: 2 });
  const automaticScore = Number(risk.manualOverride?.automaticScore ?? risk.automaticScore ?? risk.score ?? 0);
  doc.fillColor('#AFC5DA').font('Helvetica').fontSize(7.2)
    .text(`${reviewCount} sinal(is) exigem decisão registrada. Radar automático: ${automaticScore}/100.`, PAGE.left + 250, riskY + 69, { width: 217 });

  const metaY = 510;
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(13).text('Controle e rastreabilidade', PAGE.left, metaY, { width: PAGE.contentWidth });
  const metadata = [
    ['NÚMERO DE REGISTRO', reportNumber],
    ['PROTOCOLO', diligence.id],
    ['DATA DA ANÁLISE', formatDateTime(diligence.dataAnalise)],
    ['EMISSÃO DESTA VIA', formatDateTime(emittedAt)],
    ['STATUS DO PROCESSO', formatWorkflowStatus(diligence.status)],
    ['RESPONSÁVEL', diligence.createdBy?.name || 'Não registrado'],
  ];
  metadata.forEach(([label, value], index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE.left + col * 250;
    const y = metaY + 38 + row * 58;
    doc.fillColor(COLORS.muted).font('Courier-Bold').fontSize(6.1).text(label, x, y, { width: 224, characterSpacing: 0.35 });
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5)
      .text(clampText(value, 58), x, y + 13, { width: 224, lineGap: 1.5 });
  });

  doc.roundedRect(PAGE.left, 724, PAGE.contentWidth, 55, 9).fillAndStroke(COLORS.cloud, COLORS.line);
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.4)
    .text('Este documento apoia a decisão administrativa. Correspondências nominais, PEP e menções públicas não comprovam crime, sanção ou identidade sem validação humana e evidência própria.', PAGE.left + 14, 739, { width: PAGE.contentWidth - 28, lineGap: 2 });
  doc.restore();
}

function drawExecutivePage(doc, diligence) {
  const risk = diligence.risco || {};
  const score = Number(risk.score || 0);
  const findings = getReviewFindings(diligence);
  const coverage = getCoverageRows(diligence);
  const consulted = coverage.filter((item) => ['CONSULTED', 'PARTIAL'].includes(String(item.status).toUpperCase())).length;
  const unavailable = coverage.filter((item) => String(item.status).toUpperCase() === 'UNAVAILABLE').length;
  const activeSanctions = Number(diligence.ceis?.vigentes || 0) + Number(diligence.cnep?.vigentes || 0);
  const riskPalette = getRiskPalette(score, findings.length);

  let y = beginSectionPage(doc, { number: 1, eyebrow: 'Parecer executivo', title: 'Decisão primeiro, detalhes depois', subtitle: 'O que foi encontrado, o que ainda precisa ser confirmado e qual é o próximo passo seguro.' });
  y = drawCallout(doc, {
    y,
    palette: riskPalette,
    title: cleanText(risk.decisao, findings.length > 0 ? 'Prosseguir somente após a revisão humana' : 'Prosseguir para as demais etapas'),
    body: cleanText(risk.decisaoDesc || risk.decisao, findings.length > 0 ? `${findings.length} sinal(is), hipótese(s) ou lacuna(s) precisam de tratamento antes da decisão.` : 'Nenhum impedimento confirmado foi localizado nas fontes consultadas até o momento.'),
    minHeight: 84,
  }) + 14;

  y = drawMetricRow(doc, [
    { value: `${score}/100`, label: 'Índice de atenção', caption: risk.nivel || 'Classificação preliminar', palette: riskPalette },
    { value: String(findings.length), label: 'Itens para revisar', caption: 'Hipóteses e lacunas', palette: findings.length ? riskPalette : { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: `${consulted}/${coverage.length}`, label: 'Eixos com consulta', caption: `${unavailable} indisponível(is)`, palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
    { value: String(activeSanctions), label: 'Sanções vigentes', caption: 'CEIS e CNEP', palette: activeSanctions ? { foreground: COLORS.red, background: COLORS.redSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
  ], y) + 18;

  y = drawSubheading(doc, 'Pontos que merecem seu olhar', y, 'A lista abaixo apresenta hipóteses e lacunas, não acusações ou conclusões automáticas.');
  const visibleFindings = findings.slice(0, 5);
  if (visibleFindings.length === 0) {
    y = drawEmptyState(doc, 'Nenhuma hipótese pendente registrada', 'As fontes consultadas não produziram item que exija validação humana neste momento.', y, 72);
  } else {
    visibleFindings.forEach((finding, index) => {
      const palette = statusPalette(finding.status || finding.reviewStatus);
      const rowHeight = 54;
      doc.roundedRect(PAGE.left, y, PAGE.contentWidth, rowHeight, 8).fillAndStroke(index % 2 === 0 ? COLORS.white : '#FAFBFC', COLORS.line);
      doc.circle(PAGE.left + 21, y + 21, 11).fill(palette.background);
      doc.fillColor(palette.foreground).font('Courier-Bold').fontSize(7.5)
        .text(String(index + 1).padStart(2, '0'), PAGE.left + 10, y + 18, { width: 22, align: 'center' });
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(8.7)
        .text(clampText(finding.title, 84), PAGE.left + 42, y + 12, { width: 330 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.1)
        .text(clampText(finding.explanation, 148), PAGE.left + 42, y + 28, { width: 395, height: 20, lineGap: 1.1 });
      drawPill(doc, palette.label, PAGE.left + 402, y + 9, palette, { width: 74, height: 19, fontSize: 6.2 });
      y += rowHeight + 6;
    });
    if (findings.length > visibleFindings.length) {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(7)
        .text(`Mais ${findings.length - visibleFindings.length} item(ns) permanecem disponíveis no sistema para revisão.`, PAGE.left, y, { width: PAGE.contentWidth });
      y += 18;
    }
  }

  if (y < 708) {
    drawCallout(doc, {
      y: 700,
      minHeight: 62,
      palette: { foreground: COLORS.blue, background: COLORS.blueSoft, border: '#BED0EC' },
      title: 'Como ler este parecer',
      body: 'Quanto maior o índice, maior a atenção necessária. Ausência de resultado não substitui documento obrigatório; fonte indisponível é apresentada como lacuna, nunca como consulta concluída.',
      titleSize: 9.5,
      bodySize: 7.3,
    });
  }
}

function drawInfoGrid(doc, items, y) {
  const gap = 8;
  const width = (PAGE.contentWidth - gap) / 2;
  const rowHeight = 56;
  items.forEach((item, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE.left + col * (width + gap);
    const rowY = y + row * (rowHeight + gap);
    doc.roundedRect(x, rowY, width, rowHeight, 8).fillAndStroke(COLORS.cloud, COLORS.line);
    doc.fillColor(COLORS.muted).font('Courier-Bold').fontSize(6)
      .text(cleanText(item.label).toUpperCase(), x + 12, rowY + 10, { width: width - 24, characterSpacing: 0.25 });
    doc.fillColor(item.color || COLORS.ink).font('Helvetica-Bold').fontSize(8.2)
      .text(clampText(item.value, item.maxLength || 95), x + 12, rowY + 24, { width: width - 24, height: 26, lineGap: 1.2 });
  });
  return y + Math.ceil(items.length / 2) * (rowHeight + gap) - gap;
}

function drawCompanyPage(doc, diligence) {
  const company = diligence.empresa || {};
  const socios = asArray(diligence.socios);
  const governance = diligence.governanceHistory || {};
  let y = beginSectionPage(doc, { number: 2, eyebrow: 'Cadastro e estrutura', title: 'Quem é a empresa analisada', subtitle: 'Identificação cadastral, quadro societário atual e cobertura histórica de governança.' });
  y = drawSubheading(doc, 'Identificação cadastral', y, 'Dados consolidados a partir do cadastro empresarial disponível no momento da análise.');
  y = drawInfoGrid(doc, [
    { label: 'Razão social', value: company.razao_social || diligence.razaoSocial },
    { label: 'Nome fantasia', value: company.nome_fantasia || diligence.nomeFantasia },
    { label: 'CNPJ', value: formatCNPJ(diligence.cnpj), maxLength: 30 },
    { label: 'Situação cadastral', value: company.descricao_situacao_cadastral || company.situacao_cadastral || 'Não informada', color: COLORS.green },
    { label: 'Natureza jurídica', value: company.natureza_juridica },
    { label: 'Início de atividade', value: formatDate(company.data_inicio_atividade), maxLength: 30 },
    { label: 'Atividade principal', value: company.cnae_fiscal_descricao || company.cnae_fiscal },
    { label: 'Endereço', value: formatAddress(company), maxLength: 115 },
  ], y) + 17;

  const governanceYears = asArray(governance.years || governance.consultedYears);
  y = drawCallout(doc, {
    y,
    minHeight: 65,
    palette: governance.applicable === false ? { foreground: COLORS.neutral, background: COLORS.neutralSoft, border: COLORS.line } : { foreground: COLORS.blue, background: COLORS.blueSoft, border: '#BED0EC' },
    title: governance.applicable === false ? 'Histórico de governança não aplicável' : 'Histórico de governança - últimos 5 exercícios',
    body: governance.applicable === false ? cleanText(governance.aviso, 'A fonte histórica não se aplica a esta natureza jurídica.') : `${governanceYears.length || governance.coverage?.consulted || 0} exercício(s) consultado(s); ${countGovernanceEntries(governance.directors)} diretor(es) ou conselheiro(s) e ${countGovernanceEntries(governance.shareholders)} acionista(s) estruturado(s). A presença em um exercício não presume permanência durante todo o ano.`,
    titleSize: 9.5,
    bodySize: 7.2,
  }) + 16;

  y = drawSubheading(doc, 'Sócios e administradores do cadastro atual', y, `${socios.length} pessoa(s) ou entidade(s) identificada(s).`);
  if (socios.length === 0) {
    drawEmptyState(doc, 'Quadro societário não disponível', 'Nenhum integrante foi retornado pela fonte cadastral consultada.', y, 70);
    return;
  }

  const nameWidth = 245;
  const roleWidth = 151;
  const entryWidth = PAGE.contentWidth - nameWidth - roleWidth;
  doc.rect(PAGE.left, y, PAGE.contentWidth, 25).fill(COLORS.navy);
  [['NOME / ENTIDADE', nameWidth], ['QUALIFICAÇÃO', roleWidth], ['ENTRADA', entryWidth]].reduce((x, [label, width]) => {
    doc.fillColor(COLORS.white).font('Courier-Bold').fontSize(6).text(label, x + 9, y + 9, { width: width - 18 });
    return x + width;
  }, PAGE.left);
  y += 25;
  const visibleSocios = socios.slice(0, 6);
  visibleSocios.forEach((socio, index) => {
    const rowHeight = 27;
    doc.rect(PAGE.left, y, PAGE.contentWidth, rowHeight).fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(7.2)
      .text(clampText(socio.nome_socio, 58), PAGE.left + 9, y + 9, { width: nameWidth - 18, height: 18 });
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.8)
      .text(clampText(socio.qualificacao_socio, 42), PAGE.left + nameWidth + 9, y + 9, { width: roleWidth - 18, height: 18 });
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.8)
      .text(formatDate(socio.data_entrada_sociedade), PAGE.left + nameWidth + roleWidth + 9, y + 9, { width: entryWidth - 18 });
    y += rowHeight;
  });
  if (socios.length > visibleSocios.length) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.8)
      .text(`Mais ${socios.length - visibleSocios.length} integrante(s) constam na ficha completa do sistema.`, PAGE.left, y + 7, { width: PAGE.contentWidth });
  }
}

function drawCoveragePage(doc, diligence) {
  const coverage = getCoverageRows(diligence);
  const consulted = coverage.filter((item) => String(item.status).toUpperCase() === 'CONSULTED').length;
  const partial = coverage.filter((item) => String(item.status).toUpperCase() === 'PARTIAL').length;
  const unavailable = coverage.filter((item) => String(item.status).toUpperCase() === 'UNAVAILABLE').length;
  const notApplicable = coverage.filter((item) => String(item.status).toUpperCase() === 'NOT_APPLICABLE').length;
  const notConsulted = coverage.filter((item) => ['NOT_CONSULTED', 'SKIPPED'].includes(String(item.status).toUpperCase())).length;
  let y = beginSectionPage(doc, { number: 3, eyebrow: 'Cobertura real', title: 'O que conseguimos pesquisar', subtitle: 'Cada eixo mostra fonte, resultado e limite. Lacunas técnicas permanecem visíveis para não criar falsa segurança.' });
  y = drawMetricRow(doc, [
    { value: String(consulted), label: 'Consultados', caption: 'Consulta concluída', palette: { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: String(partial), label: 'Parciais', caption: 'Cobertura incompleta', palette: { foreground: COLORS.amber, background: COLORS.amberSoft } },
    { value: String(unavailable), label: 'Indisponíveis', caption: 'Lacuna declarada', palette: unavailable ? { foreground: COLORS.red, background: COLORS.redSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: String(notConsulted + notApplicable), label: 'Fora da consulta', caption: notConsulted ? `${notConsulted} não consultado(s)` : 'Sem obrigação técnica', palette: notConsulted ? { foreground: COLORS.amber, background: COLORS.amberSoft } : { foreground: COLORS.neutral, background: COLORS.neutralSoft } },
  ], y) + 18;

  const widths = [130, 86, 70, 38, 167];
  const headers = ['EIXO', 'FONTE', 'STATUS', 'QTD.', 'LEITURA'];
  doc.rect(PAGE.left, y, PAGE.contentWidth, 25).fill(COLORS.navy);
  headers.reduce((x, header, index) => {
    doc.fillColor(COLORS.white).font('Courier-Bold').fontSize(5.8).text(header, x + 8, y + 9, { width: widths[index] - 16 });
    return x + widths[index];
  }, PAGE.left);
  y += 25;

  const visibleCoverage = coverage.slice(0, 16);
  visibleCoverage.forEach((item, index) => {
    const rowHeight = 27;
    const palette = statusPalette(item.status);
    doc.rect(PAGE.left, y, PAGE.contentWidth, rowHeight).fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
    let x = PAGE.left;
    doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(6.5).text(clampText(item.axis, 38), x + 8, y + 6, { width: widths[0] - 16, height: 17 });
    x += widths[0];
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6).text(clampText(item.provider, 28), x + 8, y + 6, { width: widths[1] - 16, height: 17 });
    x += widths[1];
    drawPill(doc, palette.label, x + 5, y + 4, palette, { width: widths[2] - 10, height: 18, fontSize: 5.5, paddingX: 3 });
    x += widths[2];
    doc.fillColor(COLORS.navy).font('Courier-Bold').fontSize(7).text(String(item.count), x, y + 8, { width: widths[3], align: 'center' });
    x += widths[3];
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(5.9).text(clampText(item.message, 70), x + 8, y + 5, { width: widths[4] - 16, height: 18, lineGap: 0.6 });
    y += rowHeight;
  });
  if (coverage.length > visibleCoverage.length) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.8)
      .text(`Mais ${coverage.length - visibleCoverage.length} eixo(s) constam na ficha digital.`, PAGE.left, y + 7, { width: PAGE.contentWidth });
  }
  drawCallout(doc, {
    y: Math.max(y + 10, 701),
    minHeight: 56,
    palette: { foreground: COLORS.neutral, background: COLORS.neutralSoft, border: COLORS.line },
    title: 'Regra de transparência da cobertura',
    body: 'Consultado significa que a fonte respondeu. Parcial, indisponível, não consultado e não aplicável possuem significados distintos e não podem ser tratados como ausência de ocorrência. A descoberta processual depende de menção pública: não houve varredura por parte.',
    titleSize: 8.6,
    bodySize: 6.8,
  });
}

function drawIntegrityPage(doc, diligence) {
  const pepMatches = flattenPepMatches(diligence);
  const activeCeis = Number(diligence.ceis?.vigentes || 0);
  const activeCnep = Number(diligence.cnep?.vigentes || 0);
  const processes = asArray(diligence.processosDescobertos);
  const tceProcesses = asArray(diligence.tcePe?.processos);
  const totalProcesses = processes.length + tceProcesses.length;
  let y = beginSectionPage(doc, { number: 4, eyebrow: 'Pessoas e integridade', title: 'Hipóteses separadas de fatos', subtitle: 'PEP, sanções e processos são apresentados em categorias distintas para evitar conclusões indevidas.' });
  y = drawCallout(doc, {
    y,
    minHeight: 73,
    palette: { foreground: COLORS.amber, background: COLORS.amberSoft, border: '#E9CF83' },
    title: 'PEP não significa crime ou irregularidade',
    body: 'A classificação PEP descreve função pública e exposição institucional. Correspondência por nome ou CPF mascarado exige validação documental antes de confirmar identidade.',
    titleSize: 10,
    bodySize: 7.5,
  }) + 17;

  y = drawSubheading(doc, 'Correspondências PEP para validação', y, `${pepMatches.length} candidato(s) retornado(s) pela fonte oficial.`);
  if (pepMatches.length === 0) {
    y = drawEmptyState(doc, 'Nenhum candidato PEP retornado', 'A fonte consultada não apresentou correspondência para os integrantes pesquisados.', y, 66) + 16;
  } else {
    const visiblePep = pepMatches.slice(0, 5);
    visiblePep.forEach((match, index) => {
      const rowHeight = 49;
      doc.roundedRect(PAGE.left, y, PAGE.contentWidth, rowHeight, 7).fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
      doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(7.6).text(clampText(match.searched, 50), PAGE.left + 12, y + 9, { width: 190 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.4).text(`Candidato: ${clampText(match.candidate, 48)}`, PAGE.left + 12, y + 25, { width: 190 });
      doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(6.8).text(clampText(match.role, 52), PAGE.left + 215, y + 9, { width: 175 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.2).text(`${clampText(match.organization, 34)} | ${clampText(match.period, 32)}`, PAGE.left + 215, y + 25, { width: 175 });
      drawPill(doc, 'Validar', PAGE.left + 405, y + 14, { foreground: COLORS.amber, background: COLORS.amberSoft }, { width: 70, height: 20, fontSize: 6 });
      y += rowHeight + 6;
    });
    if (pepMatches.length > visiblePep.length) {
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(6.5).text(`Mais ${pepMatches.length - visiblePep.length} candidato(s) permanecem na ficha digital.`, PAGE.left, y, { width: PAGE.contentWidth });
      y += 16;
    }
  }

  y = drawSubheading(doc, 'Sanções oficiais e descoberta processual', y + 3);
  y = drawMetricRow(doc, [
    { value: String(activeCeis), label: 'CEIS vigentes', caption: `${diligence.ceis?.quantidade || 0} registro(s)`, palette: activeCeis ? { foreground: COLORS.red, background: COLORS.redSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: String(activeCnep), label: 'CNEP vigentes', caption: `${diligence.cnep?.quantidade || 0} registro(s)`, palette: activeCnep ? { foreground: COLORS.red, background: COLORS.redSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: String(totalProcesses), label: 'Processos encontrados', caption: `${tceProcesses.length} no TCE-PE`, palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
  ], y, { height: 59 }) + 13;
  if (tceProcesses.length > 0) {
    tceProcesses.slice(0, 3).forEach((process, index) => {
      doc.fillColor(COLORS.navy).font('Courier-Bold').fontSize(6.8).text(`TCE-PE ${process.processNumber}`, PAGE.left, y + index * 24, { width: 180 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.7).text(`${cleanText(process.modality, 'Controle externo')} | ${cleanText(process.outcome, process.status || 'Em consulta')}`, PAGE.left + 190, y + index * 24, { width: 300 });
    });
  } else if (processes.length > 0) {
    processes.slice(0, 3).forEach((process, index) => {
      doc.fillColor(COLORS.navy).font('Courier-Bold').fontSize(6.8).text(process.formattedProcessNumber || process.processNumber, PAGE.left, y + index * 24, { width: 180 });
      doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.7).text(`${cleanText(process.tribunal, 'Tribunal não identificado')} | ${cleanText(process.status, 'Candidato')}`, PAGE.left + 190, y + index * 24, { width: 300 });
    });
  } else {
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(7.2).text('Nenhum processo de controle externo ou número judicial foi localizado nesta diligência.', PAGE.left, y, { width: PAGE.contentWidth });
  }
}

function drawMediaRow(doc, item, y, index) {
  const palette = statusPalette(item.status || 'REVIEW');
  const rowHeight = 49;
  doc.roundedRect(PAGE.left, y, PAGE.contentWidth, rowHeight, 7).fillAndStroke(index % 2 ? '#FAFBFC' : COLORS.white, COLORS.line);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(7.4).text(clampText(item.title, 98), PAGE.left + 12, y + 9, { width: 365, height: 18 });
  const subject = item.subjectType === 'person' ? cleanText(item.subjectName, 'Pessoa pesquisada') : 'Empresa analisada';
  doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.4).text(`${cleanText(item.domain, 'Fonte pública')} | ${subject}`, PAGE.left + 12, y + 28, { width: 365 });
  drawPill(doc, palette.label, PAGE.left + 398, y + 14, palette, { width: 77, height: 20, fontSize: 5.9 });
  return y + rowHeight;
}

function drawEvidencePage(doc, diligence) {
  const media = diligence.adverseMedia || {};
  const mediaResults = asArray(media.results).sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.matchStrength] || 0) - ({ high: 3, medium: 2, low: 1 }[a.matchStrength] || 0));
  const egos = diligence.egos || {};
  let y = beginSectionPage(doc, { number: 5, eyebrow: 'Mídia e proveniência', title: 'Onde a informação pode ser conferida', subtitle: 'Resultados públicos são pistas rastreáveis. Título, fonte e vínculo permanecem sujeitos à leitura humana.' });
  y = drawMetricRow(doc, [
    { value: String(media.companyResultsCount || 0), label: 'Conteúdos da empresa', caption: 'Pesquisa institucional', palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
    { value: String(media.personResultsCount || 0), label: 'Conteúdos de pessoas', caption: `${media.peopleSearched || 0} pesquisada(s)`, palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
    { value: String(media.candidatesCount || 0), label: 'Candidatos', caption: 'Exigem conferência', palette: media.candidatesCount ? { foreground: COLORS.amber, background: COLORS.amberSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
    { value: String(media.strongMatches || 0), label: 'Sinais fortes', caption: 'Não confirmam ocorrência', palette: media.strongMatches ? { foreground: COLORS.amber, background: COLORS.amberSoft } : { foreground: COLORS.green, background: COLORS.greenSoft } },
  ], y) + 16;
  y = drawCallout(doc, {
    y,
    minHeight: 62,
    palette: media.semChave ? { foreground: COLORS.red, background: COLORS.redSoft, border: '#F0B8B3' } : { foreground: COLORS.blue, background: COLORS.blueSoft, border: '#BED0EC' },
    title: media.semChave ? 'Pesquisa ampla indisponível' : 'Leitura responsável de mídia pública',
    body: media.aviso || 'Resultados de busca não equivalem a fato comprovado. O vínculo com a empresa ou com uma pessoa precisa ser confirmado pelo conteúdo e por fonte primária.',
    titleSize: 9.2,
    bodySize: 7.2,
  }) + 16;
  y = drawSubheading(doc, 'Amostra dos resultados que exigem conferência', y, `Exibindo até 5 de ${mediaResults.length} resultado(s) preservados no dossiê digital.`);
  if (mediaResults.length === 0) {
    y = drawEmptyState(doc, 'Nenhum resultado de mídia disponível', media.aviso || 'A pesquisa não retornou conteúdo ou não pôde ser executada.', y, 70) + 18;
  } else {
    mediaResults.slice(0, 5).forEach((item, index) => {
      y = drawMediaRow(doc, item, y, index) + 6;
    });
  }
  const metricY = Math.max(y + 10, 685);
  drawMetricRow(doc, [
    { value: String(asArray(egos.entities).length), label: 'Entidades estruturadas', caption: 'Pessoas e organizações', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
    { value: String(asArray(egos.relationships).length), label: 'Relações rastreáveis', caption: 'Fatos e hipóteses', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
    { value: String(asArray(egos.evidences).length), label: 'Evidências', caption: 'Fonte e data preservadas', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
  ], metricY, { height: 59 });
}

function drawWorkflowPage(doc, diligence) {
  const governance = diligence.governanceHistory || {};
  const timeline = asArray(diligence.timeline);
  const timelineTail = timeline.slice(-8);
  const years = asArray(governance.years || governance.consultedYears);
  const analyst = diligence.createdBy?.name || 'Responsável não registrado';
  const reviewer = diligence.reviewedBy?.name || 'Revisor ainda não designado';
  let y = beginSectionPage(doc, { number: 6, eyebrow: 'Governança e workflow', title: 'Quem analisou e como a decisão evoluiu', subtitle: 'Cobertura dos exercícios, responsáveis registrados e trilha resumida de auditoria.' });
  y = drawSubheading(doc, 'Governança nos últimos exercícios', y, 'A presença em um documento anual não comprova continuidade durante todo o período.');
  y = drawMetricRow(doc, [
    { value: String(years.length || governance.coverage?.consulted || 0), label: 'Exercícios consultados', caption: years.join(', ') || 'Período não informado', palette: { foreground: COLORS.blue, background: COLORS.blueSoft } },
    { value: String(countGovernanceEntries(governance.directors)), label: 'Diretores e conselhos', caption: 'Nomes estruturados', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
    { value: String(countGovernanceEntries(governance.shareholders)), label: 'Sócios ou acionistas', caption: 'Posições identificadas', palette: { foreground: COLORS.navy, background: COLORS.cloud } },
  ], y, { height: 61 }) + 18;
  y = drawSubheading(doc, 'Responsáveis pelo processo', y);
  const responsibilityWidth = (PAGE.contentWidth - 8) / 2;
  [
    { label: 'ANALISTA RESPONSÁVEL', value: analyst, caption: `Análise iniciada em ${formatDateTime(diligence.dataAnalise)}` },
    { label: 'REVISOR DESIGNADO', value: reviewer, caption: diligence.completedAt ? `Conclusão em ${formatDateTime(diligence.completedAt)}` : 'Conclusão formal ainda não registrada' },
  ].forEach((item, index) => {
    const x = PAGE.left + index * (responsibilityWidth + 8);
    doc.roundedRect(x, y, responsibilityWidth, 78, 9).fillAndStroke(COLORS.cloud, COLORS.line);
    doc.fillColor(COLORS.muted).font('Courier-Bold').fontSize(6).text(item.label, x + 13, y + 12, { width: responsibilityWidth - 26, characterSpacing: 0.25 });
    doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(9).text(clampText(item.value, 56), x + 13, y + 29, { width: responsibilityWidth - 26 });
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(6.6).text(cleanText(item.caption), x + 13, y + 51, { width: responsibilityWidth - 26, lineGap: 1.2 });
  });
  y += 96;
  y = drawSubheading(doc, 'Trilha resumida de auditoria', y, `${timeline.length} evento(s) preservado(s) no sistema.`);
  if (timeline.length === 0) {
    y = drawEmptyState(doc, 'Sem eventos de auditoria', 'Nenhum evento foi registrado para esta diligência.', y, 66);
  } else {
    timelineTail.forEach((event, index) => {
      const rowHeight = 31;
      doc.circle(PAGE.left + 7, y + 12, 3).fill(index === timelineTail.length - 1 ? COLORS.gold : COLORS.blue);
      if (index < timelineTail.length - 1) {
        doc.strokeColor(COLORS.line).lineWidth(0.8).moveTo(PAGE.left + 7, y + 15).lineTo(PAGE.left + 7, y + rowHeight + 5).stroke();
      }
      doc.fillColor(COLORS.muted).font('Courier').fontSize(6.2).text(formatDateTime(event.time), PAGE.left + 20, y + 4, { width: 110 });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(7.1).text(clampText(event.txt, 132), PAGE.left + 135, y + 4, { width: 356, height: 25, lineGap: 1.2 });
      y += rowHeight;
    });
  }
  drawCallout(doc, {
    y: Math.max(y + 10, 680),
    minHeight: 63,
    palette: { foreground: COLORS.navy, background: COLORS.cloud, border: COLORS.line },
    title: 'Formalização da decisão',
    body: diligence.status === 'completed' ? 'A diligência consta como concluída. A decisão administrativa deve permanecer vinculada ao registro, à versão emitida e à trilha de revisão.' : 'Esta é uma prévia. Antes de concluir, designe o revisor, trate as hipóteses pendentes e registre a justificativa da decisão no workflow.',
    titleSize: 9,
    bodySize: 7.1,
  });
}

const ReportSections = {
  renderReport(doc, diligence, reportNumber, { isPreview = false, emittedAt = new Date().toISOString() } = {}) {
    drawCover(doc, diligence, reportNumber, isPreview, emittedAt);
    drawExecutivePage(doc, diligence);
    drawCompanyPage(doc, diligence);
    drawCoveragePage(doc, diligence);
    drawIntegrityPage(doc, diligence);
    drawEvidencePage(doc, diligence);
    drawWorkflowPage(doc, diligence);
  },

  renderPageFooter(doc, pageNumber, totalPages, reportNumber, emittedAt) {
    drawFooter(doc, pageNumber, totalPages, reportNumber, emittedAt, pageNumber === 1);
  },
};

module.exports = { ReportSections, getCoverageRows };
