// ==========================================================
// DILIGÊNCIA 360 — Formulário de Diligência de SUAPE em PDF
//
// Reproduz a aba "Avaliação de Integridade" da planilha oficial: o
// mesmo título, os mesmos cinco blocos numerados, as mesmas perguntas
// com Sim/Não, o nível de maturidade, o plano de ação e a tabela de
// critérios. É o documento que o analista anexa ao processo, e por isso
// a ordem e a redação seguem o modelo, não a conveniência da tela.
//
// ESTE MÓDULO NÃO CALCULA NADA. A classificação, a maturidade e o plano
// de ação chegam prontos de quem já os apura — o gerador da linha do
// Mapa de Risco, no cliente. Reimplementar as fórmulas aqui criaria uma
// segunda verdade, e um PDF que discorda da tela é pior do que um PDF
// que não existe.
// ==========================================================

const { PAGE, COLORS, cleanText } = require('./report-theme');

const CONTENT_WIDTH = PAGE.contentWidth;
const LEFT = PAGE.left;
const BOTTOM_LIMIT = PAGE.height - PAGE.bottom;

const RISK_PALETTE = {
  'Muito Alto': { fg: COLORS.red, bg: COLORS.redSoft },
  Alto: { fg: COLORS.red, bg: COLORS.redSoft },
  'Médio': { fg: COLORS.amber, bg: COLORS.amberSoft },
  Baixo: { fg: COLORS.green, bg: COLORS.greenSoft },
};

/** Quebra a página quando o bloco seguinte não cabe inteiro. */
function ensureSpace(doc, needed) {
  if (doc.y + needed > BOTTOM_LIMIT) {
    doc.addPage();
    doc.y = PAGE.top;
  }
}

function heading(doc, text) {
  ensureSpace(doc, 40);
  doc.fillColor(COLORS.navy).font('Helvetica-Bold').fontSize(11).text(text, LEFT, doc.y, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.4);
}

/** Faixa numerada dos blocos 01 a 05, como na coluna B da planilha. */
function blockHeader(doc, numero, titulo) {
  ensureSpace(doc, 46);
  const y = doc.y;
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, 22, 3).fill(COLORS.navy);
  doc.fillColor(COLORS.gold).font('Helvetica-Bold').fontSize(9).text(numero, LEFT + 10, y + 7, {
    width: 22,
  });
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9.5).text(titulo, LEFT + 34, y + 7, {
    width: CONTENT_WIDTH - 44,
  });
  doc.y = y + 30;
}

/** Par rótulo/valor das informações cadastrais, em duas colunas. */
function fieldGrid(doc, pares) {
  const colunaLargura = (CONTENT_WIDTH - 14) / 2;
  const larguraInterna = colunaLargura - 16;

  for (let i = 0; i < pares.length; i += 2) {
    const linha = pares.slice(i, i + 2);

    // O rótulo pode ocupar duas linhas — "Nível de maturidade do
    // programa de integridade do terceiro (0 a 100%)" ocupa. Com o
    // valor num deslocamento fixo, ele encavalava no rótulo. Aqui cada
    // célula mede o próprio rótulo antes de posicionar o valor.
    const celulas = linha.map(([rotulo, valor]) => {
      const rotuloTexto = String(rotulo).toUpperCase();
      const alturaRotulo = doc.font('Helvetica-Bold').fontSize(6.5)
        .heightOfString(rotuloTexto, { width: larguraInterna });
      const alturaValor = doc.font('Helvetica').fontSize(9)
        .heightOfString(cleanText(valor), { width: larguraInterna });
      return { rotuloTexto, valor, alturaRotulo, alturaValor };
    });

    const altura = Math.max(...celulas.map((c) => c.alturaRotulo + c.alturaValor)) + 14;

    ensureSpace(doc, altura + 6);
    const y = doc.y;

    celulas.forEach((celula, indice) => {
      const x = LEFT + indice * (colunaLargura + 14);
      doc.roundedRect(x, y, colunaLargura, altura, 3).fillAndStroke(COLORS.cloud, COLORS.line);
      doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6.5)
        .text(celula.rotuloTexto, x + 8, y + 5, { width: larguraInterna });
      doc.fillColor(COLORS.ink).font('Helvetica').fontSize(9)
        .text(cleanText(celula.valor), x + 8, y + 7 + celula.alturaRotulo, { width: larguraInterna });
    });

    doc.y = y + altura + 6;
  }
}

/**
 * Uma pergunta do questionário com as colunas Sim e Não.
 *
 * Item sem resposta não recebe marca em nenhuma das duas colunas e
 * aparece assinalado como pendente: no modelo, "não" é uma resposta do
 * terceiro, e transformar silêncio em "não" inventaria declaração que
 * ninguém prestou.
 */
function questionRow(doc, codigo, texto, resposta) {
  const larguraTexto = CONTENT_WIDTH - 96;
  const alturaTexto = doc.font('Helvetica').fontSize(8.5)
    .heightOfString(cleanText(texto), { width: larguraTexto - 30 });
  const altura = Math.max(alturaTexto + 14, 30);

  ensureSpace(doc, altura + 4);
  const y = doc.y;

  doc.rect(LEFT, y, CONTENT_WIDTH, altura).fillAndStroke(COLORS.white, COLORS.line);

  doc.fillColor(COLORS.blue).font('Helvetica-Bold').fontSize(8)
    .text(codigo, LEFT + 8, y + 7, { width: 24 });
  doc.fillColor(COLORS.ink).font('Helvetica').fontSize(8.5)
    .text(cleanText(texto), LEFT + 34, y + 7, { width: larguraTexto - 30 });

  const colunas = [
    { rotulo: 'Sim', marcado: resposta === true, x: LEFT + CONTENT_WIDTH - 96 },
    { rotulo: 'Não', marcado: resposta === false, x: LEFT + CONTENT_WIDTH - 48 },
  ];

  for (const coluna of colunas) {
    doc.rect(coluna.x, y, 48, altura).stroke(COLORS.line);
    doc.fillColor(COLORS.muted).font('Helvetica-Bold').fontSize(6)
      .text(coluna.rotulo.toUpperCase(), coluna.x, y + 5, { width: 48, align: 'center' });
    if (coluna.marcado) {
      doc.fillColor(coluna.rotulo === 'Sim' ? COLORS.red : COLORS.green)
        .font('Helvetica-Bold').fontSize(12)
        .text('X', coluna.x, y + altura / 2 - 3, { width: 48, align: 'center' });
    }
  }

  if (resposta === null || resposta === undefined) {
    doc.fillColor(COLORS.amber).font('Helvetica-Bold').fontSize(6)
      .text('SEM RESPOSTA', LEFT + CONTENT_WIDTH - 96, y + altura - 9, { width: 96, align: 'center' });
  }

  doc.y = y + altura;
}

function renderHeader(doc, dados) {
  doc.rect(0, 0, PAGE.width, 78).fill(COLORS.navy);
  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(14)
    .text('FORMULÁRIO DE DILIGÊNCIA DE SUAPE', LEFT, 22, { width: CONTENT_WIDTH });
  doc.fillColor(COLORS.gold).font('Helvetica').fontSize(8.5)
    .text('Avaliação de Integridade de Terceiros · Complexo Industrial Portuário de Suape', LEFT, 44, {
      width: CONTENT_WIDTH,
    });
  doc.fillColor('#8FA6BD').font('Helvetica').fontSize(7.5)
    .text(`Emitido em ${dados.emitidoEm}`, LEFT, 58, { width: CONTENT_WIDTH });

  doc.y = 96;
}

function renderClassification(doc, dados) {
  const classificacao = dados.classificacao;
  const palette = RISK_PALETTE[classificacao] || { fg: COLORS.muted, bg: COLORS.neutralSoft };

  ensureSpace(doc, 56);
  const y = doc.y;
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, 44, 4).fillAndStroke(palette.bg, palette.fg);

  doc.fillColor(COLORS.ink).font('Helvetica-Bold').fontSize(8.5)
    .text('Classificação do terceiro quanto ao risco associado a fraude e corrupção:', LEFT + 12, y + 10, {
      width: CONTENT_WIDTH - 150,
    });

  doc.fillColor(palette.fg).font('Helvetica-Bold').fontSize(15)
    .text(classificacao || 'Pendente', LEFT + CONTENT_WIDTH - 140, y + 12, {
      width: 128,
      align: 'right',
    });

  doc.y = y + 52;

  if (!classificacao) {
    doc.fillColor(COLORS.amber).font('Helvetica-Oblique').fontSize(8)
      .text(
        'A classificação depende das respostas do Questionário de Diligência do terceiro. '
        + 'Enquanto itens obrigatórios seguirem sem resposta, o formulário permanece incompleto.',
        LEFT, doc.y, { width: CONTENT_WIDTH },
      );
    doc.moveDown(0.8);
  }
}

function renderIdentification(doc, dados) {
  heading(doc, '1. Perfil da Empresa — 1.1 Informações Cadastrais');

  const empresa = dados.empresa || {};
  fieldGrid(doc, [
    ['Razão Social e Tipo Societário', empresa.razaoSocial],
    ['CNPJ', empresa.cnpj],
    ['Objeto Social', empresa.objetoSocial],
    ['Ramo de Atividade', empresa.ramoAtividade],
    ['Data da Constituição da Sociedade', empresa.dataConstituicao],
    ['Nº de Empregados', empresa.numeroEmpregados],
    ['Endereço', empresa.endereco],
    ['Sítio Eletrônico', empresa.sitioEletronico],
    ['Países e Localidades nos quais a Pessoa Jurídica atua', empresa.paises],
    ['Serviço a ser Prestado', empresa.servico],
  ]);

  doc.moveDown(0.5);
}

function renderBlocks(doc, dados) {
  for (const bloco of dados.blocos || []) {
    blockHeader(doc, bloco.numero, bloco.titulo);

    for (const pergunta of bloco.perguntas || []) {
      questionRow(doc, pergunta.codigo, pergunta.texto, pergunta.resposta);
    }

    if (bloco.nota) {
      doc.moveDown(0.3);
      doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(7.5)
        .text(cleanText(bloco.nota), LEFT, doc.y, { width: CONTENT_WIDTH });
    }

    doc.moveDown(0.8);
  }
}

function renderMaturity(doc, dados) {
  const maturidade = dados.maturidade || {};
  blockHeader(doc, '04', 'Informações do Programa de Integridade');

  fieldGrid(doc, [
    ['Nível de maturidade do programa de integridade do terceiro (0 a 100%)', maturidade.percentual],
    ['Risco de maturidade', maturidade.nivel],
  ]);

  doc.moveDown(0.6);
}

function renderActionPlan(doc, dados) {
  blockHeader(doc, '05', 'Plano de Ação recomendado');

  const plano = cleanText(dados.planoDeAcao, '');
  if (!plano) {
    doc.fillColor(COLORS.muted).font('Helvetica-Oblique').fontSize(8.5)
      .text(
        'O plano de ação é definido pela classificação, que ainda não pôde ser apurada.',
        LEFT, doc.y, { width: CONTENT_WIDTH },
      );
    doc.moveDown(0.8);
    return;
  }

  // O texto oficial vem com quebras de linha entre os itens romanos, e
  // elas são a estrutura do plano: `cleanText` as comeria.
  const linhas = String(dados.planoDeAcao).split(/\r?\n/).map((linha) => linha.trim()).filter(Boolean);
  const altura = linhas.reduce(
    (total, linha) => total + doc.font('Helvetica').fontSize(8.5)
      .heightOfString(linha, { width: CONTENT_WIDTH - 24 }) + 3,
    18,
  );

  ensureSpace(doc, altura + 8);
  const y = doc.y;
  doc.roundedRect(LEFT, y, CONTENT_WIDTH, altura, 4).fillAndStroke(COLORS.blueSoft, COLORS.blue);

  let cursor = y + 9;
  linhas.forEach((linha, indice) => {
    doc.fillColor(indice === 0 ? COLORS.navy : COLORS.ink)
      .font(indice === 0 ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(8.5)
      .text(linha, LEFT + 12, cursor, { width: CONTENT_WIDTH - 24 });
    cursor = doc.y + 3;
  });

  doc.y = y + altura + 10;
}

function renderCriteria(doc, dados) {
  const criterios = dados.criterios || [];
  if (criterios.length === 0) return;

  heading(doc, 'Critérios de classificação');

  for (const item of criterios) {
    const texto = String(item.criterio || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ');
    const alturaTexto = doc.font('Helvetica').fontSize(8)
      .heightOfString(texto, { width: CONTENT_WIDTH - 108 });
    const altura = Math.max(alturaTexto + 12, 26);

    ensureSpace(doc, altura + 3);
    const y = doc.y;
    const palette = RISK_PALETTE[item.grupo] || { fg: COLORS.muted, bg: COLORS.neutralSoft };

    doc.rect(LEFT, y, CONTENT_WIDTH, altura).fillAndStroke(COLORS.white, COLORS.line);
    doc.rect(LEFT, y, 88, altura).fill(palette.bg);
    doc.fillColor(palette.fg).font('Helvetica-Bold').fontSize(8)
      .text(item.grupo, LEFT + 6, y + 6, { width: 76 });
    doc.fillColor(COLORS.slate).font('Helvetica').fontSize(8)
      .text(texto, LEFT + 96, y + 6, { width: CONTENT_WIDTH - 108 });

    doc.y = y + altura;
  }

  doc.moveDown(0.8);
}

function renderProcessData(doc, dados) {
  const processo = dados.processo || {};
  const pares = [
    ['Registro nº', processo.registro],
    ['Ano', processo.ano],
    ['Diretoria', processo.diretoria],
    ['Gestor(a)', processo.gestor],
    ['Valor da contratação', processo.valor],
    ['Data de entrada', processo.dataEntrada],
    ['Data de saída', processo.dataSaida],
    ['Processo SEI', processo.processoSei],
  ].filter(([, valor]) => cleanText(valor, '') !== '');

  if (pares.length === 0) return;

  heading(doc, 'Dados do processo');
  fieldGrid(doc, pares);
  doc.moveDown(0.5);
}

function renderClosing(doc) {
  ensureSpace(doc, 60);
  doc.moveDown(0.5);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
    .text(
      'Documento gerado pelo Diligência 360 a partir do Questionário de Diligência informado pelo terceiro e '
      + 'das fontes públicas consultadas. As respostas são declarações do terceiro e não foram, por si sós, '
      + 'confirmadas documentalmente. Ausência de achado em fonte pública não constitui atestado de idoneidade.',
      LEFT, doc.y, { width: CONTENT_WIDTH, align: 'justify' },
    );
}

function renderPageFooter(doc, pagina, total, dados) {
  const y = PAGE.height - 34;
  doc.rect(LEFT, y - 6, CONTENT_WIDTH, 0.6).fill(COLORS.line);
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
    .text(
      `${cleanText(dados.empresa?.razaoSocial, 'Terceiro')} · ${cleanText(dados.empresa?.cnpj, '')}`,
      LEFT, y, { width: CONTENT_WIDTH / 2 },
    );
  doc.fillColor(COLORS.muted).font('Helvetica').fontSize(7)
    .text(`Página ${pagina} de ${total}`, LEFT + CONTENT_WIDTH / 2, y, {
      width: CONTENT_WIDTH / 2,
      align: 'right',
    });
}

const IntegrityFormSections = {
  renderForm(doc, dados) {
    renderHeader(doc, dados);
    renderIdentification(doc, dados);
    renderClassification(doc, dados);
    renderBlocks(doc, dados);
    renderMaturity(doc, dados);
    renderActionPlan(doc, dados);
    renderCriteria(doc, dados);
    renderProcessData(doc, dados);
    renderClosing(doc);
  },
  renderPageFooter,
};

module.exports = { IntegrityFormSections };
