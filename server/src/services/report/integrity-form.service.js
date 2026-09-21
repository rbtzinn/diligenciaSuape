// ==========================================================
// DILIGÊNCIA 360 — Emissão do Formulário de Diligência preenchido
//
// O PDF é montado sob demanda e devolvido no mesmo pedido. Nada é
// gravado: não há registro na planilha, não há número de emissão, não
// há versão. É um documento para baixar, e guardar cópia dele criaria
// duas verdades sobre a mesma avaliação — a do arquivo salvo e a da
// diligência, que continua sendo revista.
//
// O serviço valida e normaliza o que recebe, e não calcula nada: a
// classificação, a maturidade e o plano de ação são apurados por quem
// tem as fórmulas oficiais.
// ==========================================================

const { IntegrityFormSections } = require('./integrity-form.sections');

const RISCOS_VALIDOS = new Set(['Muito Alto', 'Alto', 'Médio', 'Baixo']);
const MAX_TEXTO = 4_000;
const MAX_PERGUNTAS_POR_BLOCO = 40;
const MAX_BLOCOS = 12;

function texto(valor, limite = 400) {
  if (valor === null || valor === undefined) return '';
  return String(valor).replace(/\u0000/g, '').trim().slice(0, limite);
}

/** Resposta do terceiro: só `true`, `false` ou ausência. */
function resposta(valor) {
  return valor === true || valor === false ? valor : null;
}

function normalizarBlocos(entrada) {
  if (!Array.isArray(entrada)) return [];
  return entrada.slice(0, MAX_BLOCOS).map((bloco) => ({
    numero: texto(bloco?.numero, 4),
    titulo: texto(bloco?.titulo, 160),
    nota: texto(bloco?.nota, 400),
    perguntas: Array.isArray(bloco?.perguntas)
      ? bloco.perguntas.slice(0, MAX_PERGUNTAS_POR_BLOCO).map((pergunta) => ({
        codigo: texto(pergunta?.codigo, 12),
        texto: texto(pergunta?.texto, 700),
        resposta: resposta(pergunta?.resposta),
      }))
      : [],
  }));
}

function normalizar(entrada) {
  const empresa = entrada?.empresa || {};
  const processo = entrada?.processo || {};
  const maturidade = entrada?.maturidade || {};

  const razaoSocial = texto(empresa.razaoSocial, 200);
  if (!razaoSocial) {
    const erro = new Error('Informe a razão social do terceiro para emitir o formulário.');
    erro.status = 400;
    throw erro;
  }

  const classificacao = texto(entrada?.classificacao, 20);

  return {
    emitidoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }),
    // Classificação fora do vocabulário oficial vira ausência: o
    // formulário não pode exibir uma faixa que a planilha não tem.
    classificacao: RISCOS_VALIDOS.has(classificacao) ? classificacao : '',
    empresa: {
      razaoSocial,
      cnpj: texto(empresa.cnpj, 30),
      objetoSocial: texto(empresa.objetoSocial, 600),
      ramoAtividade: texto(empresa.ramoAtividade, 300),
      dataConstituicao: texto(empresa.dataConstituicao, 40),
      numeroEmpregados: texto(empresa.numeroEmpregados, 40),
      endereco: texto(empresa.endereco, 400),
      sitioEletronico: texto(empresa.sitioEletronico, 200),
      paises: texto(empresa.paises, 300),
      servico: texto(empresa.servico, 400),
    },
    blocos: normalizarBlocos(entrada?.blocos),
    maturidade: {
      percentual: texto(maturidade.percentual, 20),
      nivel: texto(maturidade.nivel, 20),
    },
    planoDeAcao: texto(entrada?.planoDeAcao, MAX_TEXTO),
    criterios: Array.isArray(entrada?.criterios)
      ? entrada.criterios.slice(0, 8).map((item) => ({
        grupo: texto(item?.grupo, 20),
        criterio: texto(item?.criterio, 900),
      }))
      : [],
    processo: {
      registro: texto(processo.registro, 40),
      ano: texto(processo.ano, 8),
      diretoria: texto(processo.diretoria, 40),
      gestor: texto(processo.gestor, 120),
      valor: texto(processo.valor, 40),
      dataEntrada: texto(processo.dataEntrada, 20),
      dataSaida: texto(processo.dataSaida, 20),
      processoSei: texto(processo.processoSei, 60),
    },
  };
}

/** Nome do arquivo: CNPJ quando houver, porque razão social repete. */
function nomeDoArquivo(dados) {
  const identificador = dados.empresa.cnpj.replace(/\D/g, '')
    || dados.empresa.razaoSocial.normalize('NFD').replace(/[^\w]/g, '').slice(0, 20)
    || 'terceiro';
  const data = new Date().toISOString().slice(0, 10);
  return `avaliacao-integridade-${identificador}-${data}.pdf`;
}

const IntegrityFormService = {
  normalizar,

  /**
   * Monta o PDF em memória e devolve o buffer.
   *
   * @returns {Promise<{buffer: Buffer, fileName: string}>}
   */
  async generate(entrada) {
    const dados = normalizar(entrada);

    // `pdf-parse` derrubou a função inteira em produção por ser
    // carregado no topo de um arquivo do caminho de boot. O `pdfkit`
    // hoje carrega sem erro, mas a emissão de PDF é funcionalidade de
    // uma rota só: carregá-lo aqui mantém a falha dele restrita a ela.
    const PDFDocument = require('pdfkit');

    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      autoFirstPage: true,
      info: {
        Title: `Avaliação de Integridade — ${dados.empresa.razaoSocial}`,
        Author: 'Complexo Industrial Portuário de Suape • Diligência 360',
        Subject: 'Formulário de Diligência de SUAPE preenchido',
        Keywords: 'SUAPE, compliance, diligência, integridade, terceiros',
      },
    });

    return new Promise((resolve, reject) => {
      const pedacos = [];
      doc.on('data', (pedaco) => pedacos.push(pedaco));
      doc.on('end', () => resolve({ buffer: Buffer.concat(pedacos), fileName: nomeDoArquivo(dados) }));
      doc.on('error', reject);

      try {
        IntegrityFormSections.renderForm(doc, dados);

        const paginas = doc.bufferedPageRange();
        for (let i = paginas.start; i < paginas.start + paginas.count; i += 1) {
          doc.switchToPage(i);
          IntegrityFormSections.renderPageFooter(doc, i + 1, paginas.count, dados);
        }

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  },
};

module.exports = { IntegrityFormService };
