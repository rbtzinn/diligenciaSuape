// ==========================================================
// DILIGÊNCIA 360 — Serviço Oficial do DataJud (CNJ)
// Enriquecimento processual por numeração única CNJ
// ==========================================================

const { safeFetch } = require('../utils/safeFetch');

const DATAJUD_API_KEY = process.env.DATAJUD_API_KEY || '';

const BASE_URL = 'https://api-publica.datajud.cnj.jus.br';

// Mapeamento extensível de Tribunais a partir da chave J.TR (Judiciário . Tribunal)
const TRIBUNAL_MAP = {
  // Justiça Estadual (J = 8)
  '8.17': { sigla: 'TJPE', nome: 'Tribunal de Justiça de Pernambuco', alias: 'api_publica_tjpe' },
  '8.02': { sigla: 'TJAL', nome: 'Tribunal de Justiça de Alagoas', alias: 'api_publica_tjal' },
  '8.06': { sigla: 'TJCE', nome: 'Tribunal de Justiça do Ceará', alias: 'api_publica_tjce' },
  '8.15': { sigla: 'TJPB', nome: 'Tribunal de Justiça da Paraíba', alias: 'api_publica_tjpb' },
  '8.20': { sigla: 'TJRN', nome: 'Tribunal de Justiça do Rio Grande do Norte', alias: 'api_publica_tjrn' },
  '8.26': { sigla: 'TJSP', nome: 'Tribunal de Justiça de São Paulo', alias: 'api_publica_tjsp' },
  '8.19': { sigla: 'TJRJ', nome: 'Tribunal de Justiça do Rio de Janeiro', alias: 'api_publica_tjrj' },

  // Justiça Federal (J = 4)
  '4.05': { sigla: 'TRF5', nome: 'Tribunal Regional Federal da 5ª Região', alias: 'api_publica_trf5' },
  '4.01': { sigla: 'TRF1', nome: 'Tribunal Regional Federal da 1ª Região', alias: 'api_publica_trf1' },
  '4.02': { sigla: 'TRF2', nome: 'Tribunal Regional Federal da 2ª Região', alias: 'api_publica_trf2' },
  '4.03': { sigla: 'TRF3', nome: 'Tribunal Regional Federal da 3ª Região', alias: 'api_publica_trf3' },

  // Justiça do Trabalho (J = 5)
  '5.06': { sigla: 'TRT6', nome: 'Tribunal Regional do Trabalho da 6ª Região (PE)', alias: 'api_publica_trt6' },
  '5.01': { sigla: 'TRT1', nome: 'Tribunal Regional do Trabalho da 1ª Região (RJ)', alias: 'api_publica_trt1' },
  '5.02': { sigla: 'TRT2', nome: 'Tribunal Regional do Trabalho da 2ª Região (SP)', alias: 'api_publica_trt2' },
  '5.03': { sigla: 'TRT3', nome: 'Tribunal Regional do Trabalho da 3ª Região (MG)', alias: 'api_publica_trt3' },
};

function formatCNJNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 20) return raw;
  return digits.replace(/^(\d{7})(\d{2})(\d{4})(\d{1})(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6');
}

function validateCNJNumber(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length !== 20) return false;

  try {
    const sequential = digits.substring(0, 7);
    const checkDigits = digits.substring(7, 9);
    const year = digits.substring(9, 13);
    const justiceBranch = digits.substring(13, 14);
    const tribunal = digits.substring(14, 16);
    const origin = digits.substring(16, 20);
    const expected = String(98 - Number(BigInt(`${sequential}${year}${justiceBranch}${tribunal}${origin}00`) % 97n)).padStart(2, '0');
    return expected === checkDigits;
  } catch {
    return false;
  }
}

function resolveTribunal(cleanDigits) {
  if (cleanDigits.length !== 20) return null;
  const j = cleanDigits.substring(13, 14);
  const tr = cleanDigits.substring(14, 16);
  const key = `${j}.${tr}`;

  return TRIBUNAL_MAP[key] || {
    sigla: `Tribunal J.${j}.TR.${tr}`,
    nome: `Tribunal Código ${key}`,
    alias: null,
    suportado: false,
  };
}

function categorizeProcess(classeNome = '', assuntos = []) {
  const text = `${classeNome} ${assuntos.map((a) => a.nome || '').join(' ')}`.toLowerCase();

  if (text.includes('falên') || text.includes('recuperação judicial') || text.includes('concurso de credores')) {
    return { id: 'falencia', label: 'Recuperação / Falência', badgeVariant: 'critical' };
  }
  if (text.includes('improbidade') || text.includes('anticorrupção') || text.includes('civil pública')) {
    return { id: 'improbidade', label: 'Integridade / Improbidade', badgeVariant: 'high' };
  }
  if (text.includes('execução fiscal') || text.includes('dívida ativa') || text.includes('tributári')) {
    return { id: 'fiscal', label: 'Fiscal / Tributário', badgeVariant: 'medium' };
  }
  if (text.includes('trabalh') || text.includes('clt') || text.includes('empregado')) {
    return { id: 'trabalhista', label: 'Trabalhista', badgeVariant: 'medium' };
  }
  if (text.includes('ambient') || text.includes('polui') || text.includes('fauna') || text.includes('flora')) {
    return { id: 'ambiental', label: 'Ambiental', badgeVariant: 'high' };
  }
  if (text.includes('cível') || text.includes('cobrança') || text.includes('indeniza')) {
    return { id: 'civel', label: 'Cível Geral', badgeVariant: 'neutral' };
  }
  return { id: 'outros', label: 'Outras Ações', badgeVariant: 'neutral' };
}

const DatajudService = {
  resolveTribunal,
  formatCNJNumber,
  validateCNJNumber,
  isConfigured() {
    return !!DATAJUD_API_KEY;
  },

  async consultarProcesso(rawNumero) {
    const cleanNumero = String(rawNumero || '').replace(/\D/g, '');

    if (!validateCNJNumber(cleanNumero)) {
      return {
        ok: false,
        status: 400,
        erro: 'Número do processo inválido. Verifique os 20 dígitos e o dígito verificador do padrão CNJ.',
      };
    }

    if (!DATAJUD_API_KEY) {
      return {
        ok: false,
        status: 503,
        semChave: true,
        erro: 'Integração DataJud ainda não configurada no servidor.',
      };
    }

    const tribunalInfo = resolveTribunal(cleanNumero);

    if (!tribunalInfo || !tribunalInfo.alias) {
      return {
        ok: false,
        status: 422,
        erro: `Tribunal ainda não integrado (Código ${cleanNumero.substring(13, 14)}.${cleanNumero.substring(14, 16)}). Suporte ativo para TJPE, TRF5 e TRT6.`,
        tribunal: tribunalInfo?.sigla || 'Não identificado',
      };
    }

    try {
      const response = await safeFetch(`${BASE_URL}/${tribunalInfo.alias}/_search`, {
        method: 'POST',
        headers: {
          Authorization: `APIKey ${DATAJUD_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: {
            match: {
              numeroProcesso: cleanNumero,
            },
          },
          size: 1,
        }),
      });

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          erro: `Falha na consulta ao DataJud (${tribunalInfo.sigla}): HTTP ${response.status}`,
        };
      }

      const resJson = await response.json();
      const hits = resJson?.hits?.hits || [];

      if (hits.length === 0) {
        return {
          ok: false,
          status: 404,
          erro: `Processo ${formatCNJNumber(cleanNumero)} não localizado na base do ${tribunalInfo.sigla}.`,
          tribunal: tribunalInfo.sigla,
          numero: formatCNJNumber(cleanNumero),
        };
      }

      const source = hits[0]._source;

      const classe = {
        codigo: source.classe?.codigo || 0,
        nome: source.classe?.nome || 'Não informada',
      };

      const assuntos = (source.assuntos || []).map((a) => ({
        codigo: a.codigo || 0,
        nome: a.nome || 'Não informado',
      }));

      const categoria = categorizeProcess(classe.nome, assuntos);

      const movimentos = (source.movimentos || []).map((m) => ({
        codigo: m.codigo || 0,
        nome: m.nome || 'Movimentação Processual',
        dataHora: m.dataHora || '',
        complementos: (m.complementosTabelados || []).map((c) => c.descricao || c.nome).filter(Boolean),
      })).sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime());

      // Resposta normalizada estável
      return {
        ok: true,
        status: 200,
        numero: formatCNJNumber(cleanNumero),
        numeroLimpo: cleanNumero,
        tribunal: tribunalInfo.sigla,
        tribunalNome: tribunalInfo.nome,
        grau: source.grau || 'G1',
        classe,
        categoria,
        assuntos,
        orgaoJulgador: {
          codigo: source.orgaoJulgador?.codigo || 0,
          nome: source.orgaoJulgador?.nome || 'Órgão Julgador não informado',
          municipio: source.orgaoJulgador?.municipio || '',
        },
        dataAjuizamento: source.dataAjuizamento || '',
        nivelSigilo: source.nivelSigilo ?? 0,
        sistema: source.sistema?.nome || 'Processo Eletrônico',
        formato: source.formato?.nome || 'Eletrônico',
        ultimaAtualizacao: source.dataHoraUltimaAtualizacao || '',
        totalMovimentos: movimentos.length,
        movimentos,
        fonte: 'CNJ - DataJud (API Pública)',
        consultadoEm: new Date().toISOString(),
      };
    } catch (e) {
      console.error('[DataJud Service] Erro ao consultar processo:', e.message);
      return {
        ok: false,
        status: 500,
        erro: `Erro na comunicação com o DataJud: ${e.message}`,
      };
    }
  },
};

module.exports = DatajudService;
