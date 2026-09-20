// ==========================================================
// DILIGÊNCIA 360 — Rotas de Histórico e Dossiês Permanentes
// ==========================================================

const express = require('express');
const { DiligenceHistoryService } = require('../services/diligence-history.service');
const { NewsRepository } = require('../repositories/news.repository');
const { RiskMapRepository } = require('../repositories/risk-map.repository');
const { EvidenceCenterService } = require('../services/evidence-center.service');
const { authenticate } = require('../middlewares/auth.middleware');
const { isScoreWithinLevel } = require('../services/risk-assessment.service');
const { parseSuapeQuestionnaire } = require('../services/questionnaire-parser.service');

const router = express.Router();

router.use(authenticate);

// Rota protegida para analisar questionário de diligência (.pdf, .xlsx, .xls)
router.post('/parse-questionnaire', async (req, res) => {
  try {
    const { fileBase64, filename } = req.body || {};

    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ ok: false, erro: 'Arquivo base64 não fornecido ou em formato inválido.' });
    }

    const safeFilename = String(filename || 'questionario.pdf').trim();
    const ext = safeFilename.toLowerCase().slice(safeFilename.lastIndexOf('.'));
    if (!['.pdf', '.xlsx', '.xls'].includes(ext)) {
      return res.status(400).json({
        ok: false,
        erro: `Extensão de arquivo "${ext}" não permitida. Apenas documentos PDF (.pdf) ou planilhas Excel (.xlsx, .xls) são aceitos.`,
      });
    }

    // Limite de segurança no payload Base64 (máx ~20 MB base64 correspondente a ~15 MB binário)
    if (fileBase64.length > 20 * 1024 * 1024) {
      return res.status(413).json({
        ok: false,
        erro: 'O arquivo excede o limite máximo permitido de 15 MB para processamento de questionário.',
      });
    }

    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch {
      return res.status(400).json({ ok: false, erro: 'Codificação Base64 inválida ou corrompida.' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ ok: false, erro: 'O arquivo enviado está vazio.' });
    }

    const parsed = await parseSuapeQuestionnaire(buffer, safeFilename);
    return res.json({ ok: true, filename: safeFilename, ...parsed });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao processar questionário:', err.message);
    return res.status(422).json({
      ok: false,
      erro: `Falha ao analisar o questionário (${err.message})`,
    });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = req.body || {};
    if (req.user) {
      payload.createdById = req.user.id;
      payload.createdBy = {
        id: req.user.id,
        firebaseUid: req.user.firebaseUid,
        name: req.user.name,
        email: req.user.email,
      };
      payload.createdByEmail = req.user.email;
      if (Array.isArray(payload.timeline)) {
        payload.timeline.unshift({
          time: new Date().toISOString(),
          txt: `Diligência iniciada por ${req.user.name}.`,
          tipo: 'info',
          userId: req.user.id,
        });
      }
    }

    const result = await DiligenceHistoryService.saveDiligence(payload);

    if (!result.persisted) {
      return res.status(503).json({
        ok: false,
        persisted: false,
        id: result.id,
        erro: result.aviso || 'Google Sheets indisponível. Dossiê não persistido permanentemente.',
      });
    }

    return res.status(201).json(result);
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao salvar diligência:', err.message);
    return res.status(500).json({ ok: false, persisted: false, erro: err.message });
  }
});

router.patch('/:id/media', async (req, res) => {
  const { adverseMedia, automaticRisk } = req.body || {};
  if (!Array.isArray(adverseMedia?.results) || adverseMedia.results.length > 2000
    || !Number.isFinite(automaticRisk?.score) || automaticRisk.score < 0 || automaticRisk.score > 100
    || !Array.isArray(automaticRisk?.detalhes)) {
    return res.status(400).json({ ok: false, erro: 'Publicações ou avaliação automática inválidas.' });
  }
  try {
    const data = await DiligenceHistoryService.saveMedia(req.params.id, adverseMedia, automaticRisk, req.user);

    // A aba de publicações é um espelho legível do que já foi salvo no
    // retrato. Ela vem depois e não entra no `try` do histórico: se a
    // planilha recusar a aba, o dado de verdade já está gravado, e o
    // analista precisa saber disso em vez de ver um erro de salvamento.
    const espelho = await NewsRepository.salvarPublicacoes({
      diligencia: { id: req.params.id, cnpj: data?.cnpj, razaoSocial: data?.razaoSocial },
      publicacoes: adverseMedia.results,
    });

    return res.json({
      ok: true,
      data,
      planilhaDeNoticias: espelho.ok
        ? { ok: true, linhas: espelho.linhas, aba: NewsRepository.ABA, abaCriada: espelho.abaCriada }
        : { ok: false, aba: NewsRepository.ABA, erro: espelho.erro },
    });
  } catch (error) {
    return res.status(503).json({ ok: false, erro: 'Não foi possível salvar no histórico. As publicações continuam nesta tela.' });
  }
});

// ==========================================================
// Mapa de Risco — a linha de 40 colunas da avaliação de integridade
//
// O cabeçalho vem do cliente junto com os valores, e não daqui: o
// layout oficial mora no gerador da linha, no frontend, e duplicá-lo no
// servidor criaria duas verdades que envelhecem em ritmos diferentes. O
// repositório compara o cabeçalho recebido com o que já está na aba e
// recusa a gravação quando divergem.
// ==========================================================
router.post('/:id/mapa-de-risco', async (req, res) => {
  const { cabecalho, valores } = req.body || {};
  const tamanhoEsperado = RiskMapRepository.COLUNAS_OFICIAIS;
  const listaDeTextos = (valor) => Array.isArray(valor)
    && valor.length === tamanhoEsperado
    && valor.every((item) => typeof item === 'string');

  if (!listaDeTextos(cabecalho) || !listaDeTextos(valores)) {
    return res.status(400).json({
      ok: false,
      erro: `Informe cabeçalho e valores com ${tamanhoEsperado} colunas de texto.`,
    });
  }

  const resultado = await RiskMapRepository.salvarLinha({
    diligenciaId: req.params.id,
    cabecalho,
    valores,
  });

  return res.status(resultado.ok ? 200 : 503).json({
    ...resultado,
    aba: RiskMapRepository.ABA,
  });
});

router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 100;
    const filters = {
      status: req.query.status,
      responsibleId: req.query.responsibleId,
      reviewerId: req.query.reviewerId,
      cnpj: req.query.cnpj,
      level: req.query.level,
    };
    const list = await DiligenceHistoryService.listDiligences(limit, filters);
    return res.json({ ok: true, count: list.length, items: list });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao listar histórico:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const diligence = await DiligenceHistoryService.getDiligenceById(id);

    if (!diligence) {
      return res.status(404).json({ ok: false, erro: 'Dossiê de diligência não encontrado.' });
    }

    return res.json({ ok: true, data: diligence });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao recuperar dossiê:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.post('/:id/evidences', async (req, res) => {
  try {
    const result = await EvidenceCenterService.addEvidence(req.params.id, req.body || {}, req.user);
    DiligenceHistoryService.cacheSnapshot(result.snapshot);
    return res.status(201).json({
      ok: true,
      data: result.evidence,
      evidenceCenter: result.snapshot.evidenceCenter,
      egos: result.snapshot.egos,
    });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao adicionar evidência:', err.message);
    return res.status(err.status || 400).json({ ok: false, erro: err.message });
  }
});

router.patch('/:id/evidences/:evidenceId', async (req, res) => {
  try {
    const result = await EvidenceCenterService.updateEvidence(
      req.params.id,
      req.params.evidenceId,
      req.body || {},
      req.user,
    );
    DiligenceHistoryService.cacheSnapshot(result.snapshot);
    return res.json({
      ok: true,
      data: result.evidence,
      evidenceCenter: result.snapshot.evidenceCenter,
      egos: result.snapshot.egos,
    });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao revisar evidência:', err.message);
    return res.status(err.status || 400).json({ ok: false, erro: err.message });
  }
});

router.post('/:id/reviews', async (req, res) => {
  try {
    const { id } = req.params;
    if (req.body?.entityType === 'egos_finding' && String(req.body?.justification || '').trim().length < 5) {
      return res.status(400).json({ ok: false, erro: 'Informe uma justificativa objetiva para registrar a decisão.' });
    }
    const reviewData = {
      ...req.body,
      diligenceId: id,
      user: req.user,
      userId: req.user.id,
      reviewedBy: req.user ? req.user.name : (req.body.reviewedBy || 'Auditor Compliance'),
    };
    const review = await DiligenceHistoryService.recordReview(reviewData);
    return res.status(201).json({ ok: true, data: review });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao registrar revisão:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.patch('/:id/risk', async (req, res) => {
  try {
    const score = Number(req.body?.score);
    const level = String(req.body?.level || '').trim();
    const justification = String(req.body?.justification || '').trim();
    const allowedLevels = new Set(['Atenção Baixa', 'Atenção Moderada', 'Atenção Elevada', 'Atenção Crítica']);

    if (!Number.isFinite(score) || score < 0 || score > 100) {
      return res.status(400).json({ ok: false, erro: 'Informe uma pontuação entre 0 e 100.' });
    }
    if (!allowedLevels.has(level)) {
      return res.status(400).json({ ok: false, erro: 'Selecione um nível de risco válido.' });
    }
    if (!isScoreWithinLevel(level, score)) {
      return res.status(400).json({ ok: false, erro: 'A pontuação informada não pertence à faixa do nível selecionado.' });
    }
    if (justification.length < 10) {
      return res.status(400).json({ ok: false, erro: 'Registre uma justificativa objetiva com pelo menos 10 caracteres.' });
    }

    const risk = await DiligenceHistoryService.overrideRisk({
      diligenceId: req.params.id,
      user: req.user,
      userId: req.user.id,
      score,
      level,
      justification,
      reviewedBy: req.user?.name || 'Auditor Compliance SUAPE',
    });
    return res.json({ ok: true, data: risk });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao ajustar risco:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await DiligenceHistoryService.deleteDiligence(id, req.user);
    return res.json({ ok: true, message: 'Dossiê removido da visualização; histórico preservado.' });
  } catch (err) {
    console.error('[DiligenceRoutes] Erro ao excluir dossiê:', err.message);
    return res.status(500).json({ ok: false, erro: err.message });
  }
});

module.exports = router;
